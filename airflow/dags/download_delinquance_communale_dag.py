from __future__ import annotations

import json
import os
import unicodedata
from datetime import datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from airflow import DAG
from airflow.operators.python import PythonOperator

from download_utils import USER_AGENT, download_to_path
from spark_runner import (
    report_delinquance_crimes_db,
    report_delinquance_crimes_silver,
    run_delinquance_crimes_spark,
)

API_BASE = "https://www.data.gouv.fr/api/1"
SLUG = (
    "bases-statistiques-communale-departementale-et-regionale-de-la-"
    "delinquance-enregistree-par-la-police-et-la-gendarmerie-nationales"
)
RESOURCE_TITLE = (
    "COM - Base statistique communale de la delinquance enregistree par la "
    "police et la gendarmerie nationales (fichier csv compresse)"
)
RESOURCE_FORMAT = "csv.gz"
DOWNLOAD_DIR = os.environ.get("DELINQUANCE_DOWNLOAD_DIR", "/opt/airflow/data/delinquance")


def _norm(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    ascii_text = decomposed.encode("ascii", "ignore").decode("ascii")
    return " ".join(ascii_text.lower().split())


def download_delinquance_communale() -> None:
    api_url = f"{API_BASE}/datasets/{SLUG}/"
    request = Request(api_url, headers={"User-Agent": USER_AGENT})
    try:
        with urlopen(request, timeout=60) as response:
            dataset = json.load(response)
    except (HTTPError, URLError) as exc:
        raise RuntimeError(f"API request failed for {api_url}: {exc}") from exc

    wanted_title = _norm(RESOURCE_TITLE)
    matches = [
        r
        for r in dataset.get("resources", [])
        if _norm(r.get("title") or "") == wanted_title
        and (r.get("format") or "").lower() == RESOURCE_FORMAT
    ]
    if not matches:
        raise RuntimeError(
            f"Resource '{RESOURCE_TITLE}' ({RESOURCE_FORMAT}) not found in dataset {SLUG}"
        )
    if len(matches) > 1:
        raise RuntimeError(f"Expected a single CSV resource, found {len(matches)}")

    resource = matches[0]
    url = resource["url"]
    filename = url.rsplit("/", 1)[-1] or f"{resource['id']}.{RESOURCE_FORMAT}"
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    target = os.path.join(DOWNLOAD_DIR, filename)
    download_to_path(url, target, timeout=900)


def report_downloads() -> None:
    if not os.path.isdir(DOWNLOAD_DIR):
        print(f"No data downloaded yet in {DOWNLOAD_DIR}")
        return
    files = sorted(
        f for f in os.listdir(DOWNLOAD_DIR) if f.lower().endswith(".csv.gz")
    )
    total_mb = sum(os.path.getsize(os.path.join(DOWNLOAD_DIR, f)) for f in files) / (
        1024 * 1024
    )
    print(f"{len(files)} fichier(s) dans {DOWNLOAD_DIR} ({total_mb:.2f} MB)")
    for name in files:
        size_mb = os.path.getsize(os.path.join(DOWNLOAD_DIR, name)) / (1024 * 1024)
        print(f"  - {name} ({size_mb:.2f} MB)")


with DAG(
    dag_id="download_delinquance_communale",
    description="Telecharge et transforme la base statistique communale de la delinquance (SSMSI) depuis data.gouv.fr",
    start_date=datetime(2026, 1, 1),
    schedule="@monthly",
    catchup=False,
    default_args={
        "retries": 3,
        "retry_delay": timedelta(minutes=2),
    },
    tags=["homepedia", "ingestion", "delinquance", "data.gouv", "spark"],
) as dag:
    download = PythonOperator(
        task_id="download_delinquance_communale_csv",
        python_callable=download_delinquance_communale,
    )

    transform_silver = PythonOperator(
        task_id="transform_delinquance_crimes_spark",
        python_callable=run_delinquance_crimes_spark,
    )

    report = PythonOperator(
        task_id="report_downloads",
        python_callable=report_downloads,
        trigger_rule="all_done",
    )

    report_silver_task = PythonOperator(
        task_id="report_delinquance_crimes_silver",
        python_callable=report_delinquance_crimes_silver,
        trigger_rule="all_done",
    )

    report_db_task = PythonOperator(
        task_id="report_delinquance_crimes_db",
        python_callable=report_delinquance_crimes_db,
        trigger_rule="all_done",
    )

    download >> transform_silver >> [report, report_silver_task, report_db_task]
