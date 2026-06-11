"""
Analyse de sentiment des avis MongoDB (nlptown/bert-base-multilingual-uncased-sentiment).

Score 0–5, classification positive / neutral / negative, mots-clés par avis,
agrégation sentiment_global par commune (code INSEE).

Optimisations : inférence BERT batchée (sans pipeline HF), bulk_write MongoDB,
max_length réduit, threads PyTorch configurables.

Usage:
  python sentiment.py
  SENTIMENT_BATCH_SIZE=128 python sentiment.py --force
"""

from __future__ import annotations

import argparse
import os
from typing import Any

from common import classify_label, get_mongo_db, tokenize, utcnow
from pymongo import UpdateOne

# Réduit le bruit stderr (barres de progression HF → faux ERROR Airflow)
os.environ.setdefault("TRANSFORMERS_NO_ADVISORY_WARNINGS", "1")
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

DEFAULT_MODEL = "nlptown/bert-base-multilingual-uncased-sentiment"
DEFAULT_BATCH_SIZE = 64
DEFAULT_KEYWORDS = 10
DEFAULT_MAX_LENGTH = 256
MONGO_BULK_SIZE = 500

_analyzer = None


class SentimentAnalyzer:
    """Inférence batchée directe (plus rapide que pipeline HuggingFace)."""

    def __init__(self, model_name: str, max_length: int) -> None:
        import torch
        from transformers import AutoModelForSequenceClassification, AutoTokenizer
        from transformers.utils import logging as hf_logging

        hf_logging.set_verbosity_error()

        threads = int(os.environ.get("SENTIMENT_TORCH_THREADS", "0"))
        if threads > 0:
            torch.set_num_threads(threads)

        print(f"Chargement du modèle {model_name}…")
        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_name)
        self.model.eval()
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model.to(self.device)
        self.max_length = max_length

        # Labels nlptown : "1 star" … "5 stars" → scores 1–5
        id2label = self.model.config.id2label
        self.star_weights = torch.zeros(len(id2label), dtype=torch.float32)
        for idx, label in id2label.items():
            try:
                self.star_weights[int(idx)] = float(str(label).split()[0])
            except (ValueError, IndexError):
                self.star_weights[int(idx)] = 3.0
        self.star_weights = self.star_weights.to(self.device)

    def predict_batch(self, comments: list[str]) -> list[dict[str, Any]]:
        import torch

        if not comments:
            return []

        inputs = self.tokenizer(
            comments,
            padding=True,
            truncation=True,
            max_length=self.max_length,
            return_tensors="pt",
        )
        inputs = {key: value.to(self.device) for key, value in inputs.items()}

        with torch.inference_mode():
            logits = self.model(**inputs).logits
            probs = torch.softmax(logits, dim=-1)
            stars = (probs * self.star_weights).sum(dim=-1).tolist()

        return [
            {
                "sentiment_score": round(max(1.0, min(5.0, star)), 2),
                "sentiment_label": classify_label(star),
            }
            for star in stars
        ]


def get_analyzer() -> SentimentAnalyzer:
    global _analyzer
    if _analyzer is None:
        model = os.environ.get("SENTIMENT_MODEL", DEFAULT_MODEL)
        max_length = int(os.environ.get("SENTIMENT_MAX_LENGTH", DEFAULT_MAX_LENGTH))
        _analyzer = SentimentAnalyzer(model, max_length)
    return _analyzer


def extract_keywords(text: str, max_keywords: int = DEFAULT_KEYWORDS) -> list[str]:
    from collections import Counter

    counts = Counter(tokenize(text))
    return [word for word, _ in counts.most_common(max_keywords)]


def analyze_batch(comments: list[str]) -> list[dict[str, Any]]:
    return get_analyzer().predict_batch(comments)


def bulk_update_reviews(reviews_col, operations: list[UpdateOne]) -> None:
    if not operations:
        return
    for i in range(0, len(operations), MONGO_BULK_SIZE):
        chunk = operations[i : i + MONGO_BULK_SIZE]
        reviews_col.bulk_write(chunk, ordered=False)


def aggregate_commune_sentiment(
    reviews_col,
    codes: set[str] | None = None,
) -> int:
    """Calcule sentiment_global sur les documents cities (quartier=null)."""
    match: dict[str, Any] = {"sentiment_analyzed_at": {"$ne": None}}
    if codes:
        match["code"] = {"$in": list(codes)}

    pipeline = [
        {"$match": match},
        {
            "$group": {
                "_id": "$code",
                "avg_score": {"$avg": "$sentiment_score"},
                "count": {"$sum": 1},
                "positive": {
                    "$sum": {"$cond": [{"$eq": ["$sentiment_label", "positive"]}, 1, 0]}
                },
                "neutral": {
                    "$sum": {"$cond": [{"$eq": ["$sentiment_label", "neutral"]}, 1, 0]}
                },
                "negative": {
                    "$sum": {"$cond": [{"$eq": ["$sentiment_label", "negative"]}, 1, 0]}
                },
            }
        },
    ]
    groups = list(reviews_col.aggregate(pipeline))
    cities_col = reviews_col.database["cities"]
    now = utcnow()
    updated = 0

    for group in groups:
        code = group["_id"]
        if not code:
            continue
        avg = round(float(group["avg_score"]), 2)
        sentiment_global = {
            "average_score": avg,
            "label": classify_label(avg),
            "review_count": int(group["count"]),
            "positive_count": int(group["positive"]),
            "neutral_count": int(group["neutral"]),
            "negative_count": int(group["negative"]),
            "analyzed_at": now,
        }
        result = cities_col.update_many(
            {"code": code, "quartier": None},
            {"$set": {"sentiment_global": sentiment_global}},
        )
        if result.matched_count == 0:
            cities_col.update_one(
                {"code": code, "quartier": None},
                {
                    "$set": {
                        "name": code,
                        "code": code,
                        "quartier": None,
                        "average_rating": 0,
                        "criteria_notes": {
                            "securite": 0,
                            "education": 0,
                            "sport_loisir": 0,
                            "environnement": 0,
                            "vie_pratique": 0,
                        },
                        "sentiment_global": sentiment_global,
                    }
                },
                upsert=True,
            )
        updated += 1

    return updated


