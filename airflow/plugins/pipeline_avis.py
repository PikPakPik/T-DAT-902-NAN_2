"""
pipeline_avis.py
----------------
Orchestration Airflow pour le pipeline avis bien-dans-ma-ville :
  1. Scraping des avis → MongoDB
  2. Analyse de sentiment NLP
  3. Génération wordcloud par commune
"""

from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
from typing import Any

_INSTALLED_REQ_FILES: set[str] = set()


def _scrapers_dir() -> str:
    return os.environ.get("SCRAPERS_DIR", "/opt/airflow/scrapers")


def _nlp_dir() -> str:
    return os.path.join(_scrapers_dir(), "nlp")


def _module_available(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def _pip_install_requirements(req_file: str) -> None:
    """Installe les deps une seule fois par worker ; ignore le bruit setuptools."""
    if req_file in _INSTALLED_REQ_FILES:
        return
    if not os.path.isfile(req_file):
        return

    env = {**os.environ, "PIP_DISABLE_PIP_VERSION_CHECK": "1"}
    base_cmd = [
        sys.executable,
        "-m",
        "pip",
        "install",
        "--user",
        "--no-cache-dir",
        "--disable-pip-version-check",
    ]

    # Répare l'artefact ~etuptools parfois présent dans l'image Airflow
    subprocess.run(
        [*base_cmd, "--upgrade", "setuptools", "wheel"],
        env=env,
        capture_output=True,
        text=True,
    )

    result = subprocess.run(
        [*base_cmd, "-r", req_file],
        env=env,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        raise RuntimeError(f"pip install failed ({req_file}): {stderr[-2000:]}")

    _INSTALLED_REQ_FILES.add(req_file)
    print(f"Dépendances installées depuis {req_file}")


def _run_python_script(script_path: str, *, req_file: str | None = None) -> None:
    if req_file:
        _pip_install_requirements(req_file)
    if not os.path.isfile(script_path):
        raise FileNotFoundError(f"Script introuvable: {script_path}")
    print(f"Lancement: {script_path}")
    subprocess.run([sys.executable, script_path], check=True, env=os.environ.copy())


def run_bdmv_scraper() -> None:
    """Lance le scraper bien-dans-ma-ville (équivalent au service bdmv-scraper)."""
    scraper_dir = os.path.join(_scrapers_dir(), "bien-dans-ma-ville")
    _run_python_script(
        os.path.join(scraper_dir, "scraper.py"),
        req_file=os.path.join(scraper_dir, "requirements.txt"),
    )


def run_sentiment_analysis() -> dict[str, Any]:
    """Analyse de sentiment sur les avis non traités."""
    nlp_dir = _nlp_dir()
    req = os.path.join(nlp_dir, "requirements.txt")
    _pip_install_requirements(req)

    if not _module_available("transformers"):
        raise RuntimeError(
            "transformers non disponible après pip install — "
            "relancer la tâche ou utiliser le service nlp-processor."
        )

    if nlp_dir not in sys.path:
        sys.path.insert(0, nlp_dir)
    from sentiment import analyze_reviews

    return analyze_reviews()


def run_wordcloud_generation() -> dict[str, Any]:
    """Génère les wordcloud_data par commune."""
    nlp_dir = _nlp_dir()
    req = os.path.join(nlp_dir, "requirements.txt")
    _pip_install_requirements(req)

    if nlp_dir not in sys.path:
        sys.path.insert(0, nlp_dir)
    from wordcloud import generate_wordclouds

    return generate_wordclouds()


def report_pipeline_stats() -> None:
    """Affiche un résumé MongoDB après exécution du pipeline."""
    from pymongo import MongoClient

    url = os.environ.get("MONGODB_URL")
    if not url:
        raise RuntimeError("MONGODB_URL manquant")

    db = MongoClient(url).get_database()
    reviews = db["reviews"]
    cities = db["cities"]

    total_reviews = reviews.count_documents({})
    analyzed = reviews.count_documents({"sentiment_analyzed_at": {"$ne": None}})
    with_sentiment = reviews.count_documents({"sentiment_label": {"$ne": None}})
    with_wordcloud = cities.count_documents({"wordcloud_data": {"$exists": True}})
    with_global = cities.count_documents({"sentiment_global": {"$exists": True}})

    print("=== Pipeline avis NLP — rapport ===")
    print(f"  Avis total          : {total_reviews}")
    print(f"  Avis analysés NLP   : {analyzed}")
    print(f"  Avis avec sentiment : {with_sentiment}")
    print(f"  Communes wordcloud  : {with_wordcloud}")
    print(f"  Communes sentiment  : {with_global}")

    for label in ("positive", "neutral", "negative"):
        n = reviews.count_documents({"sentiment_label": label})
        print(f"  Label {label:8} : {n}")
