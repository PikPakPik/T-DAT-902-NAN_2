"""
Silver - chargement des DPE ADEME dans PostGIS.

Bronze  : airflow/data/ademe_dpe/*.csv
Silver  : airflow/data/silver/dpe/dpes/     (Parquet)
Rejets  : airflow/data/silver/dpe/rejects/  (Parquet)
Gold    : table PostGIS dpes, avec plotId resolu par jointure spatiale.

Lancement (conteneur Spark) :
  docker compose exec spark /opt/spark/bin/spark-submit \\
    --jars /opt/spark/jars/postgresql-42.7.3.jar \\
    /opt/spark-jobs/silver/dpe_load.py

Prerequis base : cities, sections et plots remplis (DAG cadastre/contours).
"""

from __future__ import annotations

import argparse
import glob
import os
import re
import time
import unicodedata
from pathlib import Path

import psycopg2
from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F

DEFAULT_BRONZE = os.environ.get("DPE_DOWNLOAD_DIR", "/opt/airflow/data/ademe_dpe")
DEFAULT_SILVER = os.environ.get("DPE_SILVER_DIR", "/opt/airflow/data/silver/dpe/dpes")
DEFAULT_REJECTS = os.environ.get(
    "DPE_REJECTS_DIR", "/opt/airflow/data/silver/dpe/rejects"
)
DPE_OUTPUT_PARTITIONS = int(os.environ.get("DPE_OUTPUT_PARTITIONS", "128"))

DPES_TABLE = "dpes"
STAGING_TABLE = "stg_dpes_ademe"
ENERGY_LABELS = ("A", "B", "C", "D", "E", "F", "G")
MISSING = ("", "na", "n/a", "nd", "ns", "so", "s", "null")

DPE_ID_ALIASES = ("numero_dpe", "dpe_id", "id_dpe", "ndpe")
DATE_ALIASES = ("date_etablissement_dpe", "date_reception_dpe")
ENERGY_ALIASES = ("etiquette_dpe", "classe_energie")
GES_ALIASES = ("etiquette_ges", "classe_ges")
CODE_INSEE_ALIASES = ("code_insee_ban", "code_insee", "code_commune_insee")
X_L93_ALIASES = (
    "coordonnee_cartographique_x_ban",
    "longitude",
    "lon",
    "x",
)
Y_L93_ALIASES = (
    "coordonnee_cartographique_y_ban",
    "latitude",
    "lat",
    "y",
)
SURFACE_ALIASES = (
    "surface_habitable_logement",
    "surface_habitable_immeuble",
    "surface_utile",
    "surface_shon",
    "surface_tertiaire_immeuble",
)
TYPE_BATIMENT_ALIASES = ("type_batiment",)
ANNEE_CONSTRUCTION_ALIASES = ("annee_construction",)


def normalized_name(name: str) -> str:
    without_accents = unicodedata.normalize("NFKD", name).encode("ascii", "ignore")
    lowered = without_accents.decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "_", lowered).strip("_")


def find_column(columns: list[str], aliases: tuple[str, ...], label: str) -> str:
    normalized = {normalized_name(column): column for column in columns}
    for alias in aliases:
        found = normalized.get(alias)
        if found:
            return found
    raise ValueError(f"Colonne {label} introuvable : {', '.join(columns)}")


def find_optional_column(columns: list[str], aliases: tuple[str, ...]) -> str | None:
    normalized = {normalized_name(column): column for column in columns}
    for alias in aliases:
        found = normalized.get(alias)
        if found:
            return found
    return None


def find_bronze_csvs(bronze_dir: str) -> list[str]:
    if not os.path.isdir(bronze_dir):
        raise FileNotFoundError(f"Repertoire bronze introuvable : {bronze_dir}")

    paths = sorted(glob.glob(os.path.join(bronze_dir, "*.csv")))
    paths = [path for path in paths if os.path.isfile(path) and os.path.getsize(path) > 0]
    if not paths:
        raise FileNotFoundError(
            f"Aucun fichier DPE .csv dans {bronze_dir}. "
            "Lancez d'abord le DAG download_ademe_dpe."
        )
    return paths


