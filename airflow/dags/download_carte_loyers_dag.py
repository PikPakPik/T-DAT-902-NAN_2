from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from airflow import DAG
from airflow.exceptions import AirflowSkipException
from airflow.operators.python import PythonOperator

from download_utils import USER_AGENT, download_to_path
from spark_runner import run_loyers_load_spark

API_BASE = "https://www.data.gouv.fr/api/1"
# Chaque annee est un dataset distinct partageant ce motif de slug. Les annees
# futures seront recuperees automatiquement (run @monthly) des leur publication.
SLUG_TEMPLATE = "carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-{year}"

WANTED_FORMATS = {"csv", "json"}
DOWNLOAD_DIR = os.environ.get("LOYERS_DOWNLOAD_DIR", "/opt/airflow/data/carte_loyers")

# 2018 = premiere annee disponible. La borne haute suit l'annee courante pour
# couvrir les futures publications. Surchargeable via variables d'environnement.
START_YEAR = int(os.environ.get("LOYERS_START_YEAR", "2018"))
END_YEAR = int(os.environ.get("LOYERS_END_YEAR", str(datetime.now().year)))
YEARS = list(range(START_YEAR, END_YEAR + 1))


def download_year(year: int) -> None:
    api_url = f"{API_BASE}/datasets/{SLUG_TEMPLATE.format(year=year)}/"
    request = Request(api_url, headers={"User-Agent": USER_AGENT})
    try:
        with urlopen(request, timeout=60) as response:
            dataset = json.load(response)
    except HTTPError as exc:
        if exc.code == 404:
            raise AirflowSkipException(f"No carte-des-loyers dataset published yet for {year}")
        raise RuntimeError(f"API request failed for {api_url}: {exc}") from exc
    except URLError as exc:
        raise RuntimeError(f"API request failed for {api_url}: {exc}") from exc

    resources = [
        r
        for r in dataset.get("resources", [])
        if r.get("type") == "main" and (r.get("format") or "").lower() in WANTED_FORMATS
    ]
    if not resources:
        raise AirflowSkipException(f"No main CSV/JSON resource found for {year}")

    year_dir = os.path.join(DOWNLOAD_DIR, str(year))
    os.makedirs(year_dir, exist_ok=True)

    for resource in resources:
        url = resource["url"]
        filename = url.rsplit("/", 1)[-1] or f"{resource['id']}.{resource['format']}"
        target = os.path.join(year_dir, filename)
        download_to_path(url, target, timeout=600)


def report_downloads() -> None:
    if not os.path.isdir(DOWNLOAD_DIR):
        print(f"No data downloaded yet in {DOWNLOAD_DIR}")
        return
    total_files = 0
    total_mb = 0.0
    for year in sorted(os.listdir(DOWNLOAD_DIR)):
        year_dir = os.path.join(DOWNLOAD_DIR, year)
        if not os.path.isdir(year_dir):
            continue
        files = sorted(os.listdir(year_dir))
        year_mb = sum(os.path.getsize(os.path.join(year_dir, f)) for f in files) / (1024 * 1024)
        total_files += len(files)
        total_mb += year_mb
        print(f"{year}: {len(files)} files ({year_mb:.2f} MB)")
        for f in files:
            print(f"  - {f}")
    print(f"Total: {total_files} files in {DOWNLOAD_DIR} ({total_mb:.2f} MB)")


with DAG(
    dag_id="download_carte_loyers",
    description="Telecharge les indicateurs de loyers par commune (carte des loyers) depuis data.gouv.fr",
    start_date=datetime(2026, 1, 1),
    schedule="@monthly",
    catchup=False,
    default_args={
        "retries": 3,
        "retry_delay": timedelta(minutes=2),
    },
    tags=["homepedia", "ingestion", "loyers"],
) as dag:
    load_tasks = []
    for year in YEARS:
        download_task = PythonOperator(
            task_id=f"download_loyers_{year}",
            python_callable=download_year,
            op_kwargs={"year": year},
        )
        # trigger_rule par défaut (all_success) : si download_loyers_{year}
        # est skip (dataset absent) ou échoue, load_loyers_{year} est
        # automatiquement skip / upstream_failed, sans logique supplémentaire.
        load_task = PythonOperator(
            task_id=f"load_loyers_{year}",
            python_callable=run_loyers_load_spark,
            op_kwargs={"year": year},
        )
        download_task >> load_task
        load_tasks.append(load_task)

    report = PythonOperator(
        task_id="report_downloads",
        python_callable=report_downloads,
        trigger_rule="all_done",
    )

    load_tasks >> report