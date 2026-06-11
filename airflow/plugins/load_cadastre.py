"""
load_cadastre.py
----------------
Charge le cadastre Etalab (sections + parcelles) dans PostgreSQL/PostGIS.

Pipeline par département (une task Airflow mappée = un département) :

1. Lecture **streaming** du GeoJSON.gz (ijson) — jamais tout le fichier en RAM.
2. ``COPY`` ligne par ligne vers une table **TEMP** (le gros volume atterrit
   dans le stockage temporaire de PostgreSQL, pas dans la mémoire du worker
   Airflow → plus d'OOM signal -9).
3. Un seul ``INSERT ... SELECT ... ON CONFLICT`` ensembliste : PostGIS parse
   toutes les géométries en une passe et résout ``city``/``section`` par
   jointure SQL (plus aucun dictionnaire Python en mémoire).

Cette approche est nettement plus rapide (COPY + upsert set-based) tout en
gardant une empreinte mémoire worker quasi constante.
"""

from __future__ import annotations

import gzip
import json
import logging
import os
from collections.abc import Callable, Iterator
from decimal import Decimal
from typing import Any

import ijson
import psycopg2

logger = logging.getLogger(__name__)

DOWNLOAD_DIR = os.environ.get("CADASTRE_DOWNLOAD_DIR", "/opt/airflow/data/cadastre")

# Tuning session côté PostGIS pour le chargement bulk (réglable par env).
# synchronous_commit=off : pas de fsync par commit, énorme gain en bulk ;
# l'ETL est idempotent/rejouable donc aucun risque de perte fonctionnelle.
SESSION_SYNCHRONOUS_COMMIT = os.environ.get("CADASTRE_SYNCHRONOUS_COMMIT", "off")
SESSION_WORK_MEM = os.environ.get("CADASTRE_WORK_MEM", "64MB")
SESSION_MAINTENANCE_WORK_MEM = os.environ.get("CADASTRE_MAINTENANCE_WORK_MEM", "256MB")

# Taille des chunks envoyés à PostgreSQL pendant le COPY (octets).
_COPY_CHUNK_BYTES = 1 << 20  # 1 Mo

_UPSERT_LOCK_ID = 902902


# --------------------------------------------------------------------------- #
# Connexion / session
# --------------------------------------------------------------------------- #
def get_conn() -> psycopg2.extensions.connection:
    if os.environ.get("AIRFLOW__DATABASE__SQL_ALCHEMY_CONN"):
        from airflow.providers.postgres.hooks.postgres import PostgresHook

        return PostgresHook(postgres_conn_id="postgres_default").get_conn()
    return psycopg2.connect(
        host=os.environ.get("POSTGIS_HOST", "postgis"),
        port=int(os.environ.get("POSTGIS_PORT", 5432)),
        dbname=os.environ.get("POSTGRES_DB", "homepedia"),
        user=os.environ.get("POSTGRES_USER", "postgres"),
        password=os.environ.get("POSTGRES_PASSWORD", "postgres"),
    )


def tune_session(conn: psycopg2.extensions.connection) -> None:
    """Configure la session PostgreSQL pour un chargement bulk rapide."""
    conn.autocommit = False
    with conn.cursor() as cur:
        cur.execute(f"SET synchronous_commit TO '{SESSION_SYNCHRONOUS_COMMIT}'")
        cur.execute(f"SET work_mem TO '{SESSION_WORK_MEM}'")
        cur.execute(f"SET maintenance_work_mem TO '{SESSION_MAINTENANCE_WORK_MEM}'")
    conn.commit()


# --------------------------------------------------------------------------- #
# Index uniques (requis pour ON CONFLICT)
# --------------------------------------------------------------------------- #
def _index_exists(cur: psycopg2.extensions.cursor, index_name: str) -> bool:
    cur.execute(
        """
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = %s
        """,
        (index_name,),
    )
    return cur.fetchone() is not None


def _dedupe_sections(cur: psycopg2.extensions.cursor) -> int:
    """Fusionne les sections en double avant index unique (réassigne les plots)."""
    cur.execute(
        """
        UPDATE plots p
        SET "sectionId" = s_keep.id
        FROM sections s_dup
        INNER JOIN sections s_keep
          ON s_keep."cityId" = s_dup."cityId"
         AND s_keep.prefixe = s_dup.prefixe
         AND s_keep.code = s_dup.code
         AND s_keep.id < s_dup.id
        WHERE p."sectionId" = s_dup.id
        """
    )
    cur.execute(
        """
        DELETE FROM sections s_dup
        USING sections s_keep
        WHERE s_keep."cityId" = s_dup."cityId"
          AND s_keep.prefixe = s_dup.prefixe
          AND s_keep.code = s_dup.code
          AND s_keep.id < s_dup.id
        """
    )
    return cur.rowcount


