"""
Silver — populations légales communales (INSEE recensement).

Bronze  : airflow/data/recensement/<annee>/*.csv
Silver  : airflow/data/silver/recensement/population/  (Parquet + CSV par année)
Rejets  : airflow/data/silver/recensement/rejects/
Gold    : table PostGIS populate_cities (jointure cities.code)

Lancement (conteneur Spark) :
  docker compose exec spark /opt/spark/bin/spark-submit \\
    --jars /opt/spark/jars/postgresql-42.7.3.jar \\
    /opt/spark-jobs/silver/recensement_population.py

Prérequis base : table cities remplie (DAG download_contours_administratifs).
"""

from __future__ import annotations

import argparse
import csv
import os
import shutil
from datetime import datetime, timezone

import psycopg2
from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F

DEFAULT_BRONZE = os.environ.get("RECENSEMENT_DOWNLOAD_DIR", "/opt/airflow/data/recensement")
DEFAULT_SILVER = os.environ.get(
    "RECENSEMENT_SILVER_DIR", "/opt/airflow/data/silver/recensement/population"
)
DEFAULT_REJECTS = os.environ.get(
    "RECENSEMENT_REJECTS_DIR", "/opt/airflow/data/silver/recensement/rejects"
)

MISSING = ("", "s", "ns", "nd", "n/a", "na", "so")
ENCODINGS = ("utf-8", "latin-1")

# Sentinel pour le cas 2019-2020 où le code commune est reconstruit depuis deux colonnes.
COMPOSITE_CODE = "CODDEP+CODCOM"


def detect_commune_csv(year_dir: str) -> tuple[str, str, str]:
    """
    Trouve le CSV communes dans year_dir et identifie la stratégie de code INSEE.
    Retourne (chemin, code_strategy, encoding).

    Stratégies possibles selon le millésime INSEE :
      - "DEPCOM"       → colonne directe (2017-2018, Communes.csv)
      - "COM"          → colonne directe, COM = code, Commune = nom (2021-2023)
      - "CODGEO"       → colonne directe générique
      - "CODDEP+CODCOM"→ concaténation department + commune (2019-2020)
    """
    all_csvs = sorted(f for f in os.listdir(year_dir) if f.lower().endswith(".csv"))
    if not all_csvs:
        raise FileNotFoundError(f"Aucun CSV dans {year_dir}")

    preferred = [f for f in all_csvs if "commune" in f.lower()]
    candidates = preferred if preferred else all_csvs

    for filename in candidates:
        path = os.path.join(year_dir, filename)
        for enc in ENCODINGS:
            try:
                with open(path, encoding=enc, newline="") as fh:
                    headers = [h.strip().upper() for h in next(csv.reader(fh, delimiter=";"))]
            except (UnicodeDecodeError, StopIteration):
                continue

            if "PMUN" not in headers:
                continue

            # 2017-2018 : DEPCOM contient le code 5 chiffres, COM est le nom
            if "DEPCOM" in headers:
                return path, "DEPCOM", enc

            # générique (certains exports CODGEO)
            if "CODGEO" in headers:
                return path, "CODGEO", enc

            # 2021-2023 : COM = code 5 chiffres, colonne "Commune" (uppercased) = nom
            if "COM" in headers and "COMMUNE" in headers:
                return path, "COM", enc

            # 2019-2020 : pas de colonne code unique, reconstruction CODDEP + CODCOM
            if "CODDEP" in headers and "CODCOM" in headers:
                return path, COMPOSITE_CODE, enc

    raise FileNotFoundError(
        f"Aucun CSV avec code commune identifiable + PMUN dans {year_dir}. "
        f"Fichiers trouvés : {all_csvs}"
    )