def clean_string(column):
    normalized = F.lower(F.trim(column.cast("string")))
    return F.when(normalized.isin(*MISSING), None).otherwise(F.trim(column.cast("string")))


def clean_double(column):
    value = clean_string(column)
    return F.regexp_replace(value, ",", ".").cast("double")


def clean_int(column):
    return clean_double(column).cast("int")


def optional_string(df: DataFrame, aliases: tuple[str, ...], default: str | None = None):
    column = find_optional_column(df.columns, aliases)
    if column:
        return clean_string(F.col(column))
    return F.lit(default).cast("string")


def optional_int(df: DataFrame, aliases: tuple[str, ...], default: int | None = None):
    column = find_optional_column(df.columns, aliases)
    if column:
        return clean_int(F.col(column))
    return F.lit(default).cast("int")


def coalesced_surface(df: DataFrame):
    columns = [
        clean_double(F.col(column))
        for alias in SURFACE_ALIASES
        for column in [find_optional_column(df.columns, (alias,))]
        if column
    ]
    if not columns:
        return F.lit(None).cast("double")
    return F.coalesce(*columns)


def quoted_sql_identifier(name: str) -> str:
    return f"`{name.replace('`', '``')}`"


def year_from_date_column(column_name: str):
    return F.year(F.expr(f"try_cast({quoted_sql_identifier(column_name)} as date)"))


def read_dpe_csv(spark: SparkSession, path: str) -> DataFrame:
    df = (
        spark.read.option("header", True)
        .option("sep", ",")
        .option("encoding", "UTF-8")
        .option("inferSchema", False)
        .csv(path)
    )

    dpe_id_col = find_column(df.columns, DPE_ID_ALIASES, "numero DPE")
    date_col = find_column(df.columns, DATE_ALIASES, "date DPE")
    energy_col = find_column(df.columns, ENERGY_ALIASES, "etiquette DPE")
    ges_col = find_column(df.columns, GES_ALIASES, "etiquette GES")
    code_col = find_column(df.columns, CODE_INSEE_ALIASES, "code INSEE")
    x_col = find_column(df.columns, X_L93_ALIASES, "coordonnee x")
    y_col = find_column(df.columns, Y_L93_ALIASES, "coordonnee y")

    default_type = "Tertiaire" if "tertiaire" in os.path.basename(path).lower() else None

    return df.select(
        clean_string(F.col(dpe_id_col)).alias("dpe_id"),
        year_from_date_column(date_col).alias("annee"),
        F.upper(clean_string(F.col(energy_col))).alias("classe_energie"),
        F.upper(clean_string(F.col(ges_col))).alias("classe_ges"),
        coalesced_surface(df).alias("surface_habitable"),
        optional_string(df, TYPE_BATIMENT_ALIASES, default_type).alias("type_batiment"),
        F.coalesce(optional_int(df, ANNEE_CONSTRUCTION_ALIASES), F.lit(0)).alias(
            "annee_construction"
        ),
        F.upper(clean_string(F.col(code_col))).alias("code_insee"),
        clean_double(F.col(x_col)).alias("x_l93"),
        clean_double(F.col(y_col)).alias("y_l93"),
        F.lit(os.path.basename(path)).alias("source_file"),
    )


def read_bronze(spark: SparkSession, bronze_paths: list[str]) -> DataFrame:
    bronze = read_dpe_csv(spark, bronze_paths[0])
    for path in bronze_paths[1:]:
        bronze = bronze.unionByName(read_dpe_csv(spark, path))
    return bronze


