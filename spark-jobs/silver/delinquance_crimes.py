"""
Silver — délinquance communale SSMSI (data.gouv.fr).

Bronze  : airflow/data/delinquance/*.csv.gz
Silver  : airflow/data/silver/delinquance/crimes/  (Parquet + CSV)
Rejets  : airflow/data/silver/delinquance/rejects/
Gold    : table PostGIS crimes_cities (jointure cities.code)

Lancement (conteneur Spark) :
  docker compose exec spark /opt/spark/bin/spark-submit \\
    --jars /opt/spark/jars/postgresql-42.7.3.jar \\
    /opt/spark-jobs/silver/delinquance_crimes.py

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

GEO_YEAR_RE = re.compile(r"geographie(\d{4})", re.I)
MISSING = ("", "na", "n/a", "nd", "ns", "so", "s")

IND_CAMBRIOLAGES = "Cambriolages de logement"
IND_VOLS_ARMES = "Vols avec armes"
IND_VOLS_SANS_VIOL = "Vols sans violence contre des personnes"
IND_VIOL_INTRA = "Violences physiques intrafamiliales"
IND_VIOL_HORS = "Violences physiques hors cadre familial"

DEFAULT_BRONZE = os.environ.get(
    "DELINQUANCE_DOWNLOAD_DIR", "/opt/airflow/data/delinquance"
)
DEFAULT_SILVER = os.environ.get(
    "DELINQUANCE_SILVER_DIR", "/opt/airflow/data/silver/delinquance/crimes"
)
DEFAULT_REJECTS = os.environ.get(
    "DELINQUANCE_REJECTS_DIR", "/opt/airflow/data/silver/delinquance/rejects"
)


def find_latest_bronze(bronze_dir: str) -> tuple[str, str, str]:
    if not os.path.isdir(bronze_dir):
        raise FileNotFoundError(f"Repertoire bronze introuvable : {bronze_dir}")

    candidates: list[tuple[int, str, str]] = []
    for filename in os.listdir(bronze_dir):
        if not filename.lower().endswith(".csv.gz"):
            continue
        path = os.path.join(bronze_dir, filename)
        if not os.path.isfile(path) or os.path.getsize(path) == 0:
            continue
        match = GEO_YEAR_RE.search(filename)
        geo_year = int(match.group(1)) if match else 0
        geo_label = f"geo{geo_year}" if match else os.path.splitext(filename)[0]
        candidates.append((geo_year, path, geo_label, filename))

    if not candidates:
        raise FileNotFoundError(
            f"Aucun fichier .csv.gz dans {bronze_dir}. "
            "Lancez d'abord le DAG download_delinquance_communale."
        )

    candidates.sort(key=lambda c: c[0], reverse=True)
    geo_year, path, geo_label, filename = candidates[0]
    return path, geo_label, filename


def find_codgeo_column(columns: list[str]) -> str:
    for col in columns:
        if re.match(r"^CODGEO_\d{4}$", col, re.I):
            return col
    for col in columns:
        if col.upper().startswith("CODGEO"):
            return col
    raise ValueError(f"Colonne CODGEO introuvable : {', '.join(columns)}")


def parse_rate(column: str):
    normalized = F.lower(F.trim(F.col(column)))
    cleaned = F.when(normalized.isin(*MISSING), None).otherwise(
        F.regexp_replace(normalized, ",", ".")
    )
    return cleaned.cast("double")


def build_silver(
    bronze: DataFrame,
    *,
    code_col: str,
    source_geo: str,
    source_file: str,
    processed_at: str,
) -> tuple[DataFrame, DataFrame]:
    required = [
        code_col,
        "annee",
        "indicateur",
        "taux_pour_mille",
        "est_diffuse",
    ]
    missing = [c for c in required if c not in bronze.columns]
    if missing:
        raise ValueError(f"Colonnes manquantes : {', '.join(missing)}")

    typed = (
        bronze.filter(F.col("est_diffuse") == "diff")
        .withColumn("code_insee", F.upper(F.trim(F.col(code_col))))
        .withColumn("annee", F.col("annee").cast("int"))
        .withColumn("taux", parse_rate("taux_pour_mille"))
        .withColumn("indicateur", F.trim(F.col("indicateur")))
    )

    pivoted = typed.groupBy("code_insee", "annee").agg(
        F.max(
            F.when(F.col("indicateur") == IND_CAMBRIOLAGES, F.col("taux"))
        ).alias("taux_cambriolages"),
        F.max(F.when(F.col("indicateur") == IND_VOLS_ARMES, F.col("taux"))).alias(
            "taux_vols_armes"
        ),
        F.max(
            F.when(F.col("indicateur") == IND_VOLS_SANS_VIOL, F.col("taux"))
        ).alias("taux_vols_sans_viol"),
        F.max(F.when(F.col("indicateur") == IND_VIOL_INTRA, F.col("taux"))).alias(
            "_viol_intra"
        ),
        F.max(F.when(F.col("indicateur") == IND_VIOL_HORS, F.col("taux"))).alias(
            "_viol_hors"
        ),
    )

    enriched = (
        pivoted.withColumn(
            "taux_violences_phys",
            F.coalesce(F.col("_viol_intra"), F.lit(0.0))
            + F.coalesce(F.col("_viol_hors"), F.lit(0.0)),
        )
        .withColumn("source_geo", F.lit(source_geo))
        .withColumn("source_file", F.lit(source_file))
        .withColumn("processed_at", F.lit(processed_at))
    )

    valid_code = F.col("code_insee").rlike(r"^(\d{5}|2[AB]\d{3})$")
    all_present = (
        F.col("taux_cambriolages").isNotNull()
        & F.col("taux_vols_armes").isNotNull()
        & F.col("taux_vols_sans_viol").isNotNull()
        & (F.col("_viol_intra").isNotNull() | F.col("_viol_hors").isNotNull())
    )
    valid_ranges = (
        (F.col("taux_cambriolages") >= 0)
        & (F.col("taux_vols_armes") >= 0)
        & (F.col("taux_vols_sans_viol") >= 0)
        & (F.col("taux_violences_phys") >= 0)
    )

    silver = (
        enriched.filter(valid_code & all_present & valid_ranges)
        .select(
            "code_insee",
            "annee",
            F.round("taux_cambriolages", 2).alias("taux_cambriolages"),
            F.round("taux_vols_armes", 2).alias("taux_vols_armes"),
            F.round("taux_vols_sans_viol", 2).alias("taux_vols_sans_viol"),
            F.round("taux_violences_phys", 2).alias("taux_violences_phys"),
            "source_geo",
            "source_file",
            "processed_at",
        )
    )

    rejects = (
        enriched.filter(~(valid_code & all_present & valid_ranges))
        .select(
            "code_insee",
            "annee",
            F.when(~valid_code, F.lit("code_insee invalide"))
            .when(~all_present, F.lit("indicateur manquant ou non diffuse"))
            .otherwise(F.lit("validation metier"))
            .alias("motif"),
            "taux_cambriolages",
            "taux_vols_armes",
            "taux_vols_sans_viol",
            "_viol_intra",
            "_viol_hors",
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


def delete_crimes_for_years(annees: list[int]) -> None:
    if not annees:
        return
    with psycopg2.connect(**pg_conn_params()) as conn:
        with conn.cursor() as cur:
            for annee in annees:
                cur.execute("DELETE FROM crimes_cities WHERE annee = %s", (annee,))
        conn.commit()


def load_crimes_cities(spark: SparkSession, silver: DataFrame) -> tuple[int, int, int]:
    """Joint silver × cities et charge crimes_cities (idempotent par année)."""
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
            F.col("s.taux_cambriolages").cast("decimal(10,2)").alias("taux_cambriolages"),
            F.col("s.taux_vols_armes").cast("decimal(10,2)").alias("taux_vols_armes"),
            F.col("s.taux_vols_sans_viol").cast("decimal(10,2)").alias("taux_vols_sans_viol"),
            F.col("s.taux_violences_phys").cast("decimal(10,2)").alias("taux_violences_phys"),
        )
    )

    silver_count = silver.count()
    loaded_count = joined.count()
    orphans = silver_count - loaded_count

    annees = [int(r.annee) for r in joined.select("annee").distinct().collect()]
    delete_crimes_for_years(annees)

    joined.write.jdbc(
        url=jdbc_url(),
        table="crimes_cities",
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


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Silver délinquance — taux communaux SSMSI"
    )
    parser.add_argument("--bronze-dir", default=DEFAULT_BRONZE)
    parser.add_argument("--silver-dir", default=DEFAULT_SILVER)
    parser.add_argument("--rejects-dir", default=DEFAULT_REJECTS)
    parser.add_argument(
        "--skip-db",
        action="store_true",
        help="Ne pas charger crimes_cities en base (fichiers silver uniquement)",
    )
    args = parser.parse_args()

    bronze_path, source_geo, source_file = find_latest_bronze(args.bronze_dir)
    processed_at = datetime.now(timezone.utc).isoformat()

    spark = (
        SparkSession.builder.appName("Homepedia-DelinquanceCrimes")
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

    code_col = find_codgeo_column(bronze.columns)
    silver, rejects = build_silver(
        bronze,
        code_col=code_col,
        source_geo=source_geo,
        source_file=source_file,
        processed_at=processed_at,
    )

    os.makedirs(args.silver_dir, exist_ok=True)
    os.makedirs(args.rejects_dir, exist_ok=True)

    base_name = f"crimes_{source_geo}_delinquance"
    parquet_dir = os.path.join(args.silver_dir, f"{base_name}.parquet")
    csv_path = os.path.join(args.silver_dir, f"{base_name}.csv")
    rejects_path = os.path.join(args.rejects_dir, f"{base_name}_rejects.csv")

    silver.write.mode("overwrite").parquet(parquet_dir)
    write_single_csv(silver, csv_path)
    write_single_csv(rejects, rejects_path)

    total = bronze.filter(F.col("est_diffuse") == "diff").count()
    ok = silver.count()
    ko = rejects.count()
    print(
        f"Silver Delinquance [{source_geo}/{source_file}] : "
        f"{total} lignes diffuses, {ok} silver, {ko} rejetees"
    )
    print(f"  Parquet : {parquet_dir}")
    print(f"  CSV     : {csv_path}")
    print(f"  Rejets  : {rejects_path}")

    if args.skip_db:
        print("Chargement base ignore (--skip-db)")
    else:
        silver_count, loaded_count, orphans = load_crimes_cities(spark, silver)
        print(
            f"crimes_cities : {silver_count} silver, "
            f"{loaded_count} chargees, {orphans} sans commune en base"
        )

    spark.stop()


if __name__ == "__main__":
    main()