def build_silver(
    bronze: DataFrame,
    *,
    annee: int,
    code_strategy: str,
    source_file: str,
    processed_at: str,
) -> tuple[DataFrame, DataFrame]:
    actual_pmun = next((c for c in bronze.columns if c.upper() == "PMUN"), None)
    if not actual_pmun:
        raise ValueError(f"Colonne PMUN introuvable parmi : {bronze.columns}")

    if code_strategy == COMPOSITE_CODE:
        # 2019-2020 : reconstruction depuis CODDEP (dept, 2 car) + CODCOM (commune, 3 car)
        dep_col = next((c for c in bronze.columns if c.upper() == "CODDEP"), None)
        com_col = next((c for c in bronze.columns if c.upper() == "CODCOM"), None)
        if not dep_col or not com_col:
            raise ValueError(f"Colonnes CODDEP/CODCOM introuvables parmi : {bronze.columns}")
        code_expr = F.concat(
            F.lpad(F.trim(F.col(dep_col)), 2, "0"),
            F.lpad(F.trim(F.col(com_col)), 3, "0"),
        )
    else:
        actual_code = next((c for c in bronze.columns if c.upper() == code_strategy.upper()), None)
        if not actual_code:
            raise ValueError(f"Colonne {code_strategy} introuvable parmi : {bronze.columns}")
        code_expr = F.upper(F.trim(F.col(actual_code)))

    pmun_parsed = (
        F.when(F.lower(F.trim(F.col(actual_pmun))).isin(*MISSING), None)
        .otherwise(F.regexp_replace(F.trim(F.col(actual_pmun)), ",", "."))
        .cast("integer")
    )

    typed = (
        bronze.select(
            code_expr.alias("code_insee"),
            pmun_parsed.alias("population"),
        )
        .withColumn("annee", F.lit(annee))
        .withColumn("source_file", F.lit(source_file))
        .withColumn("processed_at", F.lit(processed_at))
    )

    valid_code = F.col("code_insee").rlike(r"^(\d{5}|2[AB]\d{3})$")
    valid_pop = F.col("population").isNotNull() & (F.col("population") > 0)

    silver = (
        typed.filter(valid_code & valid_pop)
        .select("code_insee", "annee", "population", "source_file", "processed_at")
    )

    rejects = (
        typed.filter(~(valid_code & valid_pop))
        .select(
            "code_insee",
            "annee",
            "population",
            F.when(~valid_code, F.lit("code_insee invalide"))
            .when(~valid_pop, F.lit("population manquante ou nulle"))
            .otherwise(F.lit("validation metier"))
            .alias("motif"),
            "source_file",
        )
    )

    return silver, rejects


def pg_conn_params() -> dict[str, str | int]:
    return {
        "host": os.environ.get("POSTGIS_HOST", "postgis"),
        "port": int(os.environ.get("POSTGIS_PORT", "5432")),
        "dbname": os.environ.get("POSTGRES_DB", "homepedia"),
        "user": os.environ.get("POSTGRES_USER", "postgres"),
        "password": os.environ.get("POSTGRES_PASSWORD", "postgres"),
    }


def jdbc_url() -> str:
    p = pg_conn_params()
    return f"jdbc:postgresql://{p['host']}:{p['port']}/{p['dbname']}"


def jdbc_properties() -> dict[str, str]:
    p = pg_conn_params()
    return {
        "user": str(p["user"]),
        "password": str(p["password"]),
        "driver": "org.postgresql.Driver",
    }


def delete_populate_for_year(annee: int) -> None:
    with psycopg2.connect(**pg_conn_params()) as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM populate_cities WHERE annee = %s", (annee,))
        conn.commit()


def load_populate_cities(
    spark: SparkSession, silver: DataFrame, annee: int
) -> tuple[int, int, int]:
    """Joint silver × cities et charge populate_cities (idempotent par année)."""
    cities = spark.read.jdbc(
        jdbc_url(),
        "(SELECT id, code FROM cities) AS cities_ref",
        properties=jdbc_properties(),
    )

    joined = (
        silver.alias("s")
        .join(
            cities.alias("c"),
            F.upper(F.trim(F.col("s.code_insee"))) == F.upper(F.trim(F.col("c.code"))),
            "inner",
        )
        .select(
            F.col("c.id").alias("cityId"),
            F.col("s.annee").cast("short").alias("annee"),
            F.col("s.population").cast("int").alias("population"),
        )
    )

    silver_count = silver.count()
    loaded_count = joined.count()
    orphans = silver_count - loaded_count

    delete_populate_for_year(annee)

    joined.write.jdbc(
        url=jdbc_url(),
        table="populate_cities",
        mode="append",
        properties=jdbc_properties(),
    )

    return silver_count, loaded_count, orphans


