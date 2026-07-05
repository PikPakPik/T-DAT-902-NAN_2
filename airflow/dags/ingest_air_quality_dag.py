from __future__ import annotations

from datetime import date, datetime, timedelta

from airflow import DAG
from airflow.providers.standard.operators.python import PythonOperator
from airflow.sdk import Param

from load_air_quality import download_atmo_indices, load_air_quality


def _default_start_date() -> str:
    today = date.today()
    return date(today.year, 1, 1).isoformat()


def _default_end_date() -> str:
    return (date.today() - timedelta(days=1)).isoformat()


with DAG(
    dag_id="download_air_quality",
    description="Telecharge les indices ATMO communaux et charge les statistiques annuelles de qualite de l'air",
    start_date=datetime(2026, 1, 1),
    schedule=None,
    catchup=False,
    is_paused_upon_creation=True,
    max_active_runs=1,
    params={
        "start_date": Param(
            _default_start_date(),
            type="string",
            description="Date de debut ATMO au format YYYY-MM-DD",
        ),
        "end_date": Param(
            _default_end_date(),
            type="string",
            description="Date de fin ATMO au format YYYY-MM-DD",
        ),
        "aasqa_codes": Param(
            "01,02,03,04,06,11,24,27,28,32,44,52,53,75,76,84,93,94",
            type="string",
            description="Codes AASQA a interroger, separes par des virgules",
        ),
    },
    default_args={
        "retries": 2,
        "retry_delay": timedelta(minutes=5),
    },
    tags=["homepedia", "ingestion", "air-quality", "atmo"],
) as dag:
    download = PythonOperator(
        task_id="download_atmo_indices",
        python_callable=download_atmo_indices,
    )

    load = PythonOperator(
        task_id="load_air_quality_to_db",
        python_callable=load_air_quality,
    )

    download >> load
