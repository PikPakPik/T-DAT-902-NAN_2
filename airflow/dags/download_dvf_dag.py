from __future__ import annotations

import os
from datetime import datetime, timedelta

from airflow import DAG

try:
    from airflow.providers.standard.operators.python import PythonOperator
except ImportError:
    from airflow.operators.python import PythonOperator

from download_utils import download_to_path
from spark_runner import (
    refresh_dvf_stats,
    report_dvf_mutations_db,
    report_dvf_mutations_silver,
    run_prepare_sections_key,
    run_dvf_mutations_spark,
)

BASE_URL = "https://files.data.gouv.fr/geo-dvf/latest/csv"
DOWNLOAD_DIR = os.environ.get("DVF_DOWNLOAD_DIR", "/opt/airflow/data/dvf")
START_YEAR = int(os.environ.get("DVF_START_YEAR", "2021"))
END_YEAR = int(os.environ.get("DVF_END_YEAR", str(datetime.now().year - 1)))
YEARS = list(range(START_YEAR, END_YEAR + 1))

if not YEARS:
    raise ValueError(
        f"DVF_START_YEAR ({START_YEAR}) must be lower than or equal to "
        f"DVF_END_YEAR ({END_YEAR})"
    )


def download_dvf(year: int) -> None:
    url = f"{BASE_URL}/{year}/full.csv.gz"
    target = os.path.join(DOWNLOAD_DIR, f"full-{year}.csv.gz")
    download_to_path(url, target, timeout=600)


def report_downloads() -> None:
    if not os.path.isdir(DOWNLOAD_DIR):
        print(f"No DVF file downloaded yet in {DOWNLOAD_DIR}")
        return

    files = sorted(f for f in os.listdir(DOWNLOAD_DIR) if f.endswith(".csv.gz"))
    total_mb = sum(
        os.path.getsize(os.path.join(DOWNLOAD_DIR, f)) for f in files
    ) / (1024 * 1024)
    print(f"{len(files)} DVF files in {DOWNLOAD_DIR} ({total_mb:.2f} MB total):")
    for f in files:
        print(f"  - {f}")


with DAG(
    dag_id="download_dvf",
    description="Telecharge et nettoie les fichiers DVF (geo-dvf) puis charge la table mutations via Spark",
    start_date=datetime(2026, 1, 1),
    schedule="@monthly",
    catchup=False,
    max_active_runs=1,
    default_args={
        "retries": 3,
        "retry_delay": timedelta(minutes=2),
    },
    tags=["homepedia", "ingestion", "dvf"],
) as dag:
    downloads = {
        year: PythonOperator(
            task_id=f"download_dvf_{year}",
            python_callable=download_dvf,
            op_kwargs={"year": year},
        )
        for year in YEARS
    }

    transforms = {
        year: PythonOperator(
            task_id=f"transform_dvf_mutations_{year}",
            python_callable=run_dvf_mutations_spark,
            op_kwargs={"year": year},
        )
        for year in YEARS
    }

    report = PythonOperator(
        task_id="report_downloads",
        python_callable=report_downloads,
        trigger_rule="all_done",
    )

    prepare_sections_key = PythonOperator(
        task_id="prepare_sections_key",
        python_callable=run_prepare_sections_key,
    )

    refresh_stats_task = PythonOperator(
        task_id="refresh_dvf_stats",
        python_callable=refresh_dvf_stats,
    )

    report_silver_task = PythonOperator(
        task_id="report_dvf_mutations_silver",
        python_callable=report_dvf_mutations_silver,
        trigger_rule="all_done",
    )

    report_gold_task = PythonOperator(
        task_id="report_dvf_mutations_db",
        python_callable=report_dvf_mutations_db,
        trigger_rule="all_done",
    )

    # Téléchargements en parallèle, puis Spark année par année (évite OOM).
    list(downloads.values()) >> prepare_sections_key >> transforms[YEARS[0]]
    for prev_year, next_year in zip(YEARS, YEARS[1:]):
        transforms[prev_year] >> transforms[next_year]

    transforms[YEARS[-1]] >> refresh_stats_task
    refresh_stats_task >> [report, report_silver_task, report_gold_task]
