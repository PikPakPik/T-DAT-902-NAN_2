from __future__ import annotations

import os
import shutil
from datetime import datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import json

from airflow import DAG
from airflow.operators.python import PythonOperator


API_BASE = "https://www.data.gouv.fr/api/1"
SLUG = (
    "bases-statistiques-communale-departementale-et-regionale-de-la-"
    "delinquance-enregistree-par-la-police-et-la-gendarmerie-nationales"
)
# On ne veut QUE la base communale au format CSV compresse. Le dataset contient
# aussi des variantes parquet / xlsx et une ressource "COM COMPL" : on resout
# donc la ressource par son titre exact (+ format) via l'API. L'URL reelle
# contient un horodatage qui change a chaque mise a jour -> resolution dynamique.
RESOURCE_TITLE = (
    "COM - Base statistique communale de la delinquance enregistree par la "
    "police et la gendarmerie nationales (fichier csv compresse)"
)
RESOURCE_FORMAT = "csv.gz"

USER_AGENT = "airflow-homepedia"

# Repertoire de destination dans le container. Monte ./airflow/data:/opt/airflow/data
# dans compose.yaml pour persister les fichiers sur l'hote.
DOWNLOAD_DIR = os.environ.get("DELINQUANCE_DOWNLOAD_DIR", "/opt/airflow/data/delinquance")


def _norm(text: str) -> str:
    # Comparaison de titres insensible a la casse et aux accents (les libelles
    # data.gouv.fr peuvent varier sur les diacritiques).
    import unicodedata

    decomposed = unicodedata.normalize("NFKD", text)
    ascii_text = decomposed.encode("ascii", "ignore").decode("ascii")
    return " ".join(ascii_text.lower().split())


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
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    filename = url.rsplit("/", 1)[-1] or f"{resource['id']}.{RESOURCE_FORMAT}"
    target = os.path.join(DOWNLOAD_DIR, filename)
    _download(url, target)
    size_mb = os.path.getsize(target) / (1024 * 1024)
    print(f"Downloaded {url} -> {target} ({size_mb:.2f} MB)")


with DAG(
    dag_id="download_delinquance_communale",
    description="Telecharge la base statistique communale de la delinquance (CSV compresse) depuis data.gouv.fr",
    start_date=datetime(2026, 1, 1),
    schedule="@monthly",
    catchup=False,
    default_args={
        "retries": 3,
        "retry_delay": timedelta(minutes=2),
    },
    tags=["homepedia", "ingestion", "delinquance", "data.gouv"],
) as dag:
    PythonOperator(
        task_id="download_delinquance_communale_csv",
        python_callable=download_delinquance_communale,
    )
