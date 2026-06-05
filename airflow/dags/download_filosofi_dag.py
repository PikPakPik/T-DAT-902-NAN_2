from __future__ import annotations

import os
import re
import shutil
import zipfile
from datetime import datetime, timedelta
from urllib.error import URLError
from urllib.request import Request, urlopen

from airflow import DAG
from airflow.operators.python import PythonOperator

from download_utils import USER_AGENT, download_to_path

PAGE_URL = "https://www.insee.fr/fr/statistiques/7756729"
SITE_ROOT = "https://www.insee.fr"
DOWNLOAD_DIR = os.environ.get("FILOSOFI_DOWNLOAD_DIR", "/opt/airflow/data/filosofi")


def _discover_csv_zip_urls() -> list[str]:
    request = Request(PAGE_URL, headers={"User-Agent": USER_AGENT})
    try:
        with urlopen(request, timeout=60) as response:
            if response.getcode() != 200:
                raise RuntimeError(f"Unexpected HTTP status {response.getcode()} for {PAGE_URL}")
            html = response.read().decode("utf-8", errors="replace")
    except URLError as exc:
        raise RuntimeError(f"Failed to fetch {PAGE_URL}: {exc}") from exc

    hrefs = re.findall(r'href="(/fr/statistiques/fichier/\d+/[^"]+\.zip)"', html)
    # On ne garde que les archives CSV (les liens XLSX contiennent "XLSX", pas "csv").
    csv_urls = sorted({SITE_ROOT + h for h in hrefs if "csv" in h.lower()})
    if not csv_urls:
        raise RuntimeError(f"No CSV download link found on {PAGE_URL}")
    return csv_urls


def _extract_csv(zip_path: str, dest_dir: str) -> list[str]:
    extracted = []
    with zipfile.ZipFile(zip_path) as zf:
        for member in zf.namelist():
            # On aplatit l'arborescence (basename) : neutralise tout zip-slip et
            # on ne garde que les CSV.
            name = os.path.basename(member)
            if not name.lower().endswith(".csv"):
                continue
            target = os.path.join(dest_dir, name)
            with zf.open(member) as src, open(target, "wb") as fh:
                shutil.copyfileobj(src, fh)
            extracted.append(target)
    if not extracted:
        raise RuntimeError(f"No CSV found inside {zip_path}")
    return extracted


def download_filosofi() -> None:
    urls = _discover_csv_zip_urls()
    print(f"{len(urls)} CSV archive(s) found on {PAGE_URL}:")
    for url in urls:
        print(f"  - {url}")

    for url in urls:
        filename = url.rsplit("/", 1)[-1]
        # Sous-dossier par millesime geographique (geoYYYY) si present, sinon le
        # nom de l'archive sert de cle.
        match = re.search(r"geo\d{4}", filename, re.IGNORECASE)
        subdir = match.group(0).lower() if match else os.path.splitext(filename)[0]
        dest_dir = os.path.join(DOWNLOAD_DIR, subdir)
        os.makedirs(dest_dir, exist_ok=True)

        zip_target = os.path.join(dest_dir, filename)
        download_to_path(url, zip_target, timeout=600)

        extracted = _extract_csv(zip_target, dest_dir)
        os.remove(zip_target)
        for path in extracted:
            csv_mb = os.path.getsize(path) / (1024 * 1024)
            print(f"  extracted {subdir}/{os.path.basename(path)} ({csv_mb:.2f} MB)")


def report_downloads() -> None:
    if not os.path.isdir(DOWNLOAD_DIR):
        print(f"No data downloaded yet in {DOWNLOAD_DIR}")
        return
    total_files = 0
    total_mb = 0.0
    for geo in sorted(os.listdir(DOWNLOAD_DIR)):
        geo_dir = os.path.join(DOWNLOAD_DIR, geo)
        if not os.path.isdir(geo_dir):
            continue
        files = sorted(f for f in os.listdir(geo_dir) if f.lower().endswith(".csv"))
        geo_mb = sum(os.path.getsize(os.path.join(geo_dir, f)) for f in files) / (1024 * 1024)
        total_files += len(files)
        total_mb += geo_mb
        print(f"{geo}: {len(files)} CSV ({geo_mb:.2f} MB)")
        for f in files:
            print(f"  - {f}")
    print(f"Total: {total_files} CSV in {DOWNLOAD_DIR} ({total_mb:.2f} MB)")


with DAG(
    dag_id="download_filosofi",
    description="Telecharge les indicateurs de revenus et pauvrete (Filosofi, tous niveaux geographiques) au format CSV depuis insee.fr",
    start_date=datetime(2026, 1, 1),
    schedule="@monthly",
    catchup=False,
    default_args={
        "retries": 3,
        "retry_delay": timedelta(minutes=2),
    },
    tags=["homepedia", "ingestion", "filosofi", "insee", "revenus", "pauvrete"],
) as dag:
    download = PythonOperator(
        task_id="download_filosofi_csv",
        python_callable=download_filosofi,
    )

    report = PythonOperator(
        task_id="report_downloads",
        python_callable=report_downloads,
        trigger_rule="all_done",
    )

    download >> report
