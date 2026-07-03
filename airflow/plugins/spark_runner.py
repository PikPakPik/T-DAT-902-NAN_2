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
PREPARE_SECTIONS_KEY_JOB = "/opt/spark-jobs/silver/prepare_sections_key.py"
LOYERS_LOAD_JOB = "/opt/spark-jobs/load_loyers.py"
DPE_LOAD_JOB = "/opt/spark-jobs/silver/dpe_load.py"
SPARK_CONTAINER = os.environ.get("SPARK_CONTAINER_NAME", "homepedia-spark")
SPARK_POSTGRES_JAR = "/opt/spark/jars/postgresql-42.7.3.jar"
# Chemins data : tout *_DOWNLOAD_DIR / *_SILVER_DIR / *_REJECTS_DIR est transmis
# au conteneur Spark (POSTGIS/POSTGRES sont déjà définis dans compose.yaml).
SPARK_ENV_SUFFIXES = ("_DOWNLOAD_DIR", "_SILVER_DIR", "_REJECTS_DIR")
SPARK_ENV_KEYS = (
    "DPE_OUTPUT_PARTITIONS",
    "DPE_SHUFFLE_PARTITIONS",
    "DPE_DEFAULT_PARALLELISM",
    "DPE_DRIVER_MEMORY",
    "DPE_EXECUTOR_MEMORY",
)
SPARK_EXEC_ENV_DEFAULTS = {
    "HOME": "/tmp",
    "USER": "airflow",
    "LOGNAME": "airflow",
    "HADOOP_USER_NAME": "airflow",
    "SPARK_SUBMIT_OPTS": "-Duser.home=/tmp",
}
DEFAULT_SPARK_CONFS = (("spark.sql.shuffle.partitions", "4"),)
DVF_SPARK_CONFS = (
    ("spark.sql.shuffle.partitions", "8"),
    ("spark.driver.memory", os.environ.get("SPARK_DRIVER_MEMORY", "2g")),
    ("spark.executor.memory", os.environ.get("SPARK_EXECUTOR_MEMORY", "2g")),
)
DPE_SPARK_CONFS = (
    ("spark.sql.shuffle.partitions", os.environ.get("DPE_SHUFFLE_PARTITIONS", "128")),
    ("spark.default.parallelism", os.environ.get("DPE_DEFAULT_PARALLELISM", "128")),
    ("spark.driver.memory", os.environ.get("DPE_DRIVER_MEMORY", "4g")),
    ("spark.executor.memory", os.environ.get("DPE_EXECUTOR_MEMORY", "4g")),
    ("spark.sql.parquet.enableDictionary", "false"),
)
TRUTHY_VALUES = ("1", "true", "yes")

DVF_STATS_CITIES_SQL = """
WITH base AS (
  SELECT
    c.id AS city_id,
    m.annee,
    ml.type_local,
    m.prix_m2::numeric AS prix_m2,
    ml.surface_reelle_bati::numeric AS surface_reelle_bati
  FROM mutations m
  INNER JOIN mutation_locals ml ON ml."mutationId" = m.id
  INNER JOIN plots p ON p.id = ml."plotId"
  INNER JOIN sections s ON s.id = p."sectionId"
  INNER JOIN cities c ON c.id = s."cityId"
  WHERE m.prix_m2 IS NOT NULL
    AND m.prix_m2 > 0
    AND ml.surface_reelle_bati IS NOT NULL
    AND ml.surface_reelle_bati > 0
    AND ml.type_local IN ('Maison', 'Appartement')
),
aggregated AS (
  SELECT
    city_id,
    annee,
    type_local,
    ROUND(
      percentile_cont(0.5) WITHIN GROUP (ORDER BY prix_m2)::numeric,
      2
    ) AS prix_median_m2,
    ROUND(AVG(prix_m2), 2) AS prix_moyen_m2,
    ROUND(
      percentile_cont(0.5) WITHIN GROUP (ORDER BY surface_reelle_bati)::numeric,
      2
    ) AS surface_mediane,
    COUNT(*)::integer AS nb_transactions
  FROM base
  GROUP BY city_id, annee, type_local
),
with_evolution AS (
  SELECT
    *,
    LAG(prix_median_m2) OVER (
      PARTITION BY city_id, type_local
      ORDER BY annee
    ) AS previous_prix_median_m2
  FROM aggregated
)
INSERT INTO stats_cities (
  "cityId",
  annee,
  type_local,
  prix_median_m2,
  prix_moyen_m2,
  surface_mediane,
  nb_transactions,
  evolution_prix_pct
)
SELECT
  city_id,
  annee,
  type_local,
  prix_median_m2,
  prix_moyen_m2,
  surface_mediane,
  nb_transactions,
  COALESCE(
    ROUND(
      ((prix_median_m2 - previous_prix_median_m2)
        / NULLIF(previous_prix_median_m2, 0)
      ) * 100,
      2
    ),
    0
  ) AS evolution_prix_pct
FROM with_evolution
"""