def analyze_reviews(
    *,
    batch_size: int | None = None,
    force: bool = False,
) -> dict[str, int]:
    if batch_size is None:
        batch_size = int(os.environ.get("SENTIMENT_BATCH_SIZE", DEFAULT_BATCH_SIZE))

    db = get_mongo_db()
    reviews_col = db["reviews"]
    query: dict[str, Any] = {}
    if not force:
        query = {
            "$or": [
                {"sentiment_analyzed_at": None},
                {"sentiment_analyzed_at": {"$exists": False}},
            ]
        }

    # Snapshot des _id à traiter : évite un dépassement du compteur si le scraper
    # réécrit des avis (replace_one) pendant l'inférence et que le curseur voit
    # plus de documents que count_documents() au départ.
    total_reviews = reviews_col.count_documents({})
    work_ids = [
        doc["_id"]
        for doc in reviews_col.find(query, {"_id": 1}).sort("_id", 1)
    ]
    pending = len(work_ids)
    already_done = total_reviews - pending
    max_length = int(os.environ.get("SENTIMENT_MAX_LENGTH", DEFAULT_MAX_LENGTH))
    print(
        f"{pending} avis à analyser sur {total_reviews} au total "
        f"({already_done} déjà traités, batch_size={batch_size}, "
        f"max_length={max_length})."
    )

    analyzed = 0
    skipped = 0
    touched_codes: set[str] = set()
    now = utcnow()
    projection = {"_id": 1, "code": 1, "comment": 1}
    fetch_chunk = batch_size * 4

    batch_ids: list[Any] = []
    batch_comments: list[str] = []
    batch_codes: list[str] = []
    pending_writes: list[UpdateOne] = []

    def log_progress(processed: int) -> None:
        if pending <= 0:
            return
        print(
            f"  {min(processed, pending)}/{pending} avis parcourus "
            f"({analyzed} mis à jour, {skipped} supprimés)…"
        )

    def flush_batch() -> None:
        nonlocal analyzed
        if not batch_comments:
            return

        results = analyze_batch(batch_comments)
        for doc_id, code, result, comment in zip(
            batch_ids, batch_codes, results, batch_comments, strict=True
        ):
            pending_writes.append(
                UpdateOne(
                    {"_id": doc_id},
                    {
                        "$set": {
                            "sentiment_score": result["sentiment_score"],
                            "sentiment_label": result["sentiment_label"],
                            "keywords": extract_keywords(comment),
                            "sentiment_analyzed_at": now,
                        }
                    },
                )
            )
            analyzed += 1
            if code:
                touched_codes.add(code)

        if len(pending_writes) >= MONGO_BULK_SIZE:
            bulk_update_reviews(reviews_col, pending_writes)
            pending_writes.clear()

        batch_ids.clear()
        batch_comments.clear()
        batch_codes.clear()

    processed = 0
    for offset in range(0, pending, fetch_chunk):
        id_chunk = work_ids[offset : offset + fetch_chunk]
        docs_by_id = {
            doc["_id"]: doc
            for doc in reviews_col.find(
                {"_id": {"$in": id_chunk}},
                projection,
            )
        }
        for doc_id in id_chunk:
            processed += 1
            doc = docs_by_id.get(doc_id)
            if doc is None:
                skipped += 1
                if processed % batch_size == 0 or processed == pending:
                    log_progress(processed)
                continue

            comment = (doc.get("comment") or "").strip()
            if not comment:
                pending_writes.append(
                    UpdateOne(
                        {"_id": doc["_id"]},
                        {
                            "$set": {
                                "sentiment_score": 3.0,
                                "sentiment_label": "neutral",
                                "keywords": [],
                                "sentiment_analyzed_at": now,
                            }
                        },
                    )
                )
                analyzed += 1
                if len(pending_writes) >= MONGO_BULK_SIZE:
                    bulk_update_reviews(reviews_col, pending_writes)
                    pending_writes.clear()
                if processed % batch_size == 0 or processed == pending:
                    log_progress(processed)
                continue

            batch_ids.append(doc["_id"])
            batch_comments.append(comment)
            batch_codes.append(doc.get("code") or "")
            if len(batch_comments) >= batch_size:
                flush_batch()
                log_progress(processed)

    flush_batch()
    bulk_update_reviews(reviews_col, pending_writes)
    pending_writes.clear()
    if pending > 0:
        log_progress(processed)

    communes = aggregate_commune_sentiment(reviews_col, touched_codes or None)
    stats = {
        "analyzed": analyzed,
        "skipped": skipped,
        "communes_updated": communes,
        "total_reviews": total_reviews,
        "pending_before": pending,
        "batch_size": batch_size,
    }
    print(f"Sentiment terminé: {stats}")
    return stats


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--force",
        action="store_true",
        help="Ré-analyser tous les avis même déjà traités",
    )
    parser.add_argument("--batch-size", type=int, default=None)
    args = parser.parse_args()
    analyze_reviews(batch_size=args.batch_size, force=args.force)


if __name__ == "__main__":
    main()
