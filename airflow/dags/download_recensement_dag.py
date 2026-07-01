from __future__ import annotations

import os
import re
import shutil
import zipfile
from datetime import datetime, timedelta
from urllib.error import URLError
from urllib.request import Request, urlopen

from airflow import DAG
from airflow.exceptions import AirflowSkipException
from airflow.operators.python import PythonOperator

from download_utils import USER_AGENT, download_to_path
from spark_runner import (
    report_recensement_population_db,
    report_recensement_population_silver,
    run_recensement_population_spark,
)


# Recensement INSEE : "Populations legales", un jeu de donnees par millesime.
# Chaque page propose une archive "ensemble.zip" contenant les CSV a tous les
# echelons (regions, departements, arrondissements, cantons, communes...). On ne
# code pas les noms de fichiers en dur : pour chaque page on lit le HTML et on
# recupere dynamiquement les liens .zip/.csv (les .xls/.xlsx/.pdf sont ignores).
#
# millesime -> identifiant de la page statistiques INSEE. 2016 n'est pas publie
# sous ce format ; 2015 n'expose qu'un .xls (aucun CSV) -> la tache sera "skipped".
PAGES = {
    2015: "3545833",
    2017: "4265429",
    2018: "4989724",
    2019: "6011070",
    2020: "6683035",
    2021: "7739582",
    2022: "8290591",
    2023: "8680726",
}

SITE_ROOT = "https://www.insee.fr"
PAGE_URL_TEMPLATE = "https://www.insee.fr/fr/statistiques/{stat_id}"
DOWNLOAD_DIR = os.environ.get("RECENSEMENT_DOWNLOAD_DIR", "/opt/airflow/data/recensement")


def _discover_data_urls(stat_id: str) -> list[str]:
    page_url = PAGE_URL_TEMPLATE.format(stat_id=stat_id)
    request = Request(page_url, headers={"User-Agent": USER_AGENT})
    try:
        with urlopen(request, timeout=60) as response:
            if response.getcode() != 200:
                raise RuntimeError(f"Unexpected HTTP status {response.getcode()} for {page_url}")
            html = response.read().decode("utf-8", errors="replace")
    except URLError as exc:
        raise RuntimeError(f"Failed to fetch {page_url}: {exc}") from exc

    # On se restreint aux fichiers de la page courante et aux archives CSV / ZIP
    # (les .xls/.xlsx/.pdf sont volontairement exclus).
    pattern = rf'href="(/fr/statistiques/fichier/{stat_id}/[^"]+\.(?:zip|csv))"'
    hrefs = re.findall(pattern, html, re.IGNORECASE)
    return sorted({SITE_ROOT + h for h in hrefs})


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


def download_recensement(year: int, stat_id: str) -> None:
    urls = _discover_data_urls(stat_id)
    if not urls:
        raise AirflowSkipException(
            f"No CSV/ZIP archive for {year} (page {stat_id}) - only .xls/.pdf published"
        )

    year_dir = os.path.join(DOWNLOAD_DIR, str(year))
    os.makedirs(year_dir, exist_ok=True)

    for url in urls:
        filename = url.rsplit("/", 1)[-1]
        target = os.path.join(year_dir, filename)
        download_to_path(url, target, timeout=600)

        if filename.lower().endswith(".zip"):
            extracted = _extract_csv(target, year_dir)
            os.remove(target)
            for path in extracted:
                csv_mb = os.path.getsize(path) / (1024 * 1024)
                print(f"  extracted {year}/{os.path.basename(path)} ({csv_mb:.2f} MB)")


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
        files = sorted(f for f in os.listdir(year_dir) if f.lower().endswith(".csv"))
        year_mb = sum(os.path.getsize(os.path.join(year_dir, f)) for f in files) / (1024 * 1024)
        total_files += len(files)
        total_mb += year_mb
        print(f"{year}: {len(files)} CSV ({year_mb:.2f} MB)")
        for f in files:
            print(f"  - {f}")
    print(f"Total: {total_files} CSV in {DOWNLOAD_DIR} ({total_mb:.2f} MB)")


with DAG(
    dag_id="download_recensement_populations_legales",
    description="Telecharge les populations legales du recensement (tous niveaux geographiques) au format CSV depuis insee.fr",
    start_date=datetime(2026, 1, 1),
    schedule="@monthly",
    catchup=False,
    default_args={
        "retries": 3,
        "retry_delay": timedelta(minutes=2),
    },
    tags=["homepedia", "ingestion", "recensement", "insee", "population"],
) as dag:
    downloads = [
        PythonOperator(
            task_id=f"download_recensement_{year}",
            python_callable=download_recensement,
            op_kwargs={"year": year, "stat_id": stat_id},
        )
        for year, stat_id in PAGES.items()
    ]

    transform_silver = PythonOperator(
        task_id="transform_recensement_population_spark",
        python_callable=run_recensement_population_spark,
        trigger_rule="none_failed",
    )

    report = PythonOperator(
        task_id="report_downloads",
        python_callable=report_downloads,
        trigger_rule="all_done",
    )

    report_silver_task = PythonOperator(
        task_id="report_recensement_population_silver",
        python_callable=report_recensement_population_silver,
        trigger_rule="all_done",
    )

    report_db_task = PythonOperator(
        task_id="report_recensement_population_db",
        python_callable=report_recensement_population_db,
        trigger_rule="all_done",
    )

    downloads >> transform_silver >> [report, report_silver_task, report_db_task]