def _dedupe_plots(cur: psycopg2.extensions.cursor) -> int:
    cur.execute(
        """
        DELETE FROM plots p_dup
        USING plots p_keep
        WHERE p_keep."sectionId" = p_dup."sectionId"
          AND p_keep.number = p_dup.number
          AND p_keep.id < p_dup.id
        """
    )
    return cur.rowcount


def _create_unique_index(
    cur: psycopg2.extensions.cursor,
    name: str,
    ddl: str,
    dedupe: Callable[[psycopg2.extensions.cursor], int],
) -> None:
    if _index_exists(cur, name):
        logger.info("Index déjà présent : %s", name)
        return
    removed = dedupe(cur)
    if removed:
        logger.warning("%s : %s doublons supprimés avant création index", name, removed)
    cur.execute(ddl)
    logger.info("Index créé : %s", name)


def ensure_upsert_indexes(conn: psycopg2.extensions.connection) -> None:
    """Index uniques pour ON CONFLICT (verrou global, safe en parallèle)."""
    with conn.cursor() as cur:
        cur.execute("SELECT pg_advisory_lock(%s)", (_UPSERT_LOCK_ID,))
    try:
        with conn.cursor() as cur:
            _create_unique_index(
                cur,
                "idx_sections_city_prefixe_code",
                """
                CREATE UNIQUE INDEX "idx_sections_city_prefixe_code"
                ON sections ("cityId", prefixe, code)
                """,
                _dedupe_sections,
            )
            _create_unique_index(
                cur,
                "idx_plots_section_number",
                """
                CREATE UNIQUE INDEX "idx_plots_section_number"
                ON plots ("sectionId", number)
                """,
                _dedupe_plots,
            )
        conn.commit()
    finally:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_unlock(%s)", (_UPSERT_LOCK_ID,))
        conn.commit()


def ensure_cadastre_indexes_task(**_context) -> None:
    """Task Airflow : crée les index d'upsert avant les loads parallèles."""
    conn = get_conn()
    try:
        ensure_upsert_indexes(conn)
    finally:
        conn.close()


# --------------------------------------------------------------------------- #
# Streaming GeoJSON -> COPY
# --------------------------------------------------------------------------- #
def dumps_geojson(obj: Any) -> str:
    """ijson renvoie des Decimal pour les coordonnées — PostGIS attend du JSON valide."""

    def _default(o: object) -> float:
        if isinstance(o, Decimal):
            return float(o)
        raise TypeError(f"Object of type {type(o).__name__} is not JSON serializable")

    return json.dumps(obj, default=_default, separators=(",", ":"))


def _copy_escape(value: str) -> str:
    """Échappe une valeur pour le format COPY TEXT (délimiteur tabulation)."""
    return (
        value.replace("\\", "\\\\")
        .replace("\t", "\\t")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
    )


def cadastre_path(dept_code: str, layer: str) -> str:
    return os.path.join(DOWNLOAD_DIR, f"cadastre-{dept_code}-{layer}.json.gz")


def iter_features(path: str) -> Iterator[dict[str, Any]]:
    """Parcourt les features d'un FeatureCollection gzip sans tout charger en RAM."""
    with gzip.open(path, "rb") as fh:
        for feature in ijson.items(fh, "features.item"):
            if isinstance(feature, dict):
                yield feature


class _CopyStream:
    """Adapte un itérateur de lignes (bytes) en objet fichier pour copy_expert.

    Mémoire constante : on ne matérialise jamais plus d'un chunk + une ligne.
    """

    def __init__(self, line_iter: Iterator[bytes]) -> None:
        self._iter = line_iter
        self._buf = bytearray()
        self._exhausted = False

    def read(self, size: int = -1) -> bytes:
        if size is None or size < 0:
            for line in self._iter:
                self._buf += line
            out = bytes(self._buf)
            self._buf.clear()
            return out
        while len(self._buf) < size and not self._exhausted:
            try:
                self._buf += next(self._iter)
            except StopIteration:
                self._exhausted = True
        if not self._buf:
            return b""
        out = bytes(self._buf[:size])
        del self._buf[:size]
        return out


