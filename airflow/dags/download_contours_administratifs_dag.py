"""
DAG Airflow - Contours administratifs + chargement PostgreSQL
--------------------------------------------------------------
1. Télécharge les GeoJSON.gz depuis adresse.data.gouv.fr   (parallèle)
2. Vérifie les téléchargements                             (rapport)
3. Charge régions → départements → communes dans PostgreSQL (séquentiel, FK)
 
Schedule : mensuel
"""
 
from __future__ import annotations
 
import os
import shutil
from datetime import datetime, timedelta
from urllib.error import URLError
from urllib.request import Request, urlopen
 
from airflow import DAG
from airflow.operators.python import PythonOperator
 
# Import du loader (doit être dans le PYTHONPATH du container Airflow)
# Placez load_contours.py dans /opt/airflow/dags/ ou un dossier plugins/
from load_contours import load_all_contours
 
BASE_URL     = "https://adresse.data.gouv.fr/data/contours-administratifs/latest/geojson"
DOWNLOAD_DIR = os.environ.get("GEOJSON_DOWNLOAD_DIR", "/opt/airflow/data/geojson")
 
FILES = [
    "communes-5m.geojson.gz",
    "communes-associees-deleguees-5m.geojson.gz",
    "departements-5m.geojson.gz",
    "epci-5m.geojson.gz",
    "mairies.geojson.gz",
    "regions-5m.geojson.gz",
]
 
 
# ---------------------------------------------------------------------------
# Fonctions existantes (inchangées)
# ---------------------------------------------------------------------------
 
def download_geojson(filename: str) -> None:
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    url    = f"{BASE_URL}/{filename}"
    target = os.path.join(DOWNLOAD_DIR, filename)
    tmp    = f"{target}.part"
 
    request = Request(url, headers={"User-Agent": "airflow-homepedia"})
    try:
        with urlopen(request, timeout=300) as response, open(tmp, "wb") as fh:
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
    files     = sorted(f for f in os.listdir(DOWNLOAD_DIR) if f.endswith(".geojson.gz"))
    total_mb  = sum(os.path.getsize(os.path.join(DOWNLOAD_DIR, f)) for f in files) / (1024 * 1024)
    print(f"{len(files)} GeoJSON files in {DOWNLOAD_DIR} ({total_mb:.2f} MB total):")
    for f in files:
        print(f"  - {f}")
 
 
# ---------------------------------------------------------------------------
# DAG
# ---------------------------------------------------------------------------
 
with DAG(
    dag_id="download_contours_administratifs",
    description="Télécharge les contours administratifs GeoJSON et charge PostgreSQL",
    start_date=datetime(2026, 1, 1),
    schedule="@monthly",
    catchup=False,
    default_args={
        "retries":      3,
        "retry_delay":  timedelta(minutes=2),
    },
    tags=["homepedia", "ingestion", "geojson"],
) as dag:
 
    # ------------------------------------------------------------------
    # Étape 1 : Téléchargements parallèles
    # ------------------------------------------------------------------
    downloads = [
        PythonOperator(
            task_id=f"download_{filename.replace('.geojson.gz', '').replace('-', '_')}",
            python_callable=download_geojson,
            op_kwargs={"filename": filename},
        )
        for filename in FILES
    ]
 
    # ------------------------------------------------------------------
    # Étape 2 : Rapport
    # ------------------------------------------------------------------
    report = PythonOperator(
        task_id="report_downloads",
        python_callable=report_downloads,
    )
 
    # ------------------------------------------------------------------
    # Étape 3 : Chargement PostgreSQL
    # Ordre strict : régions → départements → communes (contraintes FK)
    # load_all_contours gère les 3 tables en séquence.
    # ------------------------------------------------------------------
    load_pg = PythonOperator(
        task_id="load_contours_to_postgres",
        python_callable=load_all_contours,
    )
 
    # ------------------------------------------------------------------
    # Dépendances
    # ------------------------------------------------------------------
    downloads >> report >> load_pg