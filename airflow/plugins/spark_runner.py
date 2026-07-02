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
DELINQUANCE_CRIMES_JOB = "/opt/spark-jobs/silver/delinquance_crimes.py"
RECENSEMENT_POPULATION_JOB = "/opt/spark-jobs/silver/recensement_population.py"
DVF_MUTATIONS_JOB = "/opt/spark-jobs/silver/dvf_mutations.py"
SPARK_CONTAINER = os.environ.get("SPARK_CONTAINER_NAME", "homepedia-spark")
SPARK_POSTGRES_JAR = "/opt/spark/jars/postgresql-42.7.3.jar"
# Chemins data : tout *_DOWNLOAD_DIR / *_SILVER_DIR / *_REJECTS_DIR est transmis
# au conteneur Spark (POSTGIS/POSTGRES sont déjà définis dans compose.yaml).
SPARK_ENV_SUFFIXES = ("_DOWNLOAD_DIR", "_SILVER_DIR", "_REJECTS_DIR")
DEFAULT_SPARK_CONFS = (("spark.sql.shuffle.partitions", "4"),)
DVF_SPARK_CONFS = (
    ("spark.sql.shuffle.partitions", "8"),
    ("spark.driver.memory", os.environ.get("SPARK_DRIVER_MEMORY", "2g")),
    ("spark.executor.memory", os.environ.get("SPARK_EXECUTOR_MEMORY", "2g")),
)
TRUTHY_VALUES = ("1", "true", "yes")


def pg_conn_params() -> dict[str, str | int]:
    return {
        "host": os.environ.get("POSTGIS_HOST", "postgis"),
        "port": int(os.environ.get("POSTGIS_PORT", "5432")),
        "dbname": os.environ.get("POSTGRES_DB", "homepedia"),
        "user": os.environ.get("POSTGRES_USER", "postgres"),
        "password": os.environ.get("POSTGRES_PASSWORD", "postgres"),
    }


def env_flag(name: str) -> bool:
    return os.environ.get(name, "").lower() in TRUTHY_VALUES


def spark_env_vars() -> dict[str, str]:
    """Variables de chemins data à transmettre au conteneur Spark via docker exec."""
    return {
        key: value
        for key, value in os.environ.items()
        if value and any(key.endswith(suffix) for suffix in SPARK_ENV_SUFFIXES)
    }


def run_spark_submit(
    job_path: str,
    extra_args: list[str] | None = None,
    extra_confs: tuple[tuple[str, str], ...] | None = None,
) -> None:
    master = os.environ.get("SPARK_MASTER", "local[*]")
    inner = [
        "/opt/spark/bin/spark-submit",
        "--master",
        master,
        "--jars",
        SPARK_POSTGRES_JAR,
    ]
    for key, value in extra_confs or DEFAULT_SPARK_CONFS:
        inner.extend(["--conf", f"{key}={value}"])
    inner.append(job_path)
    if extra_args:
        inner.extend(extra_args)

    cmd = ["docker", "exec"]
    for key, value in spark_env_vars().items():
        cmd.extend(["-e", f"{key}={value}"])
    cmd.append(SPARK_CONTAINER)
    cmd.extend(inner)

    print("Commande Spark :", " ".join(cmd), file=sys.stderr)
    subprocess.run(cmd, check=True)


def run_filosofi_income_spark() -> None:
    run_spark_submit(FILOSOFI_INCOME_JOB)


def run_delinquance_crimes_spark() -> None:
    run_spark_submit(DELINQUANCE_CRIMES_JOB)


def run_recensement_population_spark() -> None:
    run_spark_submit(RECENSEMENT_POPULATION_JOB)


def run_dvf_mutations_spark(year: int, link_plots: bool = False) -> None:
    extra_args = ["--year", str(year)]
    # Liaison plotId activable via env (plots = 94M lignes, opt-in).
    if link_plots or env_flag("DVF_LINK_PLOTS"):
        extra_args.append("--link-plots")
    run_spark_submit(
        DVF_MUTATIONS_JOB,
        extra_args=extra_args,
        extra_confs=DVF_SPARK_CONFS,
    )


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

    conn = psycopg2.connect(**pg_conn_params())
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


def report_delinquance_crimes_silver() -> None:
    silver_dir = os.environ.get(
        "DELINQUANCE_SILVER_DIR", "/opt/airflow/data/silver/delinquance/crimes"
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
            print(f"{name}: {rows} lignes ({size_kb:.1f} KB)")
        elif name.endswith(".parquet") and os.path.isdir(path):
            print(f"{name}/ (Parquet)")


def report_recensement_population_silver() -> None:
    silver_dir = os.environ.get(
        "RECENSEMENT_SILVER_DIR", "/opt/airflow/data/silver/recensement/population"
    )
    if not os.path.isdir(silver_dir):
        print(f"Aucune donnée silver dans {silver_dir}")
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


def report_recensement_population_db() -> None:
    try:
        import psycopg2
    except ImportError:
        print("psycopg2 indisponible — rapport base ignoré")
        return

    conn = psycopg2.connect(**pg_conn_params())
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM populate_cities")
            total = cur.fetchone()[0]
            cur.execute(
                "SELECT annee, COUNT(*) FROM populate_cities GROUP BY annee ORDER BY annee"
            )
            by_year = cur.fetchall()
        print(f"populate_cities : {total} ligne(s) en base")
        for annee, n in by_year:
            print(f"  annee {annee}: {n}")
    finally:
        conn.close()


def report_delinquance_crimes_db() -> None:
    try:
        import psycopg2
    except ImportError:
        print("psycopg2 indisponible — rapport base ignore")
        return

    conn = psycopg2.connect(**pg_conn_params())
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM crimes_cities")
            total = cur.fetchone()[0]
            cur.execute(
                "SELECT annee, COUNT(*) FROM crimes_cities GROUP BY annee ORDER BY annee"
            )
            by_year = cur.fetchall()
        print(f"crimes_cities : {total} ligne(s) en base")
        for annee, n in by_year:
            print(f"  annee {annee}: {n}")
    finally:
        conn.close()


def report_dvf_mutations_silver() -> None:
    silver_dir = os.environ.get(
        "DVF_SILVER_DIR", "/opt/airflow/data/silver/dvf/mutations"
    )
    if not os.path.isdir(silver_dir):
        print(f"Aucune donnee silver dans {silver_dir}")
        return
    for name in sorted(os.listdir(silver_dir)):
        path = os.path.join(silver_dir, name)
        if name.endswith(".parquet") and os.path.isdir(path):
            print(f"{name}/ (Parquet)")


def report_dvf_mutations_db() -> None:
    try:
        import psycopg2
    except ImportError:
        print("psycopg2 indisponible — rapport base ignore")
        return

    conn = psycopg2.connect(**pg_conn_params())
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM mutations")
            total = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM mutation_locals")
            total_locals = cur.fetchone()[0]
            cur.execute('SELECT COUNT(*) FROM mutation_locals WHERE "plotId" IS NOT NULL')
            with_plot = cur.fetchone()[0]
            cur.execute(
                "SELECT annee, COUNT(*) FROM mutations GROUP BY annee ORDER BY annee"
            )
            by_year = cur.fetchall()
        print(f"mutations : {total} vente(s) en base")
        print(f"mutation_locals : {total_locals} lot(s) ({with_plot} lie(s) a une parcelle)")
        for annee, n in by_year:
            print(f"  annee {annee}: {n} vente(s)")
    finally:
        conn.close()