def _copy_lines(
    cur: psycopg2.extensions.cursor,
    copy_sql: str,
    line_iter: Iterator[bytes],
) -> None:
    cur.copy_expert(copy_sql, _CopyStream(line_iter), size=_COPY_CHUNK_BYTES)


# --------------------------------------------------------------------------- #
# Sections
# --------------------------------------------------------------------------- #
_STAGE_SECTIONS_DDL = """
CREATE TEMP TABLE _stg_sections (
    commune text,
    prefixe text,
    code    text,
    geojson text
) ON COMMIT DROP
"""

_DEDUPE_SECTIONS_SQL = """
DELETE FROM _stg_sections t
USING (
    SELECT ctid,
           row_number() OVER (
               PARTITION BY commune, prefixe, code
           ) AS rn
    FROM _stg_sections
) d
WHERE t.ctid = d.ctid AND d.rn > 1
"""

# cities peut contenir des doublons de code (pas de contrainte unique côté
# load_contours) : on résout un id UNIQUE et déterministe par code (min(id))
# pour éviter le fan-out de la jointure (sinon 1 section dupliquée par doublon).
_CITY_BY_CODE_CTE = """
city_by_code AS (
    SELECT lpad(code, 5, '0') AS code5, min(id) AS id
    FROM cities
    GROUP BY lpad(code, 5, '0')
)
"""

_UPSERT_SECTIONS_SQL = f"""
WITH {_CITY_BY_CODE_CTE}
INSERT INTO sections (prefixe, code, "cityId", geom)
SELECT st.prefixe,
       st.code,
       c.id,
       ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(st.geojson), 4326))
FROM _stg_sections st
JOIN city_by_code c ON c.code5 = st.commune
ON CONFLICT ("cityId", prefixe, code)
DO UPDATE SET geom = EXCLUDED.geom
"""


def _sections_lines(path: str, stats: dict[str, int]) -> Iterator[bytes]:
    for feature in iter_features(path):
        props = feature.get("properties") or {}
        commune = str(props.get("commune", "")).strip().zfill(5)
        prefixe = str(props.get("prefixe", "000")).strip() or "000"
        code = str(props.get("code", "")).strip()
        geom = feature.get("geometry")

        if not commune or not code or geom is None:
            stats["parse_skipped"] += 1
            continue

        stats["staged"] += 1
        row = "\t".join(
            _copy_escape(v) for v in (commune, prefixe, code, dumps_geojson(geom))
        )
        yield (row + "\n").encode("utf-8")


def load_sections_for_department(
    conn: psycopg2.extensions.connection, dept_code: str
) -> tuple[int, int]:
    """Retourne (processed, skipped) pour les sections d'un département."""
    path = cadastre_path(dept_code, "sections")
    if not os.path.exists(path):
        logger.warning("[sections] %s : fichier absent (%s)", dept_code, path)
        return 0, 0

    stats = {"staged": 0, "parse_skipped": 0}
    with conn.cursor() as cur:
        cur.execute(_STAGE_SECTIONS_DDL)
        _copy_lines(
            cur,
            "COPY _stg_sections (commune, prefixe, code, geojson) FROM STDIN",
            _sections_lines(path, stats),
        )
        cur.execute("ANALYZE _stg_sections")
        cur.execute(_DEDUPE_SECTIONS_SQL)
        cur.execute(_UPSERT_SECTIONS_SQL)
        processed = cur.rowcount
    conn.commit()  # déclenche ON COMMIT DROP de la table TEMP

    skipped = stats["parse_skipped"] + max(stats["staged"] - processed, 0)
    return processed, skipped


# --------------------------------------------------------------------------- #
# Parcelles
# --------------------------------------------------------------------------- #
_STAGE_PARCELLES_DDL = """
CREATE TEMP TABLE _stg_parcelles (
    commune    text,
    prefixe    text,
    section    text,
    numero     text,
    contenance text,
    geojson    text
) ON COMMIT DROP
"""

# Déduplication sur la clé TEXTE uniquement (commune, prefixe, section, numero)
# -> tri léger sans transporter le geojson. Évite l'erreur ON CONFLICT
# "cannot affect row a second time" sans payer un tri global des géométries.
_DEDUPE_PARCELLES_SQL = """
DELETE FROM _stg_parcelles t
USING (
    SELECT ctid,
           row_number() OVER (
               PARTITION BY commune, prefixe, section, numero
           ) AS rn
    FROM _stg_parcelles
) d
WHERE t.ctid = d.ctid AND d.rn > 1
"""

