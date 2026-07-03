"""
Silver — mutations foncières DVF (geo-dvf, files.data.gouv.fr).

Modèle parent/enfant :
  mutations       : 1 ligne par vente (id_mutation) — prix total, date, commune,
                    nb_lots, surface_habitable (logements), prix_m2, coordonnées.
  mutation_locals : 1 ligne par lot/local d'une vente — type_local, surface,
                    pièces, terrain, id_parcelle, plotId (parcelle cadastre).

Bronze  : airflow/data/dvf/full-YYYY.csv.gz  (CSV compressé, séparateur virgule)
Silver  : airflow/data/silver/dvf/mutations/  (Parquet par année : ventes + lots)
Rejets  : airflow/data/silver/dvf/rejects/    (Parquet par année)

Traitement :
  - lecture des fichiers full-*.csv.gz (une ligne par local/lot en entrée)
  - nettoyage : suppression des lignes sans prix, conversion des types
  - filtrage  : on ne garde que les ventes (nature_mutation = "Vente")
  - niveau lot : une ligne mutation_locals par local (dédoublonnage exact)
  - niveau vente : agrégation sur id_mutation (nb_lots, surface habitable)
  - prix_m2 = valeur_fonciere / surface habitable (Maison + Appartement), si > 0
  - écriture idempotente via JDBC (delete par année, cascade sur mutation_locals)
  - option --link-plots : résout mutation_locals.plotId depuis id_parcelle

Lancement (conteneur Spark) :
  docker compose exec spark /opt/spark/bin/spark-submit \\
    --jars /opt/spark/jars/postgresql-42.7.3.jar \\
    /opt/spark-jobs/silver/dvf_mutations.py --year 2024

Prérequis données : DAG download_dvf exécuté (fichiers full-*.csv.gz présents).
"""

from __future__ import annotations

import argparse
import glob
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING

import psycopg2

if TYPE_CHECKING:
    from pyspark.sql import DataFrame, SparkSession

NATURE_VENTE = "Vente"
# Locaux considérés comme habitables pour le calcul du prix au m².
TYPES_HABITABLES = ("Maison", "Appartement")

DEFAULT_BRONZE = os.environ.get("DVF_DOWNLOAD_DIR", "/opt/airflow/data/dvf")
DEFAULT_SILVER = os.environ.get(
    "DVF_SILVER_DIR", "/opt/airflow/data/silver/dvf/mutations"
)
DEFAULT_REJECTS = os.environ.get(
    "DVF_REJECTS_DIR", "/opt/airflow/data/silver/dvf/rejects"
)
SPARK_SHUFFLE_PARTITIONS = os.environ.get("DVF_SPARK_SHUFFLE_PARTITIONS", "8")

REQUIRED_COLUMNS = [
    "id_mutation",
    "date_mutation",
    "nature_mutation",
    "valeur_fonciere",
]
BRONZE_OPTIONAL_COLUMNS = {
    "id_parcelle": "string",
    "type_local": "string",
    "surface_reelle_bati": "double",
    "nombre_pieces_principales": "int",
    "surface_terrain": "double",
    "longitude": "double",
    "latitude": "double",
}
MUTATIONS_TABLE = "mutations"
MUTATION_LOCALS_TABLE = "mutation_locals"

# Résolution mutation_locals.plotId via sections.section_key (10 car. indexées)
# + plots dans la section (idx_plots_section_id). Prérequis :
# prepare_sections_key.py exécuté une fois.
# Liaison par département dérivé de id_parcelle (2 premiers car.) : logs +
# commits intermédiaires, visible dans les logs.
LINK_PLOTS_DEPT_SQL = """
UPDATE mutation_locals ml
SET "plotId" = src.plot_id
FROM (
  SELECT ml2.id AS local_id, p.id AS plot_id
  FROM mutation_locals ml2
  INNER JOIN mutations m ON ml2."mutationId" = m.id
  INNER JOIN sections s ON s.section_key = substr(ml2.id_parcelle, 1, 10)
  INNER JOIN plots p ON p."sectionId" = s.id
    AND lpad(p.number, 4, '0') = substr(ml2.id_parcelle, 11, 4)
  WHERE m.annee = %s
    AND substr(ml2.id_parcelle, 1, 2) = %s
    AND ml2."plotId" IS NULL
    AND ml2.id_parcelle IS NOT NULL
    AND length(ml2.id_parcelle) = 14
) src
WHERE ml.id = src.local_id
"""


