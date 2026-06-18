"""
Silver — revenus communaux Filosofi (INSEE).

Bronze  : airflow/data/bronze/filosofi/{geoYYYY}/cc_filosofi_YYYY_COM.csv
          (alias legacy : airflow/data/filosofi/)
Silver  : airflow/data/silver/filosofi/income/  (Parquet + CSV)
Rejets  : airflow/data/silver/filosofi/rejects/
Gold    : table PostGIS income_cities (jointure cities.code)

Lancement (conteneur Spark) :
  docker compose exec spark /opt/spark/bin/spark-submit \\
    --jars /opt/spark/jars/postgresql-42.7.3.jar \\
    /opt/spark-jobs/silver/filosofi_income.py

Prérequis base : table cities remplie (DAG download_contours_administratifs).
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
from datetime import datetime, timezone

import psycopg2
from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import IntegerType

COMMUNE_CSV_RE = re.compile(r"^cc_filosofi_(\d{4})_COM\.csv$", re.I)
GEO_DIR_RE = re.compile(r"^geo\d{4}$", re.I)
MISSING = ("", "s", "ns", "so", "nd", "n/a", "na")

DEFAULT_BRONZE = os.environ.get(
    "FILOSOFI_DOWNLOAD_DIR", "/opt/airflow/data/filosofi"
)
DEFAULT_SILVER = os.environ.get(
    "FILOSOFI_SILVER_DIR", "/opt/airflow/data/silver/filosofi/income"
)
DEFAULT_REJECTS = os.environ.get(
    "FILOSOFI_REJECTS_DIR", "/opt/airflow/data/silver/filosofi/rejects"
)


def find_latest_commune_bronze(bronze_dir: str) -> tuple[str, str, int, str]:
    if not os.path.isdir(bronze_dir):
        raise FileNotFoundError(f"Repertoire bronze introuvable : {bronze_dir}")

    candidates: list[tuple[str, int, str, str]] = []
    for entry in os.listdir(bronze_dir):
        geo_dir = os.path.join(bronze_dir, entry)
        if not os.path.isdir(geo_dir):
            continue
        geo_label = entry if GEO_DIR_RE.match(entry) else entry
        for filename in os.listdir(geo_dir):
            match = COMMUNE_CSV_RE.match(filename)
            if match:
                candidates.append(
                    (geo_label, int(match.group(1)), os.path.join(geo_dir, filename), filename)
                )

    if not candidates:
        raise FileNotFoundError(
            f"Aucun cc_filosofi_YYYY_COM.csv dans {bronze_dir}. "
            "Lancez d'abord le DAG download_filosofi."
        )

    candidates.sort(key=lambda c: (c[0], c[1]), reverse=True)
    geo_label, annee, path, filename = candidates[0]
    return path, geo_label, annee, filename


def to_double(column: str):
    """Convertit une colonne CSV INSEE (virgule, 's' = confidentiel) en double."""
    normalized = F.lower(F.trim(F.col(column)))
    cleaned = F.when(normalized.isin(*MISSING), None).otherwise(
        F.regexp_replace(normalized, ",", ".")
    )
    return cleaned.cast("double")


def to_int(column: str):
    value = to_double(column)
    return F.when(value.isNull(), None).otherwise(value.cast(IntegerType()))


def build_silver(
    bronze: DataFrame,
    *,
    annee: int,
    source_geo: str,
    source_file: str,
    processed_at: str,
) -> tuple[DataFrame, DataFrame]:
    required = ["CODGEO", "NBMENFISC21", "MED21", "D121", "D921", "TP6021"]
    missing = [c for c in required if c not in bronze.columns]
    if missing:
        raise ValueError(f"Colonnes manquantes : {', '.join(missing)}")

    code_insee = F.upper(F.trim(F.col("CODGEO")))
    nb_menages = to_int("NBMENFISC21")
    mediane = to_double("MED21")
    decile1 = to_double("D121")
    decile9 = to_double("D921")
    taux_pauvrete = to_double("TP6021")

    typed = bronze.select(
        code_insee.alias("code_insee"),
        nb_menages.alias("nb_menages"),
        mediane.alias("mediane_salaire"),
        decile1.alias("decile1_salaire"),
        decile9.alias("decile9_salaire"),
        taux_pauvrete.alias("taux_pauvrete"),
        F.col("CODGEO"),
        F.col("NBMENFISC21"),
        F.col("MED21"),
        F.col("D121"),
        F.col("D921"),
        F.col("TP6021"),
    )

    valid_code = F.col("code_insee").rlike(r"^(\d{5}|2[AB]\d{3})$")
    all_present = (
        F.col("nb_menages").isNotNull()
        & F.col("mediane_salaire").isNotNull()
        & F.col("decile1_salaire").isNotNull()
        & F.col("decile9_salaire").isNotNull()
        & F.col("taux_pauvrete").isNotNull()
    )
    valid_ranges = (
        (F.col("nb_menages") > 0)
        & (F.col("mediane_salaire") >= 0)
        & (F.col("decile1_salaire") >= 0)
        & (F.col("decile9_salaire") >= 0)
        & (F.col("taux_pauvrete") >= 0)
        & (F.col("taux_pauvrete") <= 100)
        & (F.col("decile1_salaire") <= F.col("mediane_salaire"))
        & (F.col("mediane_salaire") <= F.col("decile9_salaire"))
    )

    enriched = typed.withColumn("annee", F.lit(annee))
    enriched = enriched.withColumn("source_geo", F.lit(source_geo))
    enriched = enriched.withColumn("source_file", F.lit(source_file))
    enriched = enriched.withColumn("processed_at", F.lit(processed_at))

    silver = (
        enriched.filter(valid_code & all_present & valid_ranges)
        .select(
            "code_insee",
            "annee",
            F.round("mediane_salaire", 2).alias("mediane_salaire"),
            F.round("decile1_salaire", 2).alias("decile1_salaire"),
            F.round("decile9_salaire", 2).alias("decile9_salaire"),
            F.round("taux_pauvrete", 2).alias("taux_pauvrete"),
            "nb_menages",
            "source_geo",
            "source_file",
            "processed_at",
        )
    )

    rejects = (
        enriched.filter(~(valid_code & all_present & valid_ranges))
        .select(
            F.coalesce("code_insee", F.trim("CODGEO")).alias("code_insee"),
            F.when(~valid_code, F.lit("code_insee invalide"))
            .when(~all_present, F.lit("donnee manquante ou confidentielle"))
            .otherwise(F.lit("validation metier"))
            .alias("motif"),
            F.lit(source_file).alias("source_file"),
            "CODGEO",
            "NBMENFISC21",
            "MED21",
            "D121",
            "D921",
            "TP6021",
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


def delete_income_for_years(annees: list[int]) -> None:
    if not annees:
        return
    with psycopg2.connect(**pg_conn_params()) as conn:
        with conn.cursor() as cur:
            for annee in annees:
                cur.execute("DELETE FROM income_cities WHERE annee = %s", (annee,))
        conn.commit()


def load_income_cities(spark: SparkSession, silver: DataFrame) -> tuple[int, int, int]:
    """Joint silver × cities et charge income_cities (idempotent par année)."""
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
            F.col("s.mediane_salaire").cast("decimal(10,2)").alias("mediane_salaire"),
            F.col("s.decile1_salaire").cast("decimal(10,2)").alias("decile1_salaire"),
            F.col("s.decile9_salaire").cast("decimal(10,2)").alias("decile9_salaire"),
            F.col("s.taux_pauvrete").cast("decimal(10,2)").alias("taux_pauvrete"),
            F.col("s.nb_menages").cast("int").alias("nb_menages"),
        )
    )

    silver_count = silver.count()
    loaded_count = joined.count()
    orphans = silver_count - loaded_count

    annees = [int(r.annee) for r in joined.select("annee").distinct().collect()]
    delete_income_for_years(annees)

    joined.write.jdbc(
        url=jdbc_url(),
        table="income_cities",
        mode="append",
        properties=jdbc_properties(),
    )

    return silver_count, loaded_count, orphans


def main() -> None:
    parser = argparse.ArgumentParser(description="Silver Filosofi — revenus communaux")
    parser.add_argument("--bronze-dir", default=DEFAULT_BRONZE)
    parser.add_argument("--silver-dir", default=DEFAULT_SILVER)
    parser.add_argument("--rejects-dir", default=DEFAULT_REJECTS)
    parser.add_argument(
        "--skip-db",
        action="store_true",
        help="Ne pas charger income_cities en base (fichiers silver uniquement)",
    )
    args = parser.parse_args()

    bronze_path, source_geo, annee, source_file = find_latest_commune_bronze(
        args.bronze_dir
    )
    processed_at = datetime.now(timezone.utc).isoformat()

    spark = (
        SparkSession.builder.appName("Homepedia-FilosofiIncome")
        .config("spark.sql.shuffle.partitions", "4")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")

    bronze = (
        spark.read.option("header", True)
        .option("sep", ";")
        .option("encoding", "UTF-8")
        .option("inferSchema", False)
        .csv(bronze_path)
    )

    silver, rejects = build_silver(
        bronze,
        annee=annee,
        source_geo=source_geo,
        source_file=source_file,
        processed_at=processed_at,
    )

    os.makedirs(args.silver_dir, exist_ok=True)
    os.makedirs(args.rejects_dir, exist_ok=True)

    base_name = f"income_{source_geo}_filosofi{annee}"
    parquet_dir = os.path.join(args.silver_dir, f"{base_name}.parquet")
    csv_path = os.path.join(args.silver_dir, f"{base_name}.csv")
    rejects_path = os.path.join(args.rejects_dir, f"{base_name}_rejects.csv")

    silver.write.mode("overwrite").parquet(parquet_dir)
    silver.coalesce(1).write.mode("overwrite").option("header", True).csv(
        csv_path + "_tmp"
    )
    tmp_dir = csv_path + "_tmp"
    part_files = [
        f for f in os.listdir(tmp_dir) if f.startswith("part-") and f.endswith(".csv")
    ]
    if part_files:
        os.replace(os.path.join(tmp_dir, part_files[0]), csv_path)
    shutil.rmtree(tmp_dir, ignore_errors=True)

    rej_tmp = rejects_path + "_tmp"
    rejects.coalesce(1).write.mode("overwrite").option("header", True).csv(rej_tmp)
    rej_parts = [
        f for f in os.listdir(rej_tmp) if f.startswith("part-") and f.endswith(".csv")
    ]
    if rej_parts:
        os.replace(os.path.join(rej_tmp, rej_parts[0]), rejects_path)
    shutil.rmtree(rej_tmp, ignore_errors=True)

    total = bronze.count()
    ok = silver.count()
    ko = rejects.count()
    print(
        f"Silver Filosofi [{source_geo}/{source_file}] : "
        f"{total} lues, {ok} silver, {ko} rejetees"
    )
    print(f"  Parquet : {parquet_dir}")
    print(f"  CSV     : {csv_path}")
    print(f"  Rejets  : {rejects_path}")

    if args.skip_db:
        print("Chargement base ignore (--skip-db)")
    else:
        silver_count, loaded_count, orphans = load_income_cities(spark, silver)
        print(
            f"income_cities : {silver_count} silver, "
            f"{loaded_count} chargees, {orphans} sans commune en base"
        )

    spark.stop()


if __name__ == "__main__":
    main()