def build_silver(bronze: DataFrame) -> tuple[DataFrame, DataFrame]:
    valid_code = F.coalesce(
        F.col("code_insee").rlike(r"^(\d{5}|2[AB]\d{3})$"), F.lit(False)
    )
    valid_dpe_id = F.col("dpe_id").isNotNull() & (F.col("dpe_id") != "")
    valid_year = F.col("annee").between(1900, 2100)
    valid_energy = F.col("classe_energie").isin(*ENERGY_LABELS)
    valid_ges = F.col("classe_ges").isin(*ENERGY_LABELS)
    valid_surface = F.col("surface_habitable").isNotNull() & (
        F.col("surface_habitable") > 0
    )
    valid_type = F.col("type_batiment").isNotNull() & (F.col("type_batiment") != "")
    valid_construction = F.col("annee_construction").between(0, 2100)
    valid_coords = (
        F.col("x_l93").isNotNull()
        & F.col("y_l93").isNotNull()
        & (F.col("x_l93") != 0)
        & (F.col("y_l93") != 0)
    )
    is_valid = (
        valid_dpe_id
        & valid_code
        & valid_year
        & valid_energy
        & valid_ges
        & valid_surface
        & valid_type
        & valid_construction
        & valid_coords
    )

    silver = (
        bronze.filter(is_valid)
        .dropDuplicates(["dpe_id"])
        .select(
            "dpe_id",
            F.col("annee").cast("short").alias("annee"),
            "classe_energie",
            "classe_ges",
            F.round("surface_habitable", 2).alias("surface_habitable"),
            "type_batiment",
            F.col("annee_construction").cast("short").alias("annee_construction"),
            "code_insee",
            "x_l93",
            "y_l93",
            "source_file",
        )
    )

    rejects = bronze.filter(~is_valid).select(
        "dpe_id",
        "annee",
        "classe_energie",
        "classe_ges",
        "surface_habitable",
        "type_batiment",
        "annee_construction",
        "code_insee",
        "x_l93",
        "y_l93",
        F.when(~valid_dpe_id, F.lit("numero_dpe manquant"))
        .when(~valid_code, F.lit("code_insee invalide"))
        .when(~valid_year, F.lit("date DPE invalide"))
        .when(~valid_energy, F.lit("etiquette_dpe invalide"))
        .when(~valid_ges, F.lit("etiquette_ges invalide"))
        .when(~valid_surface, F.lit("surface manquante ou invalide"))
        .when(~valid_type, F.lit("type_batiment manquant"))
        .when(~valid_construction, F.lit("annee_construction invalide"))
        .when(~valid_coords, F.lit("coordonnees invalides"))
        .otherwise(F.lit("validation metier"))
        .alias("motif"),
        "source_file",
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


def ensure_dpes_schema() -> None:
    with psycopg2.connect(**pg_conn_params()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_name = 'dpes'
                  AND column_name IN ('longitude', 'latitude')
                """
            )
            types = dict(cur.fetchall())
            if types.get("longitude") == "point":
                cur.execute(
                    """
                    ALTER TABLE dpes
                    ALTER COLUMN longitude TYPE double precision
                    USING longitude[0]
                    """
                )
            if types.get("latitude") == "point":
                cur.execute(
                    """
                    ALTER TABLE dpes
                    ALTER COLUMN latitude TYPE double precision
                    USING latitude[1]
                    """
                )
            cur.execute(
                'CREATE INDEX IF NOT EXISTS "idx_dpes_code_insee" ON dpes (code_insee)'
            )
            cur.execute('CREATE INDEX IF NOT EXISTS "idx_dpes_dpe_id" ON dpes (dpe_id)')
            cur.execute(f"DROP TABLE IF EXISTS {STAGING_TABLE}")
            cur.execute(
                f"""
                CREATE UNLOGGED TABLE {STAGING_TABLE} (
                    dpe_id varchar NOT NULL,
                    annee smallint NOT NULL,
                    classe_energie varchar NOT NULL,
                    classe_ges varchar NOT NULL,
                    surface_habitable numeric(10,2) NOT NULL,
                    type_batiment varchar NOT NULL,
                    annee_construction smallint NOT NULL,
                    code_insee varchar NOT NULL,
                    x_l93 double precision NOT NULL,
                    y_l93 double precision NOT NULL,
                    source_file varchar
                )
                """
            )
        conn.commit()


def truncate_dpes() -> None:
    with psycopg2.connect(**pg_conn_params()) as conn:
        with conn.cursor() as cur:
            cur.execute("TRUNCATE TABLE dpes RESTART IDENTITY")
        conn.commit()


def load_to_db(silver: DataFrame) -> int:
    ensure_dpes_schema()
    truncate_dpes()
    to_stage = silver.select(
        "dpe_id",
        "annee",
        "classe_energie",
        "classe_ges",
        F.col("surface_habitable").cast("decimal(10,2)").alias("surface_habitable"),
        "type_batiment",
        "annee_construction",
        "code_insee",
        F.col("x_l93").cast("double").alias("x_l93"),
        F.col("y_l93").cast("double").alias("y_l93"),
        "source_file",
    )
    count = to_stage.count()
    to_stage.write.jdbc(
        url=jdbc_url(),
        table=STAGING_TABLE,
        mode="append",
        properties=jdbc_properties(),
    )

    with psycopg2.connect(**pg_conn_params()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                INSERT INTO {DPES_TABLE} (
                    dpe_id,
                    annee,
                    classe_energie,
                    classe_ges,
                    surface_habitable,
                    type_batiment,
                    annee_construction,
                    code_insee,
                    longitude,
                    latitude,
                    "plotId"
                )
                SELECT
                    s.dpe_id,
                    s.annee,
                    s.classe_energie,
                    s.classe_ges,
                    s.surface_habitable,
                    s.type_batiment,
                    s.annee_construction,
                    s.code_insee,
                    ST_X(wgs84.geom) AS longitude,
                    ST_Y(wgs84.geom) AS latitude,
                    NULL::integer AS "plotId"
                FROM {STAGING_TABLE} s
                CROSS JOIN LATERAL (
                    SELECT ST_Transform(
                        ST_SetSRID(ST_MakePoint(s.x_l93, s.y_l93), 2154),
                        4326
                    ) AS geom
                ) wgs84
                """
            )
        conn.commit()
    return count


DPE_PLOT_LINK_SQL = """
WITH candidates AS (
  SELECT
    d.id AS dpe_pk,
    p.id AS plot_id,
    row_number() OVER (PARTITION BY d.id ORDER BY ST_Area(p.geom)) AS rn
  FROM dpes d
  INNER JOIN cities c ON c.code = d.code_insee
  INNER JOIN sections s ON s."cityId" = c.id
  INNER JOIN plots p ON p."sectionId" = s.id
  CROSS JOIN LATERAL (
    SELECT ST_SetSRID(ST_MakePoint(d.longitude, d.latitude), 4326) AS geom
  ) pt
  WHERE d."plotId" IS NULL
    AND CASE
      WHEN d.code_insee ~ '^(97|98)' THEN substr(d.code_insee, 1, 3)
      ELSE substr(d.code_insee, 1, 2)
    END = %s
    AND p.geom && pt.geom
    AND ST_Covers(p.geom, pt.geom)
)
UPDATE dpes d
SET "plotId" = candidates.plot_id
FROM candidates
WHERE d.id = candidates.dpe_pk
  AND candidates.rn = 1
"""


def link_plots() -> int:
    with psycopg2.connect(**pg_conn_params()) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT CASE
                  WHEN code_insee ~ '^(97|98)' THEN substr(code_insee, 1, 3)
                  ELSE substr(code_insee, 1, 2)
                END AS dept
                FROM dpes
                WHERE "plotId" IS NULL
                ORDER BY dept
                """
            )
            depts = [row[0] for row in cur.fetchall() if row[0]]
            if not depts:
                print("plotId DPE : aucun DPE a lier")
                return 0

            updated_total = 0
            for index, dept in enumerate(depts, start=1):
                start = time.time()
                cur.execute(DPE_PLOT_LINK_SQL, (dept,))
                conn.commit()
                updated = cur.rowcount
                updated_total += updated
                print(
                    f"plotId DPE : dept {dept} ({index}/{len(depts)}) -> "
                    f"{updated} lie(s) en {time.time() - start:.1f}s",
                    flush=True,
                )
            return updated_total


def ensure_output_dirs(*paths: str) -> None:
    for path in paths:
        Path(path).mkdir(parents=True, exist_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Silver DPE - chargement table dpes")
    parser.add_argument("--bronze-dir", default=DEFAULT_BRONZE)
    parser.add_argument("--silver-dir", default=DEFAULT_SILVER)
    parser.add_argument("--rejects-dir", default=DEFAULT_REJECTS)
    parser.add_argument(
        "--skip-db",
        action="store_true",
        help="Ne pas charger dpes en base (fichiers silver uniquement)",
    )
    parser.add_argument(
        "--skip-link-plots",
        action="store_true",
        help="Ne pas resoudre dpes.plotId apres chargement",
    )
    args = parser.parse_args()

    bronze_paths = find_bronze_csvs(args.bronze_dir)

    spark = (
        SparkSession.builder.appName("Homepedia-DpeLoad")
        .config("spark.sql.shuffle.partitions", os.environ.get("DPE_SHUFFLE_PARTITIONS", "128"))
        .config("spark.default.parallelism", os.environ.get("DPE_DEFAULT_PARALLELISM", "128"))
        .config(
            "spark.driver.memory",
            os.environ.get("DPE_DRIVER_MEMORY", os.environ.get("SPARK_DRIVER_MEMORY", "4g")),
        )
        .config(
            "spark.executor.memory",
            os.environ.get("DPE_EXECUTOR_MEMORY", os.environ.get("SPARK_EXECUTOR_MEMORY", "4g")),
        )
        .config("spark.sql.parquet.enableDictionary", "false")
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")

    bronze = read_bronze(spark, bronze_paths)
    total = bronze.count()
    silver, rejects = build_silver(bronze)

    ensure_output_dirs(args.silver_dir, args.rejects_dir)
    silver_path = str(Path(args.silver_dir) / "dpes_ademe.parquet")
    rejects_path = str(Path(args.rejects_dir) / "dpes_ademe_rejects.parquet")

    (
        silver.coalesce(DPE_OUTPUT_PARTITIONS)
        .write.mode("overwrite")
        .option("parquet.enable.dictionary", "false")
        .parquet(silver_path)
    )
    (
        rejects.coalesce(DPE_OUTPUT_PARTITIONS)
        .write.mode("overwrite")
        .option("parquet.enable.dictionary", "false")
        .parquet(rejects_path)
    )

    silver_df = spark.read.parquet(silver_path)
    rejects_df = spark.read.parquet(rejects_path)

    ok = silver_df.count()
    ko = rejects_df.count()
    print(
        f"Silver DPE [{len(bronze_paths)} fichier(s)] : "
        f"{total} lignes lues, {ok} DPE, {ko} rejetees"
    )
    print(f"  DPE    : {silver_path}")
    print(f"  Rejets : {rejects_path}")

    if args.skip_db:
        print("Chargement base ignore (--skip-db)")
    else:
        loaded = load_to_db(silver_df)
        print(f"dpes : {loaded} ligne(s) chargee(s)")
        if args.skip_link_plots:
            print("Resolution plotId ignoree (--skip-link-plots)")
        else:
            linked = link_plots()
            print(f"dpes.plotId : {linked} DPE lie(s) a une parcelle")

    spark.stop()


if __name__ == "__main__":
    main()