def find_bronze_files(bronze_dir: str, year: int | None = None) -> list[str]:
    if not os.path.isdir(bronze_dir):
        raise FileNotFoundError(f"Repertoire bronze introuvable : {bronze_dir}")

    if year is not None:
        path = os.path.join(bronze_dir, f"full-{year}.csv.gz")
        if not os.path.isfile(path) or os.path.getsize(path) == 0:
            raise FileNotFoundError(
                f"Fichier introuvable : {path}. Lancez d'abord download_dvf_{year}."
            )
        return [path]

    files = sorted(glob.glob(os.path.join(bronze_dir, "full-*.csv.gz")))
    files = [f for f in files if os.path.isfile(f) and os.path.getsize(f) > 0]
    if not files:
        raise FileNotFoundError(
            f"Aucun fichier full-*.csv.gz dans {bronze_dir}. "
            "Lancez d'abord le DAG download_dvf."
        )
    return files


def _spark():
    """Import PySpark à la demande (inutile pour --link-only)."""
    from pyspark.sql import DataFrame, SparkSession
    from pyspark.sql import functions as F
    from pyspark.sql.types import IntegerType

    return DataFrame, SparkSession, F, IntegerType


def to_double(column: str):
    """Convertit une colonne CSV DVF (vide = null, virgule éventuelle) en double."""
    _, _, F, _ = _spark()
    normalized = F.trim(F.col(column))
    cleaned = F.when(normalized == "", None).otherwise(
        F.regexp_replace(normalized, ",", ".")
    )
    return cleaned.cast("double")


def to_int(column: str):
    _, _, F, IntegerType = _spark()
    value = to_double(column)
    return F.when(value.isNull(), None).otherwise(value.cast(IntegerType()))


def opt_col(bronze: DataFrame, name: str, kind: str):
    """Colonne optionnelle du bronze (null typé si absente)."""
    _, _, F, _ = _spark()
    if name not in bronze.columns:
        return F.lit(None).cast("double" if kind == "double" else "string")
    if kind == "double":
        return to_double(name)
    if kind == "int":
        return to_int(name)
    return F.trim(F.col(name))


