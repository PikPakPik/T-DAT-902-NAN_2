"""
Backfill de sections.section_key (préfixe cadastral 10 caractères).

section_key = lpad(code_commune, 5) + prefixe(3) + section(2)
Correspond aux 10 premiers caractères de mutation_locals.id_parcelle.

461k lignes seulement → backfill rapide, une fois pour toutes.
Prérequis avant --link-plots sur le job DVF.

Lancement :
  docker exec homepedia-spark python3 /opt/spark-jobs/silver/prepare_sections_key.py
"""

from __future__ import annotations

import os
import time

import psycopg2

BATCH_SIZE = int(os.environ.get("SECTIONS_BACKFILL_BATCH", "50000"))

BACKFILL_SQL = """
UPDATE sections s
SET section_key = lpad(c.code, 5, '0') || s.prefixe || s.code
FROM cities c
WHERE s."cityId" = c.id
  AND s.id >= %s AND s.id < %s
"""


def pg_conn_params() -> dict[str, str | int]:
    return {
        "host": os.environ.get("POSTGIS_HOST", "postgis"),
        "port": int(os.environ.get("POSTGIS_PORT", "5432")),
        "dbname": os.environ.get("POSTGRES_DB", "homepedia"),
        "user": os.environ.get("POSTGRES_USER", "postgres"),
        "password": os.environ.get("POSTGRES_PASSWORD", "postgres"),
    }


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def main() -> None:
    conn = psycopg2.connect(**pg_conn_params())
    conn.autocommit = True
    cur = conn.cursor()

    cur.execute("SELECT min(id), max(id), count(*) FROM sections")
    min_id, max_id, total = cur.fetchone()
    if not total:
        log("Aucune section — rien à faire.")
        return
    log(f"sections : {total} lignes, id de {min_id} à {max_id}")

    start = time.time()
    updated_total = 0
    span = max_id - min_id + 1
    lo = min_id
    while lo <= max_id:
        hi = lo + BATCH_SIZE
        t0 = time.time()
        cur.execute(BACKFILL_SQL, (lo, hi))
        updated = cur.rowcount
        updated_total += updated
        done = min(hi, max_id + 1) - min_id
        pct = 100.0 * done / span
        elapsed = time.time() - start
        remaining = (span - done) / (done / elapsed) if done > 0 else 0
        log(
            f"id [{lo};{hi}) : {updated} maj en {time.time()-t0:.1f}s | "
            f"{pct:.1f}% | ETA {remaining:.0f}s"
        )
        lo = hi

    cur.execute("SELECT count(*) FROM sections WHERE section_key IS NOT NULL")
    filled = cur.fetchone()[0]
    log(
        f"Termine : {filled}/{total} section_key en "
        f"{time.time()-start:.1f}s"
    )

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
