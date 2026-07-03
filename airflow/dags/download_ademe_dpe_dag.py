from __future__ import annotations

import os
import gzip
import time
from datetime import datetime, timedelta
from urllib.error import HTTPError, URLError
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
DPE_REQUEST_DELAY_SECONDS = float(os.environ.get("DPE_REQUEST_DELAY_SECONDS", "0.25"))
DPE_PAGE_RETRIES = int(os.environ.get("DPE_PAGE_RETRIES", "8"))
DPE_RETRY_BASE_SECONDS = float(os.environ.get("DPE_RETRY_BASE_SECONDS", "30"))
DPE_RETRY_MAX_SECONDS = float(os.environ.get("DPE_RETRY_MAX_SECONDS", "300"))

# Repertoire de destination dans le container. Monte ./airflow/data:/opt/airflow/data
# dans compose.yaml pour persister les fichiers sur l'hote.
DOWNLOAD_DIR = os.environ.get("DPE_DOWNLOAD_DIR", "/opt/airflow/data/ademe_dpe")

DATASETS = ["dpe03existant", "dpe01tertiaire"]
DPE_LOAD_JOB = "/opt/spark-jobs/silver/dpe_load.py"
DPE_SPARK_CONFS = (
    ("spark.sql.shuffle.partitions", os.environ.get("DPE_SHUFFLE_PARTITIONS", "128")),
    ("spark.default.parallelism", os.environ.get("DPE_DEFAULT_PARALLELISM", "128")),
    ("spark.driver.memory", os.environ.get("DPE_DRIVER_MEMORY", "4g")),
    ("spark.executor.memory", os.environ.get("DPE_EXECUTOR_MEMORY", "4g")),
    ("spark.sql.parquet.enableDictionary", "false"),
)

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


def _request_headers() -> dict[str, str]:
    headers = {"User-Agent": USER_AGENT, "Accept-Encoding": "gzip"}
    api_key = os.environ.get("DPE_API_KEY")
    if api_key:
        headers["x-apikey"] = api_key
    return headers


def _retry_after_seconds(exc: HTTPError, attempt: int) -> float:
    retry_after = exc.headers.get("Retry-After") if exc.headers else None
    if retry_after:
        try:
            return min(float(retry_after), DPE_RETRY_MAX_SECONDS)
        except ValueError:
            pass
    return min(DPE_RETRY_BASE_SECONDS * (2 ** (attempt - 1)), DPE_RETRY_MAX_SECONDS)


def _read_page(url: str) -> tuple[bytes, str | None]:
    for attempt in range(1, DPE_PAGE_RETRIES + 1):
        request = Request(url, headers=_request_headers())
        try:
            with urlopen(request, timeout=600) as response:
                if response.getcode() != 200:
                    raise RuntimeError(
                        f"Unexpected HTTP status {response.getcode()} for {url}"
                    )
                data = response.read()
                link_header = response.headers.get("Link")
                if response.headers.get("Content-Encoding") == "gzip":
                    data = gzip.decompress(data)
                return data, link_header
        except HTTPError as exc:
            if exc.code != 429 or attempt == DPE_PAGE_RETRIES:
                raise
            wait_seconds = _retry_after_seconds(exc, attempt)
            print(
                f"Rate limit ADEME (HTTP 429), pause {wait_seconds:.0f}s "
                f"avant reprise page (tentative {attempt + 1}/{DPE_PAGE_RETRIES})",
                flush=True,
            )
            time.sleep(wait_seconds)
        except URLError:
            if attempt == DPE_PAGE_RETRIES:
                raise
            wait_seconds = min(5 * attempt, 60)
            print(
                f"Erreur reseau temporaire, pause {wait_seconds:.0f}s "
                f"avant reprise page (tentative {attempt + 1}/{DPE_PAGE_RETRIES})",
                flush=True,
            )
            time.sleep(wait_seconds)

    raise RuntimeError(f"Download failed after {DPE_PAGE_RETRIES} attempts for {url}")


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
                data, link_header = _read_page(url)

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
                if url and DPE_REQUEST_DELAY_SECONDS > 0:
                    time.sleep(DPE_REQUEST_DELAY_SECONDS)
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
    run_spark_submit(DPE_LOAD_JOB, extra_confs=DPE_SPARK_CONFS)


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
    max_active_runs=1,
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

    for upstream, downstream in zip(downloads, downloads[1:]):
        upstream >> downstream

    downloads[-1] >> load_dpes >> [report, report_silver_task, report_db_task]