def build_silver(bronze: DataFrame) -> tuple[DataFrame, DataFrame, DataFrame]:
    """Nettoie, filtre les ventes, produit (mutations, locals, rejects).

    - locals : une ligne par local/lot (granularité DVF, dédoublonnée exactement)
    - mutations : une ligne par id_mutation (agrégats vente)
    """
    _, _, F, _ = _spark()
    missing = [c for c in REQUIRED_COLUMNS if c not in bronze.columns]
    if missing:
        raise ValueError(f"Colonnes manquantes : {', '.join(missing)}")

    typed = bronze.select(
        F.trim(F.col("id_mutation")).alias("id_mutation"),
        F.to_date(F.col("date_mutation"), "yyyy-MM-dd").alias("date_mutation"),
        F.trim(F.col("nature_mutation")).alias("nature_mutation"),
        to_double("valeur_fonciere").alias("valeur_fonciere"),
        *(
            opt_col(bronze, name, kind).alias(name)
            for name, kind in BRONZE_OPTIONAL_COLUMNS.items()
        ),
    )

    # Filtrage métier : uniquement les ventes.
    ventes = typed.filter(F.col("nature_mutation") == NATURE_VENTE)

    valid_row = (
        F.col("id_mutation").isNotNull()
        & (F.col("id_mutation") != "")
        & F.col("valeur_fonciere").isNotNull()
        & (F.col("valeur_fonciere") > 0)
        & F.col("date_mutation").isNotNull()
    )

    valid = ventes.filter(valid_row).withColumn(
        "annee", F.year(F.col("date_mutation")).cast("int")
    )

    rejects = ventes.filter(~valid_row).select(
        "id_mutation",
        "date_mutation",
        "nature_mutation",
        "valeur_fonciere",
        F.when(
            F.col("id_mutation").isNull() | (F.col("id_mutation") == ""),
            F.lit("id_mutation manquant"),
        )
        .when(
            F.col("valeur_fonciere").isNull() | (F.col("valeur_fonciere") <= 0),
            F.lit("prix manquant ou invalide"),
        )
        .when(F.col("date_mutation").isNull(), F.lit("date invalide"))
        .otherwise(F.lit("validation metier"))
        .alias("motif"),
    )

    # Niveau lot : une ligne par local/lot. On dédoublonne les lignes DVF
    # strictement identiques (mêmes parcelle/type/surface/pièces).
    locals_df = valid.select(
        "id_mutation",
        "annee",
        "type_local",
        "surface_reelle_bati",
        "nombre_pieces_principales",
        "surface_terrain",
        "id_parcelle",
    ).dropDuplicates(
        [
            "id_mutation",
            "id_parcelle",
            "type_local",
            "surface_reelle_bati",
            "nombre_pieces_principales",
            "surface_terrain",
        ]
    )

    # Surface habitable = somme des surfaces des seuls logements (Maison/Appart).
    surface_hab = F.when(
        F.col("type_local").isin(*TYPES_HABITABLES), F.col("surface_reelle_bati")
    ).otherwise(None)

    # Niveau vente : agrégats sur id_mutation à partir des lots dédoublonnés.
    mutations_df = (
        locals_df.groupBy("id_mutation")
        .agg(
            F.count(F.lit(1)).alias("nb_lots"),
            F.sum(surface_hab).alias("surface_habitable"),
        )
        .join(
            valid.groupBy("id_mutation").agg(
                F.min("date_mutation").alias("date_mutation"),
                F.first("annee", ignorenulls=True).alias("annee"),
                F.first("nature_mutation", ignorenulls=True).alias("nature_mutation"),
                F.max("valeur_fonciere").alias("valeur_fonciere"),
                F.first("longitude", ignorenulls=True).alias("longitude"),
                F.first("latitude", ignorenulls=True).alias("latitude"),
            ),
            on="id_mutation",
            how="inner",
        )
        .withColumn(
            "prix_m2",
            F.when(
                F.col("surface_habitable") > 0,
                F.round(F.col("valeur_fonciere") / F.col("surface_habitable"), 2),
            ).otherwise(None),
        )
        .select(
            "id_mutation",
            "date_mutation",
            "annee",
            "nature_mutation",
            F.round("valeur_fonciere", 2).alias("valeur_fonciere"),
            "nb_lots",
            F.round("surface_habitable", 2).alias("surface_habitable"),
            "prix_m2",
            "longitude",
            "latitude",
        )
    )

    return mutations_df, locals_df, rejects


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
        "batchsize": "5000",
        "reWriteBatchedInserts": "true",
    }


def delete_mutations_for_years(annees: list[int]) -> None:
    """Supprime les mutations d'une année (cascade sur mutation_locals via FK)."""
    if not annees:
        return
    sorted_years = sorted(set(annees))
    with psycopg2.connect(**pg_conn_params()) as conn:
        with conn.cursor() as cur:
            for annee in sorted_years:
                cur.execute(
                    f"DELETE FROM {MUTATIONS_TABLE} WHERE annee = %s", (annee,)
                )
        conn.commit()


def _log(msg: str) -> None:
    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] {msg}", flush=True)


