from __future__ import annotations

import os
import gzip
from datetime import datetime, timedelta
from urllib.error import URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from airflow import DAG
from airflow.models.param import Param
from airflow.operators.python import PythonOperator

from spark_runner import pg_conn_params, run_spark_submit


# data.ademe.fr s'appuie sur data-fair. Les datasets DPE sont des bases sans
# fichier source unique : l'export CSV se fait page par page via /lines, en
# suivant le curseur fourni dans l'entete HTTP "Link: ...; rel=next".
DATA_FAIR_BASE = "https://data.ademe.fr/data-fair/api/v1/datasets"
USER_AGENT = "airflow-homepedia"
PAGE_SIZE = int(os.environ.get("DPE_PAGE_SIZE", "10000"))  # 10000 = max data-fair

# Repertoire de destination dans le container. Monte ./airflow/data:/opt/airflow/data
# dans compose.yaml pour persister les fichiers sur l'hote.
DOWNLOAD_DIR = os.environ.get("DPE_DOWNLOAD_DIR", "/opt/airflow/data/ademe_dpe")

DATASETS = ["dpe03existant", "dpe01tertiaire"]
DPE_LOAD_JOB = "/opt/spark-jobs/silver/dpe_load.py"

DPE_SELECT_COLUMNS = {
    "dpe03existant": [
        "numero_dpe",
        "date_etablissement_dpe",
        "etiquette_dpe",
        "etiquette_ges",
        "type_batiment",
        "annee_construction",
        "surface_habitable_logement",
        "surface_habitable_immeuble",
        "code_insee_ban",
        "coordonnee_cartographique_x_ban",
        "coordonnee_cartographique_y_ban",
    ],
    "dpe01tertiaire": [
        "numero_dpe",
        "date_etablissement_dpe",
        "etiquette_dpe",
        "etiquette_ges",
        "annee_construction",
        "surface_utile",
        "surface_shon",
        "code_insee_ban",
        "coordonnee_cartographique_x_ban",
        "coordonnee_cartographique_y_ban",
    ],
}


def _next_url(link_header: str | None) -> str | None:
    if not link_header:
        return None
    for part in link_header.split(","):
        segments = part.split(";")
        if len(segments) < 2:
            continue
        rel = segments[1].replace('"', "").replace(" ", "")
        if rel == "rel=next":
            return segments[0].strip().strip("<>")
    return None


def _dataset_url(dataset: str) -> str:
    params = {"format": "csv", "size": str(PAGE_SIZE)}
    columns = DPE_SELECT_COLUMNS.get(dataset)
    if columns:
        params["select"] = ",".join(columns)
    return f"{DATA_FAIR_BASE}/{quote(dataset)}/lines?{urlencode(params)}"


def download_dpe(dataset: str, **context) -> None:
    max_rows = int((context.get("params") or {}).get("max_rows", 0))
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    target = os.path.join(DOWNLOAD_DIR, f"{dataset}.csv")
    tmp = f"{target}.part"

    url: str | None = _dataset_url(dataset)
    rows = 0
    pages = 0
    first = True

    try:
        with open(tmp, "wb") as fh:
            while url:
                request = Request(
                    url,
                    headers={"User-Agent": USER_AGENT, "Accept-Encoding": "gzip"},
                )
                with urlopen(request, timeout=600) as response:
                    if response.getcode() != 200:
                        raise RuntimeError(f"Unexpected HTTP status {response.getcode()} for {url}")
                    data = response.read()
                    link_header = response.headers.get("Link")
                    if response.headers.get("Content-Encoding") == "gzip":
                        data = gzip.decompress(data)

                if first:
                    fh.write(data)
                    first = False
                else:
                    # Pages suivantes : retirer la ligne d'entete (et l'eventuel BOM)
                    # qui est repetee a chaque page.
                    newline = data.find(b"\n")
                    if newline == -1:
                        break  # page sans donnees -> fin
                    data = data[newline + 1 :]
                    if not data:
                        break
                    fh.write(data)

                pages += 1
                rows += data.count(b"\n")
                if max_rows and rows >= max_rows:
                    print(f"max_rows={max_rows} atteint, arret anticipe")
                    break

                url = _next_url(link_header)
    except URLError as exc:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise RuntimeError(f"Download failed for {dataset}: {exc}") from exc

    os.replace(tmp, target)
    size_mb = os.path.getsize(target) / (1024 * 1024)
    print(f"Downloaded {dataset}: ~{rows} rows over {pages} pages -> {target} ({size_mb:.2f} MB)")


