"""
DAG Airflow - Cadastre Etalab + chargement PostgreSQL
-----------------------------------------------------
1. (Optionnel) Télécharge les couches France
2. Télécharge sections + parcelles par département
3. Charge sections + parcelles par département (streaming, 2 dept en parallèle max)

Prérequis : DAG download_contours_administratifs exécuté au moins une fois.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta

from airflow import DAG
from airflow.decorators import task
from airflow.operators.python import PythonOperator

from cadastre_download import download_one_department, list_department_codes
from download_utils import download_to_path
from load_cadastre import ensure_upsert_indexes, get_conn, load_one_department


def ensure_cadastre_indexes(**_context) -> None:
    """Crée les index d'upsert une seule fois avant les loads parallèles."""
    conn = get_conn()
    try:
        ensure_upsert_indexes(conn)
    finally:
        conn.close()

BASE_URL = "https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/france"
DOWNLOAD_DIR = os.environ.get("CADASTRE_DOWNLOAD_DIR", "/opt/airflow/data/cadastre")

FILES_FRANCE = [
    "cadastre-france-communes.json.gz",
    "cadastre-france-feuilles.json.gz",
    "cadastre-france-prefixes_sections.json.gz",
    "cadastre-france-sections.json.gz",
]


def download_file(filename: str) -> None:
    url = f"{BASE_URL}/{filename}"
    target = os.path.join(DOWNLOAD_DIR, filename)
    download_to_path(url, target, timeout=7200)


def report_downloads() -> None:
    if not os.path.isdir(DOWNLOAD_DIR):
        print(f"No cadastre directory yet: {DOWNLOAD_DIR}")
        return
    files = sorted(f for f in os.listdir(DOWNLOAD_DIR) if f.endswith(".json.gz"))
    total_mb = sum(os.path.getsize(os.path.join(DOWNLOAD_DIR, f)) for f in files) / (1024 * 1024)
    dept_parcelles = [f for f in files if f.startswith("cadastre-") and "-parcelles" in f]
    dept_sections = [f for f in files if f.startswith("cadastre-") and "-sections" in f]
    print(f"{len(files)} fichiers dans {DOWNLOAD_DIR} ({total_mb:.2f} Mo)")
    print(f"  - {len(dept_sections)} sections départementales")
    print(f"  - {len(dept_parcelles)} parcelles départementales")


@task
def fetch_department_codes() -> list[str]:
    return list_department_codes()


@task(max_active_tis_per_dag=4)
def download_department(dept_code: str) -> dict[str, int]:
    return download_one_department(dept_code)


@task(max_active_tis_per_dag=3)
def load_cadastre_department(dept_code: str) -> dict[str, int | str]:
    return load_one_department(dept_code)


with DAG(
    dag_id="download_cadastre",
    description="Télécharge le cadastre Etalab et charge sections + parcelles dans PostgreSQL",
    start_date=datetime(2026, 1, 1),
    schedule=None,
    catchup=False,
    is_paused_upon_creation=True,
    max_active_tasks=8,
    default_args={
        "retries": 2,
        "retry_delay": timedelta(minutes=2),
    },
    tags=["homepedia", "ingestion", "cadastre"],
) as dag:
    downloads_france = [
        PythonOperator(
            task_id=f"download_{filename.replace('-', '_').replace('.json.gz', '')}",
            python_callable=download_file,
            op_kwargs={"filename": filename},
        )
        for filename in FILES_FRANCE
    ]

    codes = fetch_department_codes()
    download_depts = download_department.expand(dept_code=codes)
    load_depts = load_cadastre_department.expand(dept_code=codes)

    report = PythonOperator(
        task_id="report_downloads",
        python_callable=report_downloads,
    )

    ensure_indexes = PythonOperator(
        task_id="ensure_cadastre_upsert_indexes",
        python_callable=ensure_cadastre_indexes,
    )

    codes >> download_depts >> report >> ensure_indexes >> load_depts
