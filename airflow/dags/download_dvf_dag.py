from __future__ import annotations

import os
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator

from download_utils import download_to_path

BASE_URL = "https://files.data.gouv.fr/geo-dvf/latest/csv"
DOWNLOAD_DIR = os.environ.get("DVF_DOWNLOAD_DIR", "/opt/airflow/data/dvf")
START_YEAR = int(os.environ.get("DVF_START_YEAR", "2021"))
END_YEAR = int(os.environ.get("DVF_END_YEAR", str(datetime.now().year - 1)))
YEARS = list(range(START_YEAR, END_YEAR + 1))


def download_dvf(year: int) -> None:
    url = f"{BASE_URL}/{year}/full.csv.gz"
    target = os.path.join(DOWNLOAD_DIR, f"full-{year}.csv.gz")
    download_to_path(url, target, timeout=600)


def report_downloads() -> None:
    files = sorted(f for f in os.listdir(DOWNLOAD_DIR) if f.endswith(".csv.gz"))
    total_mb = sum(os.path.getsize(os.path.join(DOWNLOAD_DIR, f)) for f in files) / (1024 * 1024)
    print(f"{len(files)} DVF files in {DOWNLOAD_DIR} ({total_mb:.2f} MB total):")
    for f in files:
        print(f"  - {f}")


with DAG(
    dag_id="download_dvf",
    description="Telecharge les fichiers full.csv.gz DVF (geo-dvf) depuis files.data.gouv.fr",
    start_date=datetime(2026, 1, 1),
    schedule="@monthly",
    catchup=False,
    default_args={
        "retries": 3,
        "retry_delay": timedelta(minutes=2),
    },
    tags=["homepedia", "ingestion", "dvf"],
) as dag:
    downloads = [
        PythonOperator(
            task_id=f"download_dvf_{year}",
            python_callable=download_dvf,
            op_kwargs={"year": year},
        )
        for year in YEARS
    ]

    report = PythonOperator(
        task_id="report_downloads",
        python_callable=report_downloads,
    )

    downloads >> report
