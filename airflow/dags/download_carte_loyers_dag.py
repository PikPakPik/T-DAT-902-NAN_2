from __future__ import annotations

import json
import os
import shutil
from datetime import datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from airflow import DAG
from airflow.exceptions import AirflowSkipException
from airflow.operators.python import PythonOperator


API_BASE = "https://www.data.gouv.fr/api/1"
# Chaque annee est un dataset distinct partageant ce motif de slug. Les annees
# futures seront recuperees automatiquement (run @monthly) des leur publication.
SLUG_TEMPLATE = "carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-{year}"

USER_AGENT = "airflow-homepedia"
WANTED_FORMATS = {"csv", "json"}

# Repertoire de destination dans le container. Monte ./airflow/data:/opt/airflow/data
# dans compose.yaml pour persister les fichiers sur l'hote.
DOWNLOAD_DIR = os.environ.get("LOYERS_DOWNLOAD_DIR", "/opt/airflow/data/carte_loyers")

# 2018 = premiere annee disponible. La borne haute suit l'annee courante pour
# couvrir les futures publications. Surchargeable via variables d'environnement.
START_YEAR = int(os.environ.get("LOYERS_START_YEAR", "2018"))
END_YEAR = int(os.environ.get("LOYERS_END_YEAR", str(datetime.now().year)))
YEARS = list(range(START_YEAR, END_YEAR + 1))


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
        _download(url, target)
        size_mb = os.path.getsize(target) / (1024 * 1024)
        print(f"Downloaded {url} -> {target} ({size_mb:.2f} MB)")


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
    downloads = [
        PythonOperator(
            task_id=f"download_loyers_{year}",
            python_callable=download_year,
            op_kwargs={"year": year},
        )
        for year in YEARS
    ]

    report = PythonOperator(
        task_id="report_downloads",
        python_callable=report_downloads,
        trigger_rule="all_done",
    )

    downloads >> report
