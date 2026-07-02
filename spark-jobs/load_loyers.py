"""
Charge les indicateurs ANIL (carte des loyers) dans PostgreSQL (table rents).

Usage:
  spark-submit /opt/spark-jobs/load_loyers.py [--year YYYY] [--data-dir PATH]

Variables d'environnement:
  LOYERS_YEAR, LOYERS_DATA_DIR, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
"""
from __future__ import annotations

import argparse
import glob
import logging
import os
import sys

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql.functions import col, lit, lpad, regexp_replace, trim
from pyspark.sql.types import DoubleType, IntegerType

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("load_loyers")

POSTGRES_JAR = "/opt/spark/jars/postgresql-42.7.3.jar"
DEFAULT_DATA_DIR = "/opt/airflow/data/carte_loyers"

# Fichiers ANIL (noms stables sur data.gouv.fr)
CSV_SUFFIXES = {
    "loyer_median_apt": "pred-app-mef-dhup",
    "loyer_median_t1t2": "pred-app12-mef-dhup",
    "loyer_median_t3plus": "pred-app3-mef-dhup",
    "loyer_median_maison": "pred-mai-mef-dhup",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Charge les loyers ANIL dans PostgreSQL")
    parser.add_argument(
        "--year",
        type=int,
        default=int(os.getenv("LOYERS_YEAR", "0")) or None,
        help="Année des indicateurs (dossier carte_loyers/<year>/)",
    )
    parser.add_argument(
        "--data-dir",
        default=os.getenv("LOYERS_DATA_DIR", DEFAULT_DATA_DIR),
        help="Répertoire racine des téléchargements Airflow",
    )
    return parser.parse_args()


def build_spark() -> SparkSession:
    return (
        SparkSession.builder.appName("Homepedia-LoadLoyers")
        .config("spark.jars", POSTGRES_JAR)
        .getOrCreate()
    )


def jdbc_config() -> tuple[str, dict[str, str]]:
    user = os.getenv("POSTGRES_USER", "postgres")
    password = os.getenv("POSTGRES_PASSWORD", "postgres")
    database = os.getenv("POSTGRES_DB", "homepedia")
    url = f"jdbc:postgresql://postgis:5432/{database}"
    props = {
        "user": user,
        "password": password,
        "driver": "org.postgresql.Driver",
    }
    return url, props


def find_csv(year_dir: str, suffix: str) -> str:
    pattern = os.path.join(year_dir, f"*{suffix}*.csv")
    matches = sorted(glob.glob(pattern))
    if not matches:
        raise FileNotFoundError(f"Aucun CSV trouvé pour le motif {pattern}")
    if len(matches) > 1:
        logger.warning("Plusieurs CSV pour %s, utilisation de %s", suffix, matches[0])
    return matches[0]


def read_loyers_csv(spark: SparkSession, path: str) -> DataFrame:
    df = (
        spark.read.option("header", True)
        .option("sep", ";")
        .option("decimal", ",")
        .option("encoding", "UTF-8")
        .csv(path)
    )
    loyer = col("loypredm2")
    r2 = col("R2_adj")
    if dict(df.dtypes).get("loypredm2") == "string":
        loyer = regexp_replace(loyer, ",", ".").cast(DoubleType())
    else:
        loyer = loyer.cast(DoubleType())
    if dict(df.dtypes).get("R2_adj") == "string":
        r2 = regexp_replace(r2, ",", ".").cast(DoubleType())
    else:
        r2 = r2.cast(DoubleType())

    return df.select(
        lpad(trim(col("INSEE_C").cast("string")), 5, "0").alias("code_insee"),
        loyer.alias("loypredm2"),
        col("nbobs_com").cast(IntegerType()).alias("nbobs_com"),
        r2.alias("r2_adj"),
    )


def merge_indicators(spark: SparkSession, year_dir: str) -> DataFrame:
    merged: DataFrame | None = None

    for column, suffix in CSV_SUFFIXES.items():
        path = find_csv(year_dir, suffix)
        df = read_loyers_csv(spark, path)
        if column == "loyer_median_apt":
            part = df.select(
                col("code_insee"),
                col("loypredm2").alias(column),
                col("nbobs_com"),
                col("r2_adj"),
            )
        else:
            part = df.select(
                col("code_insee"),
                col("loypredm2").alias(column),
            )

        if merged is None:
            merged = part
        else:
            merged = merged.join(part, on="code_insee", how="full")

    assert merged is not None
    return merged


def load_cities(spark: SparkSession, jdbc_url: str, props: dict[str, str]) -> DataFrame:
    return (
        spark.read.jdbc(
            url=jdbc_url,
            table="(SELECT id, code FROM cities) AS cities_ref",
            properties=props,
        )
        .withColumn("code", lpad(trim(col("code").cast("string")), 5, "0"))
    )


def delete_year_rows(spark: SparkSession, jdbc_url: str, props: dict[str, str], year: int) -> None:
    conn = spark._jvm.java.sql.DriverManager.getConnection(
        jdbc_url, props["user"], props["password"]
    )
    stmt = None
    try:
        stmt = conn.createStatement()
        deleted = stmt.executeUpdate(f'DELETE FROM rents WHERE "annee" = {int(year)}')
        logger.info("Suppression des loyers existants pour %s : %d ligne(s)", year, deleted)
    finally:
        if stmt is not None:
            stmt.close()
        conn.close()


def log_unmatched_communes(unmatched: DataFrame) -> None:
    count = unmatched.count()
    if count == 0:
        return
    sample = [
        row.code_insee
        for row in unmatched.select("code_insee").distinct().limit(50).collect()
    ]
    logger.warning(
        "Communes non trouvées dans cities (%d ligne(s), %d code(s) distinct(s) échantillon): %s",
        count,
        len(sample),
        ", ".join(sample),
    )


def main() -> int:
    args = parse_args()
    if args.year is None:
        logger.error("Année requise : --year ou LOYERS_YEAR")
        return 1

    year_dir = os.path.join(args.data_dir, str(args.year))
    if not os.path.isdir(year_dir):
        logger.error("Répertoire introuvable : %s", year_dir)
        return 1

    spark = build_spark()
    spark.sparkContext.setLogLevel("WARN")

    try:
        jdbc_url, jdbc_props = jdbc_config()
        loyers = merge_indicators(spark, year_dir)
        cities = load_cities(spark, jdbc_url, jdbc_props)

        joined = loyers.join(cities, loyers.code_insee == cities.code, how="left")
        unmatched = joined.filter(col("id").isNull())
        log_unmatched_communes(unmatched)

        to_write = (
            joined.filter(col("id").isNotNull())
            .select(
                lit(args.year).cast("smallint").alias("annee"),
                col("loyer_median_apt"),
                col("loyer_median_t1t2"),
                col("loyer_median_t3plus"),
                col("loyer_median_maison"),
                col("nbobs_com").alias("nb_observations"),
                col("r2_adj").alias("r2"),
                col("id").alias("cityId"),
            )
        )

        row_count = to_write.count()
        if row_count == 0:
            logger.warning("Aucune ligne à charger pour %s", args.year)
            return 0

        delete_year_rows(spark, jdbc_url, jdbc_props, args.year)

        (
            to_write.write.jdbc(
                url=jdbc_url,
                table="rents",
                mode="append",
                properties=jdbc_props,
            )
        )
        logger.info("Chargement terminé : %d ligne(s) insérée(s) pour %s", row_count, args.year)
        return 0
    finally:
        spark.stop()


if __name__ == "__main__":
    sys.exit(main())
