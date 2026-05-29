"""
load_contours.py
-----------------
Charge les contours administratifs (GeoJSON.gz) dans PostgreSQL/PostGIS.

Schéma cible (NestJS / TypeORM) :
  regions      (id serial PK, name, code, geom geometry(MultiPolygon,4326))
  departments  (id serial PK, name, code, "regionId" → regions.id, geom)
  cities       (id serial PK, name, names, code, siren, epci,
                "zipCodes", "departmentId" → departments.id, geom)

Géométrie : ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(...), 4326))
            → accepte Polygon ET MultiPolygon en entrée.

Stratégie upsert : SELECT code → id existants,
                   UPDATE si trouvé, INSERT + récupération id si nouveau.
                   Pas de TRUNCATE (d'autres tables référencent cities).

Dépendances : psycopg2-binary (pas de geopandas nécessaire — PostGIS gère la géométrie)
"""

from __future__ import annotations

import gzip
import json
import logging
import os
from typing import Any

import psycopg2
import psycopg2.extras

logger = logging.getLogger(__name__)

DOWNLOAD_DIR = os.environ.get("GEOJSON_DOWNLOAD_DIR", "/opt/airflow/data/geojson")


# ---------------------------------------------------------------------------
# Connexion
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def read_geojson_gz(filename: str) -> dict[str, Any]:
    path = os.path.join(DOWNLOAD_DIR, filename)
    if not os.path.exists(path):
        raise FileNotFoundError(f"Fichier manquant : {path}")
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return json.load(f)


def geojson_geom_sql(geom: dict | None) -> tuple[str, str] | tuple[None, None]:
    """
    Retourne (sql_fragment, json_string) pour insertion PostGIS.
    ST_Multi() garantit MultiPolygon même si la source est un Polygon.
    Retourne (None, None) si la géométrie est absente.
    """
    if geom is None:
        return None, None
    return "ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))", json.dumps(geom)


def fetch_code_to_id(cur: psycopg2.extensions.cursor, table: str, code_col: str = "code") -> dict[str, int]:
    """Charge le mapping {code → id} existant pour une table."""
    cur.execute(f'SELECT {code_col}, id FROM {table}')
    return {row[0]: row[1] for row in cur.fetchall()}


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------

def load_regions(conn: psycopg2.extensions.connection) -> dict[str, int]:
    """
    Retourne {code_region → regions.id} pour le chargement des départements.

    Propriétés GeoJSON attendues :
      feature.properties.code  → code (ex: "11")
      feature.properties.nom   → name
    """
    data = read_geojson_gz("regions-5m.geojson.gz")
    inserted = updated = skipped = 0

    with conn.cursor() as cur:
        code_to_id = fetch_code_to_id(cur, "regions")

        for feature in data["features"]:
            props = feature.get("properties", {})
            code  = str(props.get("code", "")).strip()
            name  = str(props.get("nom",  "")).strip()
            if not code or not name:
                skipped += 1
                continue

            geom_sql, geom_val = geojson_geom_sql(feature.get("geometry"))
            if geom_sql is None:
                skipped += 1
                continue

            if code in code_to_id:
                cur.execute(
                    f'UPDATE regions SET name=%s, geom={geom_sql} WHERE id=%s',
                    (name, geom_val, code_to_id[code])
                )
                updated += 1
            else:
                cur.execute(
                    f'INSERT INTO regions (name, code, geom) VALUES (%s, %s, {geom_sql}) RETURNING id',
                    (name, code, geom_val)
                )
                new_id = cur.fetchone()[0]
                code_to_id[code] = new_id
                inserted += 1

    conn.commit()
    logger.info(f"[regions] insert={inserted} update={updated} skip={skipped}")
    return code_to_id


