from __future__ import annotations

import os
import shutil
from datetime import datetime, timedelta
from urllib.error import URLError
from urllib.request import Request, urlopen

from airflow import DAG
from airflow.operators.python import PythonOperator


BASE_URL = "https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/france"

# Repertoire de destination dans le container. Monte ./airflow/data:/opt/airflow/data
# dans compose.yaml pour persister les fichiers sur l'hote.
DOWNLOAD_DIR = os.environ.get("CADASTRE_DOWNLOAD_DIR", "/opt/airflow/data/cadastre")

FILES = [
    "cadastre-france-communes.json.gz",
    "cadastre-france-feuilles.json.gz",
    "cadastre-france-prefixes_sections.json.gz",
    "cadastre-france-sections.json.gz",
]


def download_file(filename: str) -> None:
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    url = f"{BASE_URL}/{filename}"
    target = os.path.join(DOWNLOAD_DIR, filename)
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
    files = sorted(f for f in os.listdir(DOWNLOAD_DIR) if f.endswith(".json.gz"))
    total_mb = sum(os.path.getsize(os.path.join(DOWNLOAD_DIR, f)) for f in files) / (1024 * 1024)
    print(f"{len(files)} cadastre files in {DOWNLOAD_DIR} ({total_mb:.2f} MB total):")
    for f in files:
        print(f"  - {f}")


with DAG(
    dag_id="download_cadastre",
    description="Telecharge les donnees cadastrales GeoJSON (etalab) depuis cadastre.data.gouv.fr",
    start_date=datetime(2026, 1, 1),
    schedule="@monthly",
    catchup=False,
    default_args={
        "retries": 3,
        "retry_delay": timedelta(minutes=2),
    },
    tags=["homepedia", "ingestion", "cadastre"],
) as dag:
    downloads = [
        PythonOperator(
            task_id=f"download_{filename.replace('-', '_').replace('.json.gz', '')}",
            python_callable=download_file,
            op_kwargs={"filename": filename},
        )
        for filename in FILES
    ]

    report = PythonOperator(
        task_id="report_downloads",
        python_callable=report_downloads,
    )

    downloads >> report