def link_plots_for_year(annee: int) -> int:
    """Résout mutation_locals.plotId depuis id_parcelle pour une année.

    Utilise sections.section_key (equijoin indexé), par batch avec logs.
    Prérequis : prepare_sections_key.py exécuté.
    """
    with psycopg2.connect(**pg_conn_params()) as conn:
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute(
                "SELECT to_regclass('idx_sections_section_key') IS NOT NULL"
            )
            if not cur.fetchone()[0]:
                _log(
                    f"plotId {annee} : index idx_sections_section_key absent — "
                    "lancez prepare_sections_key.py. Liaison ignoree."
                )
                return 0

            cur.execute(
                "SELECT count(*) FROM sections WHERE section_key IS NOT NULL"
            )
            if cur.fetchone()[0] == 0:
                _log(
                    f"plotId {annee} : section_key vide — "
                    "lancez prepare_sections_key.py. Liaison ignoree."
                )
                return 0

            cur.execute(
                """
                SELECT count(*)
                FROM mutation_locals ml
                JOIN mutations m ON ml."mutationId" = m.id
                WHERE m.annee = %s AND ml."plotId" IS NULL
                  AND ml.id_parcelle IS NOT NULL
                """,
                (annee,),
            )
            candidates = cur.fetchone()[0]
            if not candidates:
                _log(f"plotId {annee} : aucun lot a lier")
                return 0

            cur.execute(
                """
                SELECT DISTINCT substr(ml.id_parcelle, 1, 2)
                FROM mutation_locals ml
                JOIN mutations m ON ml."mutationId" = m.id
                WHERE m.annee = %s AND ml."plotId" IS NULL
                  AND ml.id_parcelle IS NOT NULL
                  AND length(ml.id_parcelle) = 14
                ORDER BY 1
                """,
                (annee,),
            )
            depts = [r[0] for r in cur.fetchall()]
            _log(
                f"plotId {annee} : {candidates} lot(s) a lier, "
                f"{len(depts)} departement(s)"
            )

            updated_total = 0
            t0_all = time.time()
            for i, dept in enumerate(depts, 1):
                t0 = time.time()
                cur.execute(LINK_PLOTS_DEPT_SQL, (annee, dept))
                updated = cur.rowcount
                updated_total += updated
                conn.commit()
                _log(
                    f"plotId {annee} : dept {dept} ({i}/{len(depts)}) -> "
                    f"{updated} lies en {time.time()-t0:.1f}s | total {updated_total}"
                )

    _log(
        f"plotId {annee} : termine — {updated_total} lot(s) lie(s) "
        f"({updated_total * 100 // candidates if candidates else 0}%) "
        f"en {time.time() - t0_all:.1f}s"
    )
    return updated_total


def load_to_db(
    spark: SparkSession,
    mutations_df: DataFrame,
    locals_df: DataFrame,
    annees: list[int],
) -> tuple[int, int]:
    """Charge mutations puis mutation_locals (idempotent par année).

    Retourne (nb_mutations, nb_locals) chargés.
    """
    annees = sorted(set(annees))
    if not annees:
        return 0, 0

    _, _, F, _ = _spark()
    delete_mutations_for_years(annees)

    to_load = mutations_df.select(
        F.col("id_mutation"),
        F.col("date_mutation"),
        F.col("annee").cast("short").alias("annee"),
        F.col("nature_mutation"),
        F.col("valeur_fonciere").cast("decimal(14,2)").alias("valeur_fonciere"),
        F.col("nb_lots").cast("int").alias("nb_lots"),
        F.col("surface_habitable").cast("decimal(10,2)").alias("surface_habitable"),
        F.col("prix_m2").cast("decimal(12,2)").alias("prix_m2"),
        F.col("longitude").cast("double").alias("longitude"),
        F.col("latitude").cast("double").alias("latitude"),
    )
    mutations_count = to_load.count()
    to_load.write.jdbc(
        url=jdbc_url(),
        table=MUTATIONS_TABLE,
        mode="append",
        properties=jdbc_properties(),
    )

    # Relit les mutations chargées pour récupérer les id générés (SERIAL) et
    # rattacher chaque lot à sa vente via id_mutation.
    annees_sql = ",".join(str(a) for a in annees)
    mut_ref = spark.read.jdbc(
        jdbc_url(),
        f'(SELECT id, id_mutation FROM mutations WHERE annee IN ({annees_sql})) AS m',
        properties=jdbc_properties(),
    )

    locals_to_load = (
        locals_df.join(mut_ref, on="id_mutation", how="inner")
        .select(
            F.col("id").alias("mutationId"),
            F.col("type_local"),
            F.col("surface_reelle_bati").cast("decimal(10,2)").alias("surface_reelle_bati"),
            F.col("nombre_pieces_principales").cast("int").alias("nombre_pieces_principales"),
            F.col("surface_terrain").cast("decimal(12,2)").alias("surface_terrain"),
            F.col("id_parcelle"),
            F.lit(None).cast("int").alias("plotId"),
        )
    )
    locals_count = locals_to_load.count()
    locals_to_load.write.jdbc(
        url=jdbc_url(),
        table=MUTATION_LOCALS_TABLE,
        mode="append",
        properties=jdbc_properties(),
    )

    return mutations_count, locals_count


