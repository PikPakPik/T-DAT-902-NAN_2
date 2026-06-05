from __future__ import annotations

import os
import shutil
from datetime import datetime, timedelta
from urllib.error import URLError
from urllib.request import Request, urlopen

from airflow import DAG
from airflow.operators.python import PythonOperator


BASE_URL = "https://files.data.gouv.fr/geo-dvf/latest/csv"

# Repertoire de destination dans le container. Monte ./airflow/data:/opt/airflow/data
# dans compose.yaml pour persister les fichiers sur l'hote.
DOWNLOAD_DIR = os.environ.get("DVF_DOWNLOAD_DIR", "/opt/airflow/data/dvf")

# Annees a telecharger. Par defaut 2021 (premiere annee disponible) jusqu'a
# l'annee complete precedente. Surchargeable via les variables d'environnement.
START_YEAR = int(os.environ.get("DVF_START_YEAR", "2021"))
END_YEAR = int(os.environ.get("DVF_END_YEAR", str(datetime.now().year - 1)))
YEARS = list(range(START_YEAR, END_YEAR + 1))


def download_dvf(year: int) -> None:
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    url = f"{BASE_URL}/{year}/full.csv.gz"
    target = os.path.join(DOWNLOAD_DIR, f"full-{year}.csv.gz")
    tmp = f"{target}.part"

    request = Request(url, headers={"User-Agent": "airflow-homepedia"})
    try:
        with urlopen(request, timeout=600) as response, open(tmp, "wb") as fh:
            if response.getcode() != 200:
                raise RuntimeError(f"Unexpected HTTP status {response.getcode()} for {url}")
            shutil.copyfileobj(response, fh)
    except URLError as exc:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise RuntimeError(f"Download failed for {url}: {exc}") from exc

    os.replace(tmp, target)
    size_mb = os.path.getsize(target) / (1024 * 1024)
    print(f"Downloaded {url} -> {target} ({size_mb:.2f} MB)")


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