# Aucun ORDER BY / DISTINCT ON : pas de tri global, l'insertion streame
# directement (jointures indexées + parse géométrie + upsert).
# city_by_code : même dédoublonnage que pour les sections (cohérence du cityId).
# sections est garantie unique par idx_sections_city_prefixe_code → join direct.
_UPSERT_PARCELLES_SQL = f"""
WITH {_CITY_BY_CODE_CTE}
INSERT INTO plots (number, capacity, "sectionId", geom)
SELECT st.numero,
       st.contenance,
       sec.id,
       ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(st.geojson), 4326))
FROM _stg_parcelles st
JOIN city_by_code c ON c.code5 = st.commune
JOIN sections sec
  ON sec."cityId" = c.id
 AND sec.prefixe = st.prefixe
 AND sec.code = st.section
ON CONFLICT ("sectionId", number)
DO UPDATE SET capacity = EXCLUDED.capacity, geom = EXCLUDED.geom
"""


def _parcelles_lines(path: str, stats: dict[str, int]) -> Iterator[bytes]:
    for feature in iter_features(path):
        props = feature.get("properties") or {}
        commune = str(props.get("commune", "")).strip().zfill(5)
        prefixe = str(props.get("prefixe", "000")).strip() or "000"
        section = str(props.get("section", "")).strip()
        numero = str(props.get("numero", "")).strip()
        contenance = props.get("contenance")
        geom = feature.get("geometry")

        if not commune or not section or not numero or geom is None:
            stats["parse_skipped"] += 1
            continue

        capacity = "" if contenance is None else str(contenance)
        stats["staged"] += 1
        row = "\t".join(
            _copy_escape(v)
            for v in (commune, prefixe, section, numero, capacity, dumps_geojson(geom))
        )
        yield (row + "\n").encode("utf-8")


def load_parcelles_for_department(
    conn: psycopg2.extensions.connection, dept_code: str
) -> tuple[int, int]:
    """Retourne (processed, skipped) pour les parcelles d'un département."""
    path = cadastre_path(dept_code, "parcelles")
    if not os.path.exists(path):
        logger.warning("[parcelles] %s : fichier absent (%s)", dept_code, path)
        return 0, 0

    stats = {"staged": 0, "parse_skipped": 0}
    with conn.cursor() as cur:
        cur.execute(_STAGE_PARCELLES_DDL)
        _copy_lines(
            cur,
            "COPY _stg_parcelles (commune, prefixe, section, numero, contenance, geojson) "
            "FROM STDIN",
            _parcelles_lines(path, stats),
        )
        cur.execute("ANALYZE _stg_parcelles")
        cur.execute(_DEDUPE_PARCELLES_SQL)
        cur.execute(_UPSERT_PARCELLES_SQL)
        processed = cur.rowcount
    conn.commit()  # déclenche ON COMMIT DROP de la table TEMP

    skipped = stats["parse_skipped"] + max(stats["staged"] - processed, 0)
    return processed, skipped


# --------------------------------------------------------------------------- #
# Orchestration
# --------------------------------------------------------------------------- #
def load_one_department(dept_code: str) -> dict[str, int | str]:
    """Charge sections + parcelles d'un département (faible empreinte mémoire)."""
    conn = get_conn()
    try:
        tune_session(conn)
        ensure_upsert_indexes(conn)

        logger.info("[%s] chargement sections (COPY → upsert set-based)…", dept_code)
        s_proc, s_skip = load_sections_for_department(conn, dept_code)
        logger.info("[%s] sections traitées=%s skip=%s", dept_code, s_proc, s_skip)

        logger.info("[%s] chargement parcelles (COPY → upsert set-based)…", dept_code)
        p_proc, p_skip = load_parcelles_for_department(conn, dept_code)
        logger.info("[%s] parcelles traitées=%s skip=%s", dept_code, p_proc, p_skip)

        return {
            "dept": dept_code,
            "sections_inserted": s_proc,
            "sections_updated": 0,
            "sections_skipped": s_skip,
            "plots_inserted": p_proc,
            "plots_updated": 0,
            "plots_skipped": p_skip,
        }
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def load_all_cadastre(**_context) -> None:
    """Entrypoint monolithique — préférer load_one_department × N tasks Airflow."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT code FROM departments ORDER BY code")
            dept_codes = [str(row[0]).strip() for row in cur.fetchall()]
    finally:
        conn.close()

    for dept_code in dept_codes:
        load_one_department(dept_code)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    import sys

    if len(sys.argv) > 1:
        load_one_department(sys.argv[1])
    else:
        load_all_cadastre()