def parquet_paths(
    silver_dir: str, rejects_dir: str, year_label: str
) -> tuple[str, str, str]:
    return (
        str(Path(silver_dir) / f"mutations_{year_label}.parquet"),
        str(Path(silver_dir) / f"locals_{year_label}.parquet"),
        str(Path(rejects_dir) / f"mutations_{year_label}_rejects.parquet"),
    )


def ensure_output_dirs(*paths: str) -> None:
    for path in paths:
        Path(path).mkdir(parents=True, exist_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Silver DVF — mutations foncières (ventes + lots)"
    )
    parser.add_argument("--bronze-dir", default=DEFAULT_BRONZE)
    parser.add_argument("--silver-dir", default=DEFAULT_SILVER)
    parser.add_argument("--rejects-dir", default=DEFAULT_REJECTS)
    parser.add_argument(
        "--year",
        type=int,
        default=None,
        help="Traiter uniquement full-YYYY.csv.gz (recommandé, une année par tâche)",
    )
    parser.add_argument(
        "--skip-db",
        action="store_true",
        help="Ne pas charger en base (fichiers silver uniquement)",
    )
    parser.add_argument(
        "--link-plots",
        action="store_true",
        help="Resoudre mutation_locals.plotId depuis id_parcelle (plots requis)",
    )
    parser.add_argument(
        "--link-only",
        action="store_true",
        help="Uniquement lier plotId (sans lire bronze ni charger en base)",
    )
    args = parser.parse_args()

    if args.link_only:
        if args.year is None:
            parser.error("--link-only requiert --year")
        linked = link_plots_for_year(args.year)
        print(f"plotId {args.year} : {linked} lot(s) lie(s) a une parcelle")
        return

    bronze_files = find_bronze_files(args.bronze_dir, year=args.year)
    year_label = str(args.year) if args.year is not None else "all"

    _, SparkSession, _, _ = _spark()
    spark = (
        SparkSession.builder.appName(f"Homepedia-DvfMutations-{year_label}")
        .config("spark.sql.shuffle.partitions", SPARK_SHUFFLE_PARTITIONS)
        .config("spark.driver.memory", os.environ.get("SPARK_DRIVER_MEMORY", "2g"))
        .config("spark.executor.memory", os.environ.get("SPARK_EXECUTOR_MEMORY", "2g"))
        .getOrCreate()
    )
    spark.sparkContext.setLogLevel("WARN")

    bronze = (
        spark.read.option("header", True)
        .option("sep", ",")
        .option("encoding", "UTF-8")
        .option("inferSchema", False)
        .csv(bronze_files)
    )
    total_read = bronze.count()

    mutations_df, locals_df, rejects = build_silver(bronze)

    ensure_output_dirs(args.silver_dir, args.rejects_dir)
    mutations_parquet, locals_parquet, rejects_parquet = parquet_paths(
        args.silver_dir, args.rejects_dir, year_label
    )

    # Matérialisation Parquet unique, puis relecture pour comptages + chargement.
    mutations_df.write.mode("overwrite").parquet(mutations_parquet)
    locals_df.write.mode("overwrite").parquet(locals_parquet)
    rejects.write.mode("overwrite").parquet(rejects_parquet)

    mutations_silver = spark.read.parquet(mutations_parquet)
    locals_silver = spark.read.parquet(locals_parquet)

    nb_mut = mutations_silver.count()
    nb_loc = locals_silver.count()
    ko = spark.read.parquet(rejects_parquet).count()
    print(
        f"Silver DVF [{year_label}, {len(bronze_files)} fichier(s)] : "
        f"{total_read} lignes lues, {nb_mut} ventes, {nb_loc} lots, {ko} rejetees"
    )
    print(f"  Ventes  : {mutations_parquet}")
    print(f"  Lots    : {locals_parquet}")
    print(f"  Rejets  : {rejects_parquet}")

    if args.skip_db:
        print("Chargement base ignore (--skip-db)")
    else:
        annees = [
            int(r.annee)
            for r in mutations_silver.select("annee").distinct().collect()
            if r.annee is not None
        ]
        loaded_mut, loaded_loc = load_to_db(
            spark, mutations_silver, locals_silver, annees
        )
        print(f"base : {loaded_mut} mutation(s), {loaded_loc} local(aux) charge(s)")

        if args.link_plots:
            for annee in sorted(annees):
                link_plots_for_year(annee)

    spark.stop()


if __name__ == "__main__":
    main()
