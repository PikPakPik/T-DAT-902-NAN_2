"""
load_bpe.py
-----------
Charge la Base permanente des equipements (BPE, INSEE) dans la table `devices`.

Pour chaque equipement du CSV : on resout la commune via le code EPCI
(colonne `cities.epci`) puis on insere une ligne dans `devices` avec le cityId.

La table `devices` est une feuille (aucune table ne la reference) : on la
TRUNCATE avant chargement pour que le DAG soit idempotent.

Dependances : psycopg2-binary.
"""

from __future__ import annotations

import csv
import logging
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


def _device_rows(csv_files: list[str], epci_to_city: dict[str, int], stats: dict[str, int]):
    """Lit les CSV BPE et yield un tuple par equipement, pret pour l'insert.

    BPE INSEE : CSV UTF-8, separateur ';'. Les lignes sans coordonnees sont
    ignorees (longitude/latitude sont NOT NULL dans `devices`).
    """
    for path in csv_files:
        logger.info("[bpe] lecture %s", os.path.basename(path))
        with open(path, encoding="utf-8", errors="replace", newline="") as fh:
            for row in csv.DictReader(fh, delimiter=";"):
                # Adresse = numero + type + libelle de voie (parties vides ecartees).
                address = " ".join(
                    p for p in (row.get("NUMVOIE"), row.get("TYPVOIE"), row.get("LIBVOIE")) if p
                )

                stats["inserted"] += 1
                yield (
                    row.get("NOMRS", ""),
                    address.strip(),
                    float(row.get("LONGITUDE", "0")),
                    float(row.get("LATITUDE", "0")),
                    epci_to_city.get(row.get("EPCI", "")),
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
        stats = {"inserted": 0, "skipped": 0}
        with conn.cursor() as cur:
            epci_to_city = _epci_to_city_id(cur)
            cur.execute("TRUNCATE TABLE devices RESTART IDENTITY")

            # longitude/latitude sont typees `point` : on encode le scalaire dans
            # la coordonnee x via point(valeur, 0).
            psycopg2.extras.execute_values(
                cur,
                'INSERT INTO devices '
                '(nom, address, longitude, latitude, "cityId") '
                "VALUES %s",
                _device_rows(csv_files, epci_to_city, stats),
                template="(%s, %s, point(%s, 0), point(%s, 0), %s)",
                page_size=1000,
            )
        conn.commit()
        logger.info(
            "[bpe] %s equipements inseres, %s ignores (sans coordonnees)",
            stats["inserted"],
            stats["skipped"],
        )
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    load_bpe()
