"""
load_air_quality.py
-------------------
Charge les indices ATMO communaux dans la table `air_quality`.

L'API Atmo expose des sous-indices journaliers par polluant (codes 0 a 7), pas
des concentrations en ug/m3. Les colonnes pm25_median, pm10_median, no2_median
et o3_median contiennent donc les medianes annuelles de ces sous-indices.
"""

from __future__ import annotations

import csv
import logging
import math
import os
import statistics
import time
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import json

import psycopg2
import psycopg2.extras

logger = logging.getLogger(__name__)

API_BASE = "https://admindata.atmo-france.org"
AASQA_CODES = (
    "01",
    "02",
    "03",
    "04",
    "06",
    "11",
    "24",
    "27",
    "28",
    "32",
    "44",
    "52",
    "53",
    "75",
    "76",
    "84",
    "93",
    "94",
)
DOWNLOAD_DIR = Path(os.environ.get("ATMO_DOWNLOAD_DIR", "/opt/airflow/data/air_quality"))
USER_AGENT = os.environ.get("ATMO_USER_AGENT", "Homepedia-Airflow/1.0")
WINDOW_DAYS = int(os.environ.get("ATMO_WINDOW_DAYS", "31"))
MAX_RETRIES = int(os.environ.get("ATMO_MAX_RETRIES", "4"))
RETRY_STATUS_CODES = {429, 500, 502, 503, 504}


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


def _default_start_date() -> str:
    today = date.today()
    return date(today.year, 1, 1).isoformat()


def _default_end_date() -> str:
    return (date.today() - timedelta(days=1)).isoformat()


def _param(context: dict, name: str, env_name: str, default: str) -> str:
    params = context.get("params") or {}
    value = params.get(name) or os.environ.get(env_name) or default
    return str(value).strip()


def _period(context: dict) -> tuple[str, str]:
    start = _param(context, "start_date", "ATMO_START_DATE", _default_start_date())
    end = _param(context, "end_date", "ATMO_END_DATE", _default_end_date())
    datetime.strptime(start, "%Y-%m-%d")
    datetime.strptime(end, "%Y-%m-%d")
    if start > end:
        raise RuntimeError(f"ATMO start_date ({start}) must be <= end_date ({end})")
    return start, end


def _period_dates(context: dict) -> tuple[date, date]:
    start, end = _period(context)
    return (
        datetime.strptime(start, "%Y-%m-%d").date(),
        datetime.strptime(end, "%Y-%m-%d").date(),
    )


def _aasqa_codes(context: dict) -> list[str]:
    raw = _param(context, "aasqa_codes", "ATMO_AASQA_CODES", ",".join(AASQA_CODES))
    codes = [code.strip() for code in raw.split(",") if code.strip()]
    unknown = sorted(set(codes) - set(AASQA_CODES))
    if unknown:
        raise RuntimeError(f"Unknown ATMO AASQA code(s): {', '.join(unknown)}")
    return codes


def _date_windows(start: date, end: date, days: int) -> list[tuple[str, str]]:
    if days <= 0:
        raise RuntimeError("ATMO_WINDOW_DAYS must be greater than 0")

    windows = []
    current = start
    while current <= end:
        window_end = min(current + timedelta(days=days - 1), end)
        windows.append((current.isoformat(), window_end.isoformat()))
        current = window_end + timedelta(days=1)
    return windows


def _parse_atmo_filename(path: Path) -> tuple[date, date, str] | None:
    parts = path.stem.split("_")
    if len(parts) != 6 or parts[:2] != ["indices", "atmo"] or parts[4] != "aasqa":
        return None
    try:
        return (
            datetime.strptime(parts[2], "%Y-%m-%d").date(),
            datetime.strptime(parts[3], "%Y-%m-%d").date(),
            parts[5],
        )
    except ValueError:
        return None


def _existing_file_covers(aasqa: str, start: str, end: str) -> Path | None:
    wanted_start = datetime.strptime(start, "%Y-%m-%d").date()
    wanted_end = datetime.strptime(end, "%Y-%m-%d").date()

    for path in sorted(DOWNLOAD_DIR.glob(f"indices_atmo_*_*_aasqa_{aasqa}.csv")):
        parsed = _parse_atmo_filename(path)
        if not parsed or path.stat().st_size <= 0:
            continue
        file_start, file_end, file_aasqa = parsed
        if file_aasqa == aasqa and file_start <= wanted_start and file_end >= wanted_end:
            return path
    return None


def _token() -> str:
    username = os.environ.get("ATMO_USERNAME")
    password = os.environ.get("ATMO_PASSWORD")
    if not username or not password:
        raise RuntimeError("ATMO_USERNAME and ATMO_PASSWORD must be configured")

    request = Request(
        f"{API_BASE}/api/login",
        data=json.dumps({"username": username, "password": password}).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": USER_AGENT},
        method="POST",
    )
    try:
        with urlopen(request, timeout=60) as response:
            payload = json.load(response)
    except (HTTPError, URLError) as exc:
        raise RuntimeError(f"ATMO login failed: {exc}") from exc

    token = payload.get("token") or payload.get("access_token") or payload.get("jwt")
    if not token:
        raise RuntimeError("ATMO login response does not contain a JWT token")
    return token


def _request_indices(token: str, aasqa: str, start: str, end: str) -> bytes:
    params = urlencode(
        {
            "format": "csv",
            "aasqa": aasqa,
            "date_historique": start,
            "date": end,
        }
    )
    request = Request(
        f"{API_BASE}/api/v2/data/indices/atmo?{params}",
        headers={"Authorization": f"Bearer {token}", "User-Agent": USER_AGENT},
    )
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with urlopen(request, timeout=900) as response:
                return response.read()
        except HTTPError as exc:
            if exc.code not in RETRY_STATUS_CODES or attempt == MAX_RETRIES:
                raise RuntimeError(
                    f"ATMO indices download failed for AASQA {aasqa} "
                    f"({start} -> {end}): {exc}"
                ) from exc
            delay = min(120, 5 * 2 ** (attempt - 1))
            logger.warning(
                "[atmo] AASQA %s %s -> %s HTTP %s, retry %s/%s dans %ss",
                aasqa,
                start,
                end,
                exc.code,
                attempt,
                MAX_RETRIES,
                delay,
            )
            time.sleep(delay)
        except URLError as exc:
            if attempt == MAX_RETRIES:
                raise RuntimeError(
                    f"ATMO indices download failed for AASQA {aasqa} "
                    f"({start} -> {end}): {exc}"
                ) from exc
            delay = min(120, 5 * 2 ** (attempt - 1))
            logger.warning(
                "[atmo] AASQA %s %s -> %s network error, retry %s/%s dans %ss: %s",
                aasqa,
                start,
                end,
                attempt,
                MAX_RETRIES,
                delay,
                exc,
            )
            time.sleep(delay)

    raise RuntimeError(f"ATMO indices download failed for AASQA {aasqa}")


def download_atmo_indices(**context) -> None:
    start_date, end_date = _period_dates(context)
    codes = _aasqa_codes(context)
    windows = _date_windows(start_date, end_date, WINDOW_DAYS)
    token = _token()

    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    for aasqa in codes:
        for start, end in windows:
            target = DOWNLOAD_DIR / f"indices_atmo_{start}_{end}_aasqa_{aasqa}.csv"
            existing = _existing_file_covers(aasqa, start, end)
            if existing:
                logger.info(
                    "[atmo] AASQA %s %s -> %s couvert par %s, skip",
                    aasqa,
                    start,
                    end,
                    existing.name,
                )
                continue

            tmp = target.with_suffix(".tmp")
            if tmp.exists():
                tmp.unlink()

            data = _request_indices(token, aasqa, start, end)
            tmp.write_bytes(data)
            tmp.replace(target)
            logger.info(
                "[atmo] AASQA %s %s -> %s: %s bytes -> %s",
                aasqa,
                start,
                end,
                len(data),
                target,
            )


def _clean_code(value: str | None) -> str:
    value = (value or "").strip().upper()
    if not value:
        return ""
    if value.isdigit():
        return value.zfill(5)
    return value


def _parse_int(value: str | None) -> int | None:
    value = (value or "").strip().strip('"')
    if not value:
        return None
    try:
        parsed = int(float(value.replace(",", ".")))
    except ValueError:
        return None
    return parsed if math.isfinite(parsed) else None


def _parse_year(value: str | None) -> int | None:
    value = (value or "").strip()
    if len(value) < 4:
        return None
    try:
        return int(value[:4])
    except ValueError:
        return None


def _median(values: list[int]) -> float:
    if not values:
        return 0.0
    return round(float(statistics.median(values)), 2)


def _code_to_city_id(cur: psycopg2.extensions.cursor) -> dict[str, int]:
    cur.execute(
        """
        SELECT upper(lpad(trim(code), 5, '0')), min(id)
        FROM cities
        WHERE code IS NOT NULL AND trim(code) <> ''
        GROUP BY upper(lpad(trim(code), 5, '0'))
        """
    )
    return {row[0]: row[1] for row in cur.fetchall()}


def _csv_files(context: dict) -> list[Path]:
    start_date, end_date = _period_dates(context)
    selected_codes = set(_aasqa_codes(context))
    files = []
    for path in sorted(DOWNLOAD_DIR.glob("indices_atmo_*_*_aasqa_*.csv")):
        parsed = _parse_atmo_filename(path)
        if not parsed:
            continue
        file_start, file_end, aasqa = parsed
        if aasqa not in selected_codes:
            continue
        if file_end < start_date or file_start > end_date:
            continue
        files.append(path)
    if not files:
        raise RuntimeError(
            f"No ATMO CSV found in {DOWNLOAD_DIR} for period {start_date} -> {end_date}"
        )
    return files


def _iter_rows(files: list[Path]):
    for path in files:
        logger.info("[atmo] lecture %s", path.name)
        with path.open(encoding="utf-8-sig", errors="replace", newline="") as fh:
            yield from csv.DictReader(fh)


def load_air_quality(**context) -> None:
    files = _csv_files(context)
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            code_to_city = _code_to_city_id(cur)
            stats = defaultdict(lambda: defaultdict(list))
            counters = {
                "read": 0,
                "skipped_city": 0,
                "skipped_date": 0,
                "skipped_quality": 0,
                "duplicates": 0,
            }
            seen_days: set[tuple[int, str]] = set()

            for row in _iter_rows(files):
                counters["read"] += 1
                if row.get("type_zone") and row["type_zone"].lower() != "commune":
                    continue

                city_id = code_to_city.get(_clean_code(row.get("code_zone")))
                if city_id is None:
                    counters["skipped_city"] += 1
                    continue

                day = (row.get("date_ech") or row.get("date_dif") or "").strip()
                year = _parse_year(day)
                if year is None:
                    counters["skipped_date"] += 1
                    continue

                day_key = (city_id, day)
                if day_key in seen_days:
                    counters["duplicates"] += 1
                    continue
                seen_days.add(day_key)

                quality = _parse_int(row.get("code_qual"))
                if quality is None:
                    counters["skipped_quality"] += 1
                    continue

                bucket = stats[(city_id, year)]
                bucket["indice"].append(quality)
                for column, source in (
                    ("pm25", "code_pm25"),
                    ("pm10", "code_pm10"),
                    ("no2", "code_no2"),
                    ("o3", "code_o3"),
                ):
                    value = _parse_int(row.get(source))
                    if value is not None:
                        bucket[column].append(value)

                if quality == 1:
                    bucket["bon"].append(1)
                elif quality in (2, 3):
                    bucket["moyen"].append(1)
                elif quality >= 4:
                    bucket["mauvais"].append(1)

            rows = [
                (
                    city_id,
                    year,
                    int(round(_median(values["indice"]))),
                    _median(values["pm25"]),
                    _median(values["pm10"]),
                    _median(values["no2"]),
                    _median(values["o3"]),
                    len(values["bon"]),
                    len(values["moyen"]),
                    len(values["mauvais"]),
                )
                for (city_id, year), values in sorted(stats.items())
            ]

            if not rows:
                raise RuntimeError("No ATMO rows matched known cities")

            psycopg2.extras.execute_values(
                cur,
                """
                DELETE FROM air_quality aq
                USING (VALUES %s) AS v(city_id, annee)
                WHERE aq."cityId" = v.city_id AND aq.annee = v.annee
                """,
                sorted({(row[0], row[1]) for row in rows}),
                template="(%s, %s)",
                page_size=1000,
            )
            psycopg2.extras.execute_values(
                cur,
                'INSERT INTO air_quality '
                '("cityId", annee, indice_atmo_median, pm25_median, pm10_median, '
                "no2_median, o3_median, nb_jours_bon, nb_jours_moyen, nb_jours_mauvais) "
                "VALUES %s",
                rows,
                page_size=1000,
            )

        conn.commit()
        logger.info(
            "[atmo] %s lignes lues, %s agregats inseres, %s sans commune, "
            "%s sans date, %s sans indice, %s doublons jour/commune",
            counters["read"],
            len(rows),
            counters["skipped_city"],
            counters["skipped_date"],
            counters["skipped_quality"],
            counters["duplicates"],
        )
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
