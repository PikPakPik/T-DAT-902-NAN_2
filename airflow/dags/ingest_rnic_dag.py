from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from airflow import DAG
from airflow.operators.python import PythonOperator

from download_utils import USER_AGENT, download_to_path

API_BASE = "https://www.data.gouv.fr/api/1"
SLUG = "registre-national-dimmatriculation-des-coproprietes"
RESOURCE_TITLE = "RNIC - Actualisation quotidienne"
WANTED_FORMATS = {"csv", "json"}
DOWNLOAD_DIR = os.environ.get("RNIC_DOWNLOAD_DIR", "/opt/airflow/data/rnic")


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

    for resource in matches:
        url = resource["url"]
        filename = url.rsplit("/", 1)[-1] or f"{resource['id']}.{resource['format']}"
        target = os.path.join(DOWNLOAD_DIR, filename)
        download_to_path(url, target, timeout=600)


with DAG(
    dag_id="download_rnic",
    description="Telecharge l'actualisation quotidienne du registre national des coproprietes (RNIC) depuis data.gouv.fr",
    start_date=datetime(2026, 1, 1),
    schedule=None,
    catchup=False,
    is_paused_upon_creation=True,
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