def load_departments(
    conn: psycopg2.extensions.connection,
    region_code_to_id: dict[str, int],
) -> dict[str, int]:
    """
    Retourne {code_dept → departments.id} pour le chargement des communes.

    Propriétés GeoJSON attendues :
      feature.properties.code        → code (ex: "75", "2A")
      feature.properties.nom         → name
      feature.properties.region      → pour résoudre regionId
    """
    data = read_geojson_gz("departements-5m.geojson.gz")
    inserted = updated = skipped = 0

    with conn.cursor() as cur:
        code_to_id = fetch_code_to_id(cur, "departments")

        for feature in data["features"]:
            props       = feature.get("properties", {})
            code        = str(props.get("code",       "")).strip()
            name        = str(props.get("nom",        "")).strip()
            code_region = str(props.get("region", "")).strip()

            if not code or not name:
                skipped += 1
                continue

            region_id = region_code_to_id.get(code_region)
            if region_id is None:
                logger.warning(f"[departments] région inconnue '{code_region}' pour dept '{code}' — ignoré")
                skipped += 1
                continue

            geom_sql, geom_val = geojson_geom_sql(feature.get("geometry"))
            if geom_sql is None:
                skipped += 1
                continue

            if code in code_to_id:
                cur.execute(
                    f'UPDATE departments SET name=%s, "regionId"=%s, geom={geom_sql} WHERE id=%s',
                    (name, region_id, geom_val, code_to_id[code])
                )
                updated += 1
            else:
                cur.execute(
                    f'INSERT INTO departments (name, code, "regionId", geom) '
                    f'VALUES (%s, %s, %s, {geom_sql}) RETURNING id',
                    (name, code, region_id, geom_val)
                )
                new_id = cur.fetchone()[0]
                code_to_id[code] = new_id
                inserted += 1

    conn.commit()
    logger.info(f"[departments] insert={inserted} update={updated} skip={skipped}")
    return code_to_id


def load_cities(
    conn: psycopg2.extensions.connection,
    dept_code_to_id: dict[str, int],
) -> None:
    """
    Propriétés GeoJSON réelles (communes-5m.geojson) :
      code          → code INSEE 5 chars (ex: "01001")
      nom           → name
      departement   → code département (ex: "01")
      region        → code région (ex: "84")
      epci          → code EPCI (ex: "200069193")
    """
    data = read_geojson_gz("communes-5m.geojson.gz")
    inserted = updated = skipped = 0

    with conn.cursor() as cur:
        code_to_id = fetch_code_to_id(cur, "cities")

        for feature in data["features"]:
            props     = feature.get("properties", {})
            code      = str(props.get("code", "")).strip().zfill(5)
            name      = str(props.get("nom",  "")).strip()
            code_dept = str(props.get("departement", "")).strip()

            if not code or code == "00000" or not name:
                skipped += 1
                continue

            dept_id = dept_code_to_id.get(code_dept)
            if dept_id is None:
                logger.warning(f"[cities] département inconnu '{code_dept}' pour commune '{code}' — ignoré")
                skipped += 1
                continue

            # Champs disponibles dans ce GeoJSON
            names    = name                                    # pas de champ alternatif
            siren    = ""                                      # absent du GeoJSON
            epci     = str(props.get("epci", "") or "")
            zip_str  = "[]"                                    # absent du GeoJSON

            geom_sql, geom_val = geojson_geom_sql(feature.get("geometry"))
            if geom_sql is None:
                skipped += 1
                continue

            if code in code_to_id:
                cur.execute(
                    f'UPDATE cities SET name=%s, names=%s, siren=%s, epci=%s, '
                    f'"zipCodes"=%s, "departmentId"=%s, geom={geom_sql} WHERE id=%s',
                    (name, names, siren, epci, zip_str, dept_id, geom_val, code_to_id[code])
                )
                updated += 1
            else:
                cur.execute(
                    f'INSERT INTO cities (name, names, code, siren, epci, "zipCodes", "departmentId", geom) '
                    f'VALUES (%s, %s, %s, %s, %s, %s, %s, {geom_sql}) RETURNING id',
                    (name, names, code, siren, epci, zip_str, dept_id, geom_val)
                )
                code_to_id[code] = cur.fetchone()[0]
                inserted += 1

            # Commit par batch de 1000 pour éviter les transactions trop longues
            if (inserted + updated) % 1000 == 0:
                conn.commit()
                logger.info(f"[cities] {inserted + updated} traitées...")

    conn.commit()
    logger.info(f"[cities] insert={inserted} update={updated} skip={skipped}")


# ---------------------------------------------------------------------------
# Entrypoint Airflow (PythonOperator)
# ---------------------------------------------------------------------------

def load_all_contours(**context) -> None:
    """
    Appelé par le PythonOperator Airflow.
    Ordre strict : régions → départements → communes (FK).
    """
    conn = get_conn()
    try:
        logger.info("=== Chargement régions ===")
        region_code_to_id = load_regions(conn)

        logger.info("=== Chargement départements ===")
        dept_code_to_id = load_departments(conn, region_code_to_id)

        logger.info("=== Chargement communes ===")
        load_cities(conn, dept_code_to_id)

        logger.info("=== Contours administratifs chargés avec succès ===")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    load_all_contours()