from __future__ import annotations

import json
import os
import shutil
from datetime import datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from airflow import DAG
from airflow.operators.python import PythonOperator


API_BASE = "https://www.data.gouv.fr/api/1"
SLUG = "registre-national-dimmatriculation-des-coproprietes"
# Seule la ressource quotidienne nous interesse. Son URL change chaque jour
# (prefixe de date), on la retrouve donc par son titre via l'API a chaque run.
RESOURCE_TITLE = "RNIC - Actualisation quotidienne"

USER_AGENT = "airflow-homepedia"
WANTED_FORMATS = {"csv", "json"}

# Repertoire de destination dans le container. Monte ./airflow/data:/opt/airflow/data
# dans compose.yaml pour persister les fichiers sur l'hote.
DOWNLOAD_DIR = os.environ.get("RNIC_DOWNLOAD_DIR", "/opt/airflow/data/rnic")


def _download(url: str, target: str) -> None:
    tmp = f"{target}.part"
    request = Request(url, headers={"User-Agent": USER_AGENT})
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


def download_rnic() -> None:
    api_url = f"{API_BASE}/datasets/{SLUG}/"
    request = Request(api_url, headers={"User-Agent": USER_AGENT})
    try:
        with urlopen(request, timeout=60) as response:
            dataset = json.load(response)
    except (HTTPError, URLError) as exc:
        raise RuntimeError(f"API request failed for {api_url}: {exc}") from exc

    matches = [
        r
        for r in dataset.get("resources", [])
        if r.get("title") == RESOURCE_TITLE and (r.get("format") or "").lower() in WANTED_FORMATS
    ]
    if not matches:
        raise RuntimeError(f"Resource '{RESOURCE_TITLE}' (csv/json) not found in dataset {SLUG}")

    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    for resource in matches:
        url = resource["url"]
        filename = url.rsplit("/", 1)[-1] or f"{resource['id']}.{resource['format']}"
        target = os.path.join(DOWNLOAD_DIR, filename)
        _download(url, target)
        size_mb = os.path.getsize(target) / (1024 * 1024)
        print(f"Downloaded {url} -> {target} ({size_mb:.2f} MB)")


with DAG(
    dag_id="download_rnic",
    description="Telecharge l'actualisation quotidienne du registre national des coproprietes (RNIC) depuis data.gouv.fr",
    start_date=datetime(2026, 1, 1),
    schedule="@daily",
    catchup=False,
    default_args={
        "retries": 3,
        "retry_delay": timedelta(minutes=2),
    },
    tags=["homepedia", "ingestion", "rnic"],
) as dag:
    PythonOperator(
        task_id="download_rnic_actualisation_quotidienne",
        python_callable=download_rnic,
    )