DVF_STATS_DEPARTMENTS_SQL = """
WITH base AS (
  SELECT
    d.id AS department_id,
    m.annee,
    ml.type_local,
    m.prix_m2::numeric AS prix_m2,
    ml.surface_reelle_bati::numeric AS surface_reelle_bati
  FROM mutations m
  INNER JOIN mutation_locals ml ON ml."mutationId" = m.id
  INNER JOIN plots p ON p.id = ml."plotId"
  INNER JOIN sections s ON s.id = p."sectionId"
  INNER JOIN cities c ON c.id = s."cityId"
  INNER JOIN departments d ON d.id = c."departmentId"
  WHERE m.prix_m2 IS NOT NULL
    AND m.prix_m2 > 0
    AND ml.surface_reelle_bati IS NOT NULL
    AND ml.surface_reelle_bati > 0
    AND ml.type_local IN ('Maison', 'Appartement')
),
aggregated AS (
  SELECT
    department_id,
    annee,
    type_local,
    ROUND(
      percentile_cont(0.5) WITHIN GROUP (ORDER BY prix_m2)::numeric,
      2
    ) AS prix_median_m2,
    ROUND(AVG(prix_m2), 2) AS prix_moyen_m2,
    ROUND(
      percentile_cont(0.5) WITHIN GROUP (ORDER BY surface_reelle_bati)::numeric,
      2
    ) AS surface_mediane,
    COUNT(*)::integer AS nb_transactions
  FROM base
  GROUP BY department_id, annee, type_local
),
with_evolution AS (
  SELECT
    *,
    LAG(prix_median_m2) OVER (
      PARTITION BY department_id, type_local
      ORDER BY annee
    ) AS previous_prix_median_m2
  FROM aggregated
)
INSERT INTO stats_departments (
  "departmentId",
  annee,
  type_local,
  prix_median_m2,
  prix_moyen_m2,
  surface_mediane,
  nb_transactions,
  evolution_prix_pct
)
SELECT
  department_id,
  annee,
  type_local,
  prix_median_m2,
  prix_moyen_m2,
  surface_mediane,
  nb_transactions,
  COALESCE(
    ROUND(
      ((prix_median_m2 - previous_prix_median_m2)
        / NULLIF(previous_prix_median_m2, 0)
      ) * 100,
      2
    ),
    0
  ) AS evolution_prix_pct
FROM with_evolution
"""


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
    data_paths = {
        key: value
        for key, value in os.environ.items()
        if value and any(key.endswith(suffix) for suffix in SPARK_ENV_SUFFIXES)
    }
    job_env = {
        key: os.environ[key]
        for key in SPARK_ENV_KEYS
        if os.environ.get(key)
    }
    return {**SPARK_EXEC_ENV_DEFAULTS, **data_paths, **job_env}


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


def run_dpe_load_spark() -> None:
    run_spark_submit(DPE_LOAD_JOB, extra_confs=DPE_SPARK_CONFS)


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


def run_prepare_sections_key() -> None:
    run_spark_submit(PREPARE_SECTIONS_KEY_JOB, extra_confs=())


def refresh_dvf_stats() -> None:
    try:
        import psycopg2
    except ImportError:
        print("psycopg2 indisponible — stats DVF ignorees")
        return

    conn = psycopg2.connect(**pg_conn_params())
    try:
        with conn.cursor() as cur:
            print("stats_cities/stats_departments : suppression anciennes stats DVF")
            cur.execute("TRUNCATE stats_cities, stats_departments RESTART IDENTITY")
            print("stats_cities : calcul depuis mutations liees aux parcelles")
            cur.execute(DVF_STATS_CITIES_SQL)
            print(f"stats_cities : {cur.rowcount} ligne(s) inseree(s)")
            print("stats_departments : calcul depuis mutations liees aux parcelles")
            cur.execute(DVF_STATS_DEPARTMENTS_SQL)
            print(f"stats_departments : {cur.rowcount} ligne(s) inseree(s)")
        conn.commit()
    finally:
        conn.close()
        
def run_loyers_load_spark(year: int) -> None:
    """Charge dans PostgreSQL les indicateurs ANIL téléchargés pour `year`.

    Appelé depuis le DAG download_carte_loyers, en aval de la tâche de
    téléchargement de la même année. Si cette dernière est skip/échouée
    (dataset non publié pour l'année), Airflow propage l'état par défaut
    (trigger_rule=all_success) et cette tâche ne s'exécute pas.
    """
    run_spark_submit(LOYERS_LOAD_JOB, ["--year", str(year)])


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
            cur.execute("SELECT COUNT(*) FROM stats_cities")
            total_city_stats = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM stats_departments")
            total_department_stats = cur.fetchone()[0]
            cur.execute(
                "SELECT annee, COUNT(*) FROM mutations GROUP BY annee ORDER BY annee"
            )
            by_year = cur.fetchall()
        print(f"mutations : {total} vente(s) en base")
        print(f"mutation_locals : {total_locals} lot(s) ({with_plot} lie(s) a une parcelle)")
        print(f"stats_cities : {total_city_stats} ligne(s)")
        print(f"stats_departments : {total_department_stats} ligne(s)")
        for annee, n in by_year:
            print(f"  annee {annee}: {n} vente(s)")
    finally:
        conn.close()
