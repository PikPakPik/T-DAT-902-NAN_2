"""
Lance un job PySpark dans le conteneur Spark via docker exec.

Le worker Airflow n'a pas Java : les jobs tournent dans homepedia-spark.
Prérequis worker : client docker + socket monté (voir compose.yaml).
"""

from __future__ import annotations

import os
import subprocess
import sys

FILOSOFI_INCOME_JOB = "/opt/spark-jobs/silver/filosofi_income.py"
SPARK_CONTAINER = os.environ.get("SPARK_CONTAINER_NAME", "homepedia-spark")
SPARK_POSTGRES_JAR = "/opt/spark/jars/postgresql-42.7.3.jar"
SPARK_ENV_KEYS = (
    "POSTGIS_HOST",
    "POSTGIS_PORT",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_DB",
    "FILOSOFI_DOWNLOAD_DIR",
    "FILOSOFI_SILVER_DIR",
    "FILOSOFI_REJECTS_DIR",
)


def run_spark_submit(job_path: str, extra_args: list[str] | None = None) -> None:
    master = os.environ.get("SPARK_MASTER", "local[*]")
    inner = [
        "/opt/spark/bin/spark-submit",
        "--master",
        master,
        "--jars",
        SPARK_POSTGRES_JAR,
        "--conf",
        "spark.sql.shuffle.partitions=4",
        job_path,
    ]
    if extra_args:
        inner.extend(extra_args)

    cmd = ["docker", "exec"]
    for key in SPARK_ENV_KEYS:
        value = os.environ.get(key)
        if value:
            cmd.extend(["-e", f"{key}={value}"])
    cmd.append(SPARK_CONTAINER)
    cmd.extend(inner)

    print("Commande Spark :", " ".join(cmd), file=sys.stderr)
    subprocess.run(cmd, check=True)


def run_filosofi_income_spark() -> None:
    run_spark_submit(FILOSOFI_INCOME_JOB)


def report_filosofi_income_silver() -> None:
    silver_dir = os.environ.get(
        "FILOSOFI_SILVER_DIR", "/opt/airflow/data/silver/filosofi/income"
    )
    if not os.path.isdir(silver_dir):
        print(f"Aucune donnee silver dans {silver_dir}")
        return
    for name in sorted(os.listdir(silver_dir)):
        path = os.path.join(silver_dir, name)
        if name.endswith(".csv") and os.path.isfile(path):
            with open(path, encoding="utf-8") as fh:
                rows = max(sum(1 for _ in fh) - 1, 0)
            size_kb = os.path.getsize(path) / 1024
            print(f"{name}: {rows} communes ({size_kb:.1f} KB)")
        elif name.endswith(".parquet") and os.path.isdir(path):
            print(f"{name}/ (Parquet)")


def report_filosofi_income_db() -> None:
    try:
        import psycopg2
    except ImportError:
        print("psycopg2 indisponible — rapport base ignore")
        return

    conn = psycopg2.connect(
        host=os.environ.get("POSTGIS_HOST", "postgis"),
        port=int(os.environ.get("POSTGIS_PORT", "5432")),
        dbname=os.environ.get("POSTGRES_DB", "homepedia"),
        user=os.environ.get("POSTGRES_USER", "postgres"),
        password=os.environ.get("POSTGRES_PASSWORD", "postgres"),
    )
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM income_cities")
            total = cur.fetchone()[0]
            cur.execute(
                "SELECT annee, COUNT(*) FROM income_cities GROUP BY annee ORDER BY annee"
            )
            by_year = cur.fetchall()
        print(f"income_cities : {total} ligne(s) en base")
        for annee, n in by_year:
            print(f"  annee {annee}: {n}")
    finally:
        conn.close()