def report_downloads() -> None:
    if not os.path.isdir(DOWNLOAD_DIR):
        print(f"No data downloaded yet in {DOWNLOAD_DIR}")
        return
    files = sorted(f for f in os.listdir(DOWNLOAD_DIR) if f.endswith(".csv"))
    total_mb = sum(os.path.getsize(os.path.join(DOWNLOAD_DIR, f)) for f in files) / (1024 * 1024)
    print(f"{len(files)} DPE files in {DOWNLOAD_DIR} ({total_mb:.2f} MB total):")
    for f in files:
        print(f"  - {f}")


def run_dpe_load_spark() -> None:
    run_spark_submit(DPE_LOAD_JOB)


def report_dpes_silver() -> None:
    silver_dir = os.environ.get("DPE_SILVER_DIR", "/opt/airflow/data/silver/dpe/dpes")
    if not os.path.isdir(silver_dir):
        print(f"Aucune donnee silver dans {silver_dir}")
        return
    for name in sorted(os.listdir(silver_dir)):
        path = os.path.join(silver_dir, name)
        if name.endswith(".csv") and os.path.isfile(path):
            with open(path, encoding="utf-8") as fh:
                rows = max(sum(1 for _ in fh) - 1, 0)
            size_kb = os.path.getsize(path) / 1024
            print(f"{name}: {rows} DPE ({size_kb:.1f} KB)")
        elif name.endswith(".parquet") and os.path.isdir(path):
            print(f"{name}/ (Parquet)")


def report_dpes_db() -> None:
    try:
        import psycopg2
    except ImportError:
        print("psycopg2 indisponible — rapport base ignore")
        return

    conn = psycopg2.connect(**pg_conn_params())
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM dpes")
            total = cur.fetchone()[0]
            cur.execute(
                """
                SELECT COUNT(*)
                FROM dpes
                WHERE "plotId" IS NOT NULL
                """
            )
            linked = cur.fetchone()[0]
        print(f"dpes : {total} ligne(s) en base")
        print(f"  plotId renseignes : {linked}")
    finally:
        conn.close()


with DAG(
    dag_id="download_ademe_dpe",
    description="Telecharge les DPE ADEME (logements existants, tertiaire) au format CSV depuis data.ademe.fr",
    start_date=datetime(2026, 1, 1),
    schedule="@monthly",
    catchup=False,
    params={"max_rows": Param(0, type="integer", description="Limite de lignes par dataset (0 = illimite, pour tests)")},
    default_args={
        "retries": 3,
        "retry_delay": timedelta(minutes=2),
    },
    tags=["homepedia", "ingestion", "dpe", "ademe"],
) as dag:
    downloads = [
        PythonOperator(
            task_id=f"download_{dataset}",
            python_callable=download_dpe,
            op_kwargs={"dataset": dataset},
        )
        for dataset in DATASETS
    ]

    report = PythonOperator(
        task_id="report_downloads",
        python_callable=report_downloads,
        trigger_rule="all_done",
    )

    load_dpes = PythonOperator(
        task_id="load_dpes_spark",
        python_callable=run_dpe_load_spark,
    )

    report_silver_task = PythonOperator(
        task_id="report_dpes_silver",
        python_callable=report_dpes_silver,
        trigger_rule="all_done",
    )

    report_db_task = PythonOperator(
        task_id="report_dpes_db",
        python_callable=report_dpes_db,
        trigger_rule="all_done",
    )

    downloads >> load_dpes >> [report, report_silver_task, report_db_task]
