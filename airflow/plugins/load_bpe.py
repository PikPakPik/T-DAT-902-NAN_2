"""
load_bpe.py
-----------
Charge la Base permanente des equipements (BPE, INSEE) dans la table `devices`.

Pour chaque equipement du CSV : on resout la commune via DEPCOM (`cities.code`),
puis fallback EPCI (`cities.epci`), et on insere une ligne dans `devices`.

La table `devices` est une feuille (aucune table ne la reference) : on la
TRUNCATE avant chargement pour que le DAG soit idempotent.

Dependances : psycopg2-binary.
"""

from __future__ import annotations

import csv
import logging
import math
import os

import psycopg2
import psycopg2.extras

logger = logging.getLogger(__name__)

DOWNLOAD_DIR = os.environ.get("BPE_DOWNLOAD_DIR", "/opt/airflow/data/bpe")


def get_conn() -> psycopg2.extensions.connection:
    if os.environ.get("AIRFLOW__DATABASE__SQL_ALCHEMY_CONN"):
        from airflow.providers.postgres.hooks.postgres import PostgresHook

        return PostgresHook(postgres_conn_id="postgres_default").get_conn()
    return psycopg2.connect(
        host=os.environ.get("POSTGIS_HOST", "postgis"),
        port=int(os.environ.get("POSTGIS_PORT", 5432)),
        dbname=os.environ.get("POSTGRES_DB", "homepedia"),
        user=os.environ.get("POSTGRES_USER", "postgres"),
        password=os.environ.get("POSTGRES_PASSWORD", "postgres"),
    )


def _epci_to_city_id(cur: psycopg2.extensions.cursor) -> dict[str, int]:
    """Mapping {code EPCI -> id commune}. Un EPCI regroupe plusieurs communes :
    on garde un id deterministe (le plus petit) par EPCI."""
    cur.execute(
        "SELECT epci, min(id) FROM cities WHERE epci IS NOT NULL AND epci <> '' GROUP BY epci"
    )
    return {row[0]: row[1] for row in cur.fetchall()}


def _code_to_city_id(cur: psycopg2.extensions.cursor) -> dict[str, int]:
    """Mapping {code INSEE commune -> id commune}."""
    cur.execute(
        """
        SELECT upper(lpad(trim(code), 5, '0')), min(id)
        FROM cities
        WHERE code IS NOT NULL AND trim(code) <> ''
        GROUP BY upper(lpad(trim(code), 5, '0'))
        """
    )
    return {row[0]: row[1] for row in cur.fetchall()}


def _clean_code(value: str | None) -> str:
    value = (value or "").strip().upper()
    if not value:
        return ""
    if value.isdigit():
        return value.zfill(5)
    return value


def _parse_float(value: str | None) -> float | None:
    value = (value or "").strip().replace(",", ".")
    if not value:
        return None
    try:
        parsed = float(value)
    except ValueError:
        return None
    if not math.isfinite(parsed):
        return None
    return parsed


def _resolve_city_id(
    row: dict[str, str],
    code_to_city: dict[str, int],
    epci_to_city: dict[str, int],
    stats: dict[str, int],
) -> int | None:
    city_id = code_to_city.get(_clean_code(row.get("DEPCOM")))
    if city_id is not None:
        stats["city_by_code"] += 1
        return city_id

    city_id = epci_to_city.get((row.get("EPCI") or "").strip())
    if city_id is not None:
        stats["city_by_epci"] += 1
        return city_id

    stats["skipped_city"] += 1
    return None


def _device_rows(
    csv_files: list[str],
    code_to_city: dict[str, int],
    epci_to_city: dict[str, int],
    stats: dict[str, int],
):
    """Lit les CSV BPE et yield un tuple par equipement, pret pour l'insert.

    BPE INSEE : CSV UTF-8, separateur ';'. Les lignes sans coordonnees sont
    ignorees (longitude/latitude sont NOT NULL dans `devices`).
    """
    for path in csv_files:
        logger.info("[bpe] lecture %s", os.path.basename(path))
        with open(path, encoding="utf-8", errors="replace", newline="") as fh:
            for row in csv.DictReader(fh, delimiter=";"):
                stats["read"] += 1
                longitude = _parse_float(row.get("LONGITUDE"))
                latitude = _parse_float(row.get("LATITUDE"))
                if longitude is None or latitude is None:
                    stats["skipped_coords"] += 1
                    continue

                city_id = _resolve_city_id(row, code_to_city, epci_to_city, stats)
                if city_id is None:
                    continue

                if stats["read"] % 100000 == 0:
                    logger.info(
                        "[bpe] progression: %s lignes lues, %s a inserer, "
                        "%s sans coordonnees, %s sans commune",
                        stats["read"],
                        stats["inserted"],
                        stats["skipped_coords"],
                        stats["skipped_city"],
                    )

                # Adresse = numero + type + libelle de voie (parties vides ecartees).
                address = " ".join(
                    p for p in (row.get("NUMVOIE"), row.get("TYPVOIE"), row.get("LIBVOIE")) if p
                )

                stats["inserted"] += 1
                yield (
                    row.get("NOMRS", ""),
                    address.strip(),
                    row.get("TYPEQU", ""),
                    row.get("CATEGORIE", ""),
                    row.get("DOM", ""),
                    row.get("SDOM", ""),
                    row.get("LIBCOM", ""),
                    longitude,
                    latitude,
                    city_id,
                )


def load_bpe(**_context) -> None:
    """Entrypoint Airflow : charge les CSV BPE de DOWNLOAD_DIR dans `devices`."""
    if not os.path.isdir(DOWNLOAD_DIR):
        raise RuntimeError(f"Repertoire introuvable : {DOWNLOAD_DIR}")
    csv_files = sorted(
        os.path.join(DOWNLOAD_DIR, f)
        for f in os.listdir(DOWNLOAD_DIR)
        if f.lower().endswith(".csv")
    )
    if not csv_files:
        raise RuntimeError(f"Aucun CSV a charger dans {DOWNLOAD_DIR}")

    conn = get_conn()
    try:
        stats = {
            "read": 0,
            "inserted": 0,
            "skipped_coords": 0,
            "skipped_city": 0,
            "city_by_code": 0,
            "city_by_epci": 0,
        }
        with conn.cursor() as cur:
            code_to_city = _code_to_city_id(cur)
            epci_to_city = _epci_to_city_id(cur)
            cur.execute("TRUNCATE TABLE devices RESTART IDENTITY")

            psycopg2.extras.execute_values(
                cur,
                'INSERT INTO devices '
                '(nom, address, typequ, categorie, dom, sdom, libcom, longitude, latitude, "cityId") '
                "VALUES %s",
                _device_rows(csv_files, code_to_city, epci_to_city, stats),
                template="(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                page_size=1000,
            )
        conn.commit()
        logger.info(
            "[bpe] %s lignes lues, %s equipements inseres, "
            "%s ignores sans coordonnees, %s ignores sans commune, "
            "%s rattaches par code commune, %s par EPCI",
            stats["read"],
            stats["inserted"],
            stats["skipped_coords"],
            stats["skipped_city"],
            stats["city_by_code"],
            stats["city_by_epci"],
        )
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    load_bpe()
