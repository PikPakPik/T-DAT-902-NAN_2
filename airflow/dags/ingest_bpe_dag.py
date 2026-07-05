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
from load_bpe import load_bpe


# Dataset INSEE 8217525 : "Equipements geolocalises (commerce, services, sport,
# sante...) en 2024" (Base permanente des equipements, BPE). INSEE diffuse les
# donnees en CSV (compresse dans BPE24.zip) et en Parquet. On ne code pas les
# noms de fichiers en dur : on lit la page et on recupere dynamiquement les liens
# d'archives CSV / ZIP (le .parquet et les eventuels .xlsx sont ignores).
PAGE_URL = "https://www.insee.fr/fr/statistiques/8217525"
SITE_ROOT = "https://www.insee.fr"
DOWNLOAD_DIR = os.environ.get("BPE_DOWNLOAD_DIR", "/opt/airflow/data/bpe")


def _discover_data_urls() -> list[str]:
    request = Request(PAGE_URL, headers={"User-Agent": USER_AGENT})
    try:
        with urlopen(request, timeout=60) as response:
            if response.getcode() != 200:
                raise RuntimeError(f"Unexpected HTTP status {response.getcode()} for {PAGE_URL}")
            html = response.read().decode("utf-8", errors="replace")
    except URLError as exc:
        raise RuntimeError(f"Failed to fetch {PAGE_URL}: {exc}") from exc

    # On se restreint aux fichiers de la page courante et aux archives CSV / ZIP
    # (le .parquet et les eventuels .xls/.xlsx sont volontairement exclus).
    pattern = r'href="(/fr/statistiques/fichier/8217525/[^"]+\.(?:zip|csv))"'
    hrefs = re.findall(pattern, html, re.IGNORECASE)
    urls = sorted({SITE_ROOT + h for h in hrefs})
    if not urls:
        raise RuntimeError(f"No CSV/ZIP download link found on {PAGE_URL}")
    return urls


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


def download_bpe() -> None:
    urls = _discover_data_urls()
    print(f"{len(urls)} CSV/ZIP archive(s) found on {PAGE_URL}:")
    for url in urls:
        print(f"  - {url}")

    os.makedirs(DOWNLOAD_DIR, exist_ok=True)

    for url in urls:
        filename = url.rsplit("/", 1)[-1]
        target = os.path.join(DOWNLOAD_DIR, filename)
        download_to_path(url, target, timeout=600)

        if filename.lower().endswith(".zip"):
            extracted = _extract_csv(target, DOWNLOAD_DIR)
            if os.path.exists(target):
                os.remove(target)
            for path in extracted:
                csv_mb = os.path.getsize(path) / (1024 * 1024)
                print(f"  extracted {os.path.basename(path)} ({csv_mb:.2f} MB)")


def report_downloads() -> None:
    if not os.path.isdir(DOWNLOAD_DIR):
        print(f"No data downloaded yet in {DOWNLOAD_DIR}")
        return
    files = sorted(f for f in os.listdir(DOWNLOAD_DIR) if f.lower().endswith(".csv"))
    total_mb = sum(os.path.getsize(os.path.join(DOWNLOAD_DIR, f)) for f in files) / (1024 * 1024)
    for f in files:
        f_mb = os.path.getsize(os.path.join(DOWNLOAD_DIR, f)) / (1024 * 1024)
        print(f"  - {f} ({f_mb:.2f} MB)")
    print(f"Total: {len(files)} CSV in {DOWNLOAD_DIR} ({total_mb:.2f} MB)")


with DAG(
    dag_id="download_bpe_equipements",
    description="Telecharge la Base permanente des equipements (equipements geolocalises 2024) au format CSV depuis insee.fr",
    start_date=datetime(2026, 1, 1),
    schedule=None,
    catchup=False,
    is_paused_upon_creation=True,
    max_active_runs=1,
    default_args={
        "retries": 3,
        "retry_delay": timedelta(minutes=2),
    },
    tags=["homepedia", "ingestion", "bpe", "insee", "equipements"],
) as dag:
    download = PythonOperator(
        task_id="download_bpe_csv",
        python_callable=download_bpe,
    )

    report = PythonOperator(
        task_id="report_downloads",
        python_callable=report_downloads,
        trigger_rule="all_done",
    )

    load = PythonOperator(
        task_id="load_bpe_to_db",
        python_callable=load_bpe,
    )

    download >> report >> load