def write_single_csv(df: DataFrame, csv_path: str) -> None:
    tmp_dir = csv_path + "_tmp"
    df.coalesce(1).write.mode("overwrite").option("header", True).csv(tmp_dir)
    part_files = [
        f for f in os.listdir(tmp_dir) if f.startswith("part-") and f.endswith(".csv")
    ]
    if part_files:
        os.replace(os.path.join(tmp_dir, part_files[0]), csv_path)
    shutil.rmtree(tmp_dir, ignore_errors=True)


def find_year_dirs(bronze_dir: str) -> list[tuple[int, str]]:
    """Retourne les sous-répertoires d'année triés (année, chemin)."""
    if not os.path.isdir(bronze_dir):
        raise FileNotFoundError(f"Répertoire bronze introuvable : {bronze_dir}")

    result = []
    for entry in os.listdir(bronze_dir):
        path = os.path.join(bronze_dir, entry)
        if not os.path.isdir(path):
            continue
        try:
            result.append((int(entry), path))
        except ValueError:
            continue

    if not result:
        raise FileNotFoundError(
            f"Aucun répertoire d'année dans {bronze_dir}. "
            "Lancez d'abord le DAG download_recensement_populations_legales."
        )

    return sorted(result)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Silver recensement — populations légales communales (PMUN)"
    )
    parser.add_argument("--bronze-dir", default=DEFAULT_BRONZE)
    parser.add_argument("--silver-dir", default=DEFAULT_SILVER)
    parser.add_argument("--rejects-dir", default=DEFAULT_REJECTS)
    parser.add_argument(
        "--skip-db",
        action="store_true",
        help="Ne pas charger populate_cities en base (fichiers silver uniquement)",
    )
    args = parser.parse_args()

    year_dirs = find_year_dirs(args.bronze_dir)
    processed_at = datetime.now(timezone.utc).isoformat()

    spark = (
        SparkSession.builder.appName("Homepedia-RecensementPopulation")
        .config("spark.sql.shuffle.partitions", "4")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")

    os.makedirs(args.silver_dir, exist_ok=True)
    os.makedirs(args.rejects_dir, exist_ok=True)

    total_silver = 0
    total_loaded = 0
    total_rejects = 0

    for annee, year_dir in year_dirs:
        try:
            csv_path, code_strategy, encoding = detect_commune_csv(year_dir)
        except FileNotFoundError as exc:
            print(f"[{annee}] SKIP : {exc}")
            continue

        source_file = os.path.basename(csv_path)
        spark_encoding = "UTF-8" if encoding == "utf-8" else "ISO-8859-1"

        bronze = (
            spark.read.option("header", True)
            .option("sep", ";")
            .option("encoding", spark_encoding)
            .option("inferSchema", False)
            .csv(csv_path)
        )

        silver, rejects = build_silver(
            bronze,
            annee=annee,
            code_strategy=code_strategy,
            source_file=source_file,
            processed_at=processed_at,
        )

        silver.cache()

        base_name = f"population_{annee}_recensement"
        parquet_dir = os.path.join(args.silver_dir, f"{base_name}.parquet")
        silver_csv = os.path.join(args.silver_dir, f"{base_name}.csv")
        rejects_csv = os.path.join(args.rejects_dir, f"{base_name}_rejects.csv")

        silver.write.mode("overwrite").parquet(parquet_dir)
        write_single_csv(silver, silver_csv)
        write_single_csv(rejects, rejects_csv)

        ok = silver.count()
        ko = rejects.count()
        total_silver += ok
        total_rejects += ko

        print(
            f"Silver Recensement [{annee}/{source_file}] : "
            f"{ok} communes silver, {ko} rejetées"
        )

        if args.skip_db:
            silver.unpersist()
            continue

        silver_count, loaded_count, orphans = load_populate_cities(spark, silver, annee)
        total_loaded += loaded_count
        print(
            f"  populate_cities [{annee}] : {silver_count} silver, "
            f"{loaded_count} chargées, {orphans} sans commune en base"
        )

        silver.unpersist()

    print(
        f"\nTotal : {total_silver} silver, {total_loaded} chargées, "
        f"{total_rejects} rejetées"
    )

    if args.skip_db:
        print("Chargement base ignoré (--skip-db)")

    spark.stop()


if __name__ == "__main__":
    main()