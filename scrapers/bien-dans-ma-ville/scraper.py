"""
Scrape avis depuis le sitemap bien-dans-ma-ville.fr et alimente MongoDB
(collections `cities` et `reviews`, alignées sur les schémas Nest/Mongoose).
Traite communes et quartiers (clé code INSEE + quartier).

Usage (Windows: `py` si `python` est introuvable):
  py scraper.py --dry-run
  $env:MONGODB_URL="mongodb://..."; py scraper.py --delay-ms=1000 --workers=8

Variables d'environnement: MONGODB_URL, SITEMAP_URL, DELAY_MS, DRY_RUN, WORKERS
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import httpx
from bs4 import BeautifulSoup
from pymongo import MongoClient

DEFAULT_SITEMAP = "https://www.bien-dans-ma-ville.fr/sitemap-villeavis.xml"
DEFAULT_WORKERS = 8

_thread_local = threading.local()
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

CRITERIA_ROW = {
    "Sécurité": "securite",
    "Éducation": "education",
    "Sport / Loisir": "sport_loisir",
    "Environnement": "environnement",
    "Vie pratique": "vie_pratique",
}

CRITERIA_SPAN_TITLE = {
    "Sécurité": "securite",
    "Éducation": "education",
    "Sport / Loisir": "sport_loisir",
    "Environnement": "environnement",
    "Vie pratique": "vie_pratique",
}


def fetch_text(client: httpx.Client, url: str) -> str:
    r = client.get(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xml;q=0.9,*/*;q=0.8",
        },
        follow_redirects=True,
    )
    r.raise_for_status()
    return r.text


def extract_loc_urls(xml: str) -> list[str]:
    urls: list[str] = []
    for m in re.finditer(r"<loc>\s*([^<\s]+)\s*</loc>", xml, re.I):
        u = m.group(1).strip()
        if "/avis.html" in u:
            urls.append(u)
    return urls


_INSEE_IN_URL = re.compile(r"-((?:\d{5}|2[AB]\d{3}))/", re.I)


def insee_from_avis_url(url: str) -> str | None:
    m = _INSEE_IN_URL.search(url)
    return m.group(1).upper() if m else None


def quartier_slug_from_url(url: str) -> str | None:
    m = re.search(r"/(quartier-[^/]+)/avis\.html", url, re.I)
    return m.group(1) if m else None


def location_filter(code: str, quartier: str | None) -> dict:
    return {"code": code, "quartier": quartier}


def clamp_rating(n: float) -> float:
    if n is None or n != n:  # NaN
        return 0.0
    return max(0.0, min(5.0, float(n)))


def parse_fr_date(s: str) -> datetime | None:
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", s.strip())
    if not m:
        return None
    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    try:
        return datetime(y, mo, d, 12, 0, 0)
    except ValueError:
        return None


def parse_city_table(soup: BeautifulSoup) -> dict[str, float]:
    criteria = {
        "securite": 0.0,
        "education": 0.0,
        "sport_loisir": 0.0,
        "environnement": 0.0,
        "vie_pratique": 0.0,
    }
    for tr in soup.select("#note table.bloc_chiffre tbody tr"):
        th = tr.find("th")
        if not th:
            continue
        label = th.get_text(strip=True)
        key = CRITERIA_ROW.get(label)
        if not key:
            continue
        td = tr.find("td")
        if not td:
            continue
        span = td.find("span")
        if not span:
            continue
        raw = span.get_text(strip=True).replace(",", ".")
        try:
            criteria[key] = clamp_rating(float(raw))
        except ValueError:
            pass
    return criteria


def parse_average_rating(soup: BeautifulSoup) -> float:
    el = soup.select_one(".bloc_notemoyenne .total")
    if not el:
        return 0.0
    t = re.sub(r"\s+", "", el.get_text())
    m = re.match(r"^([\d.,]+)", t)
    if not m:
        return 0.0
    try:
        return clamp_rating(float(m.group(1).replace(",", ".")))
    except ValueError:
        return 0.0


def parse_commune_name(soup: BeautifulSoup) -> str:
    main = soup.select_one("#main-content")
    if main and main.get("data-ville"):
        return main["data-ville"].strip()
    h1 = soup.select_one("#entete h1")
    if not h1:
        return "Inconnue"
    text = re.sub(r"\s+", " ", h1.get_text(strip=True))
    m = re.match(r"^Avis\s+(.+?)\s+(\d{5})\s*$", text, re.I)
    if m:
        return m.group(1).strip()
    return re.sub(r"^Avis\s+", "", text, flags=re.I).strip() or "Inconnue"


def parse_quartier_display_name(soup: BeautifulSoup) -> str | None:
    for h2 in soup.select("h2"):
        text = h2.get_text(strip=True)
        m = re.search(r"sur le quartier\s+(.+?)\s+à\s+", text, re.I)
        if m:
            return m.group(1).strip()
        m = re.search(r"dans le quartier\s+(.+?)\s*\?", text, re.I)
        if m:
            return m.group(1).strip()
    return None


def parse_display_name(soup: BeautifulSoup, quartier: str | None) -> str:
    if quartier:
        qname = parse_quartier_display_name(soup)
        if qname:
            return qname
        return quartier.replace("-", " ").title()
    return parse_commune_name(soup)


def parse_reviews(
    soup: BeautifulSoup, city_code: str, quartier: str | None
) -> list[dict]:
    out: list[dict] = []
    for div in soup.select(".commentaires .commentaire"):
        classes = div.get("class") or []
        if "bdmv" in classes:
            continue
        note_total = div.select_one(".note_total")
        if not note_total:
            continue
        source_id = (div.get("data-pouce") or "").strip() or None
        try:
            overall = clamp_rating(
                float(note_total.get_text(strip=True).replace(",", "."))
            )
        except ValueError:
            continue
        spans = div.select(".notes span[title]")
        if len(spans) < 5:
            continue
        criteria_notes: dict[str, float] = {}
        for sp in spans:
            title = (sp.get("title") or "").strip()
            key = CRITERIA_SPAN_TITLE.get(title)
            if not key:
                continue
            try:
                criteria_notes[key] = clamp_rating(float(int(sp.get_text(strip=True))))
            except ValueError:
                continue
        if len(criteria_notes) < 5:
            continue
        date_el = div.select_one(".date")
        if not date_el:
            continue
        dt = parse_fr_date(date_el.get_text())
        if not dt:
            continue
        desc = div.select_one("p.description")
        if not desc:
            continue
        comment = desc.get_text(strip=True)
        if not comment:
            continue
        pouce_spans = div.select(".pouces .pouce span")
        thumbs_up = 0
        thumbs_down = 0
        if len(pouce_spans) >= 1:
            try:
                thumbs_up = int(pouce_spans[0].get_text(strip=True))
            except ValueError:
                pass
        if len(pouce_spans) >= 2:
            try:
                thumbs_down = int(pouce_spans[1].get_text(strip=True))
            except ValueError:
                pass
        out.append(
            {
                "code": city_code,
                "quartier": quartier,
                "source_id": source_id,
                "date": dt,
                "overall_rating": overall,
                "criteria_notes": {
                    "securite": criteria_notes["securite"],
                    "education": criteria_notes["education"],
                    "sport_loisir": criteria_notes["sport_loisir"],
                    "environnement": criteria_notes["environnement"],
                    "vie_pratique": criteria_notes["vie_pratique"],
                },
                "comment": comment,
                "thumbs_up": thumbs_up,
                "thumbs_down": thumbs_down,
            }
        )
    return out


def _worker_init() -> None:
    _thread_local.client = httpx.Client(timeout=60.0)


def _http_client() -> httpx.Client:
    client = getattr(_thread_local, "client", None)
    if client is None:
        client = httpx.Client(timeout=60.0)
        _thread_local.client = client
    return client


def process_url(
    url: str,
    *,
    dry_run: bool,
    cities_col,
    reviews_col,
    delay_ms: int,
) -> tuple[bool, str]:
    if delay_ms > 0:
        time.sleep(delay_ms / 1000.0)
    try:
        html = fetch_text(_http_client(), url)
        city, revs = parse_city_page(html, url)
        if not dry_run and cities_col is not None and reviews_col is not None:
            persist_page(cities_col, reviews_col, city, revs)
        kind = "quartier" if city["quartier"] else "ville"
        q = f" / {city['quartier']}" if city["quartier"] else ""
        return (
            True,
            f"{city['name']} ({city['code']}) [{kind}{q}] — {len(revs)} avis",
        )
    except Exception as e:
        return False, f"ERREUR {url}: {e}"


def parse_city_page(html: str, page_url: str) -> tuple[dict, list[dict]]:
    soup = BeautifulSoup(html, "html.parser")
    code = insee_from_avis_url(page_url)
    if not code:
        raise ValueError(f"Code INSEE introuvable dans {page_url}")
    quartier = quartier_slug_from_url(page_url)
    city = {
        "name": parse_display_name(soup, quartier),
        "code": code,
        "quartier": quartier,
        "average_rating": parse_average_rating(soup),
        "criteria_notes": parse_city_table(soup),
    }
    reviews = parse_reviews(soup, code, quartier)
    return city, reviews


def persist_page(
    cities_col,
    reviews_col,
    city: dict,
    revs: list[dict],
) -> None:
    loc = location_filter(city["code"], city["quartier"])
    cities_col.replace_one(loc, city, upsert=True)
    reviews_col.delete_many(loc)
    for r in revs:
        sid = r.get("source_id")
        if sid:
            reviews_col.replace_one({"source_id": sid}, r, upsert=True)
        else:
            reviews_col.insert_one(r)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--delay-ms", type=int, default=800)
    p.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    if os.environ.get("DELAY_MS", "") != "":
        delay_ms = int(os.environ["DELAY_MS"])
    else:
        delay_ms = args.delay_ms
    if os.environ.get("WORKERS", "") != "":
        workers = int(os.environ["WORKERS"])
    else:
        workers = args.workers
    if workers < 1:
        print("--workers doit être >= 1.", file=sys.stderr)
        sys.exit(1)
    dry_run = (
        os.environ.get("DRY_RUN", "").lower() in ("1", "true")
        or args.dry_run
    )
    sitemap_url = os.environ.get("SITEMAP_URL") or DEFAULT_SITEMAP
    mongo_url = os.environ.get("MONGODB_URL")

    if not dry_run and not mongo_url:
        print("MONGODB_URL manquant (ou utilisez --dry-run).", file=sys.stderr)
        sys.exit(1)

    print(f"Sitemap: {sitemap_url}")
    with httpx.Client(timeout=60.0) as client:
        xml = fetch_text(client, sitemap_url)
        urls = extract_loc_urls(xml)
        total = len(urls)
        print(
            f"{total} page(s) avis à traiter ({workers} worker(s))."
        )

        mongo_client: MongoClient | None = None
        cities_col = reviews_col = None
        if not dry_run:
            mongo_client = MongoClient(mongo_url)
            db = mongo_client.get_database()
            cities_col = db["cities"]
            reviews_col = db["reviews"]
            cities_col.create_index([("code", 1), ("quartier", 1)], unique=True)
            reviews_col.create_index([("source_id", 1)], unique=True, sparse=True)
            reviews_col.create_index([("code", 1), ("quartier", 1)])

        per_worker_delay = delay_ms // max(workers, 1) if delay_ms > 0 else 0
        ok = err = 0
        done = 0
        stats_lock = threading.Lock()

        with ThreadPoolExecutor(
            max_workers=workers, initializer=_worker_init
        ) as executor:
            futures = {
                executor.submit(
                    process_url,
                    url,
                    dry_run=dry_run,
                    cities_col=cities_col,
                    reviews_col=reviews_col,
                    delay_ms=per_worker_delay,
                ): url
                for url in urls
            }
            for fut in as_completed(futures):
                success, msg = fut.result()
                with stats_lock:
                    done += 1
                    n = done
                    if success:
                        ok += 1
                    else:
                        err += 1
                print(f"[{n}/{total}] {msg}")

        if mongo_client:
            mongo_client.close()

    suffix = " (dry-run)" if dry_run else ""
    print(f"Terminé: {ok} OK, {err} erreur(s).{suffix}")


if __name__ == "__main__":
    main()
