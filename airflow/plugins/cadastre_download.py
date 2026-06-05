"""
Télécharge les GeoJSON cadastre (sections + parcelles) par département.
"""

from __future__ import annotations

import os

import psycopg2

from download_utils import download_to_path

DOWNLOAD_DIR = os.environ.get("CADASTRE_DOWNLOAD_DIR", "/opt/airflow/data/cadastre")
BASE_URL = "https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/departements"
LAYERS = ("sections", "parcelles")


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


def fetch_department_codes(conn: psycopg2.extensions.connection) -> list[str]:
    with conn.cursor() as cur:
        cur.execute("SELECT DISTINCT code FROM departments ORDER BY code")
        return [str(row[0]).strip() for row in cur.fetchall()]


def list_department_codes() -> list[str]:
    """Liste les codes département (task Airflow)."""
    conn = get_conn()
    try:
        codes = fetch_department_codes(conn)
    finally:
        conn.close()

    if not codes:
        raise RuntimeError(
            "Aucun département en base — exécutez d'abord download_contours_administratifs"
        )
    print(f"{len(codes)} départements à traiter", flush=True)
    return codes


def download_one_department(dept_code: str) -> dict[str, int]:
    """Télécharge sections + parcelles pour un seul département."""
    stats = {"ok": 0, "missing": 0}
    print(f"=== Département {dept_code} ===", flush=True)

    for layer in LAYERS:
        filename = f"cadastre-{dept_code}-{layer}.json.gz"
        url = f"{BASE_URL}/{dept_code}/{filename}"
        target = os.path.join(DOWNLOAD_DIR, filename)
        print(f"[{dept_code}] {layer} …", flush=True)

        if download_to_path(url, target, timeout=7200, not_found_ok=True):
            stats["ok"] += 1
        else:
            print(f"[{dept_code}] {layer} absent (404)", flush=True)
            stats["missing"] += 1

    print(f"[{dept_code}] terminé : {stats}", flush=True)
    return stats
