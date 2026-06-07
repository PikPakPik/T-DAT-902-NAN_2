"""
Génère wordcloud_data (top 50 mots) par commune à partir des avis analysés.

Comptage simple ou TF-IDF (WORDCLOUD_METHOD=count|tfidf), stopwords français exclus.

Usage:
  python wordcloud.py
"""

from __future__ import annotations

import argparse
import os
from collections import Counter
from typing import Any

from common import get_mongo_db, tokenize, utcnow

TOP_N = 50
DEFAULT_METHOD = "count"


def count_words(comments: list[str]) -> Counter[str]:
    counter: Counter[str] = Counter()
    for comment in comments:
        counter.update(tokenize(comment))
    return counter


def tfidf_words(comments: list[str], global_df: dict[str, int], n_docs: int) -> Counter[str]:
    """TF-IDF local : tf dans la commune × idf global sur l'ensemble des communes."""
    tf = count_words(comments)
    if not tf or n_docs <= 0:
        return tf
    scores: Counter[str] = Counter()
    for word, freq in tf.items():
        idf = __import__("math").log((1 + n_docs) / (1 + global_df.get(word, 0))) + 1
        scores[word] = freq * idf
    return scores


def build_global_document_frequency(reviews_col) -> tuple[dict[str, int], int]:
    """Nombre de communes contenant chaque mot (pour IDF)."""
    pipeline = [
        {
            "$match": {
                "sentiment_analyzed_at": {"$ne": None},
                "comment": {"$exists": True, "$ne": ""},
            }
        },
        {"$group": {"_id": "$code", "comments": {"$push": "$comment"}}},
    ]
    df: Counter[str] = Counter()
    n_docs = 0
    for group in reviews_col.aggregate(pipeline):
        n_docs += 1
        words_in_doc = set()
        for comment in group.get("comments") or []:
            words_in_doc.update(tokenize(comment))
        for word in words_in_doc:
            df[word] += 1
    return dict(df), n_docs


def top_words(counter: Counter[str], n: int = TOP_N) -> list[dict[str, Any]]:
    return [{"word": w, "weight": int(c)} for w, c in counter.most_common(n)]


def generate_wordclouds(*, method: str | None = None, top_n: int = TOP_N) -> dict[str, int]:
    method = (method or os.environ.get("WORDCLOUD_METHOD", DEFAULT_METHOD)).lower()
    db = get_mongo_db()
    reviews_col = db["reviews"]
    cities_col = db["cities"]

    global_df: dict[str, int] = {}
    n_docs = 0
    if method == "tfidf":
        global_df, n_docs = build_global_document_frequency(reviews_col)

    pipeline = [
        {
            "$match": {
                "sentiment_analyzed_at": {"$ne": None},
                "comment": {"$exists": True, "$ne": ""},
            }
        },
        {"$group": {"_id": "$code", "comments": {"$push": "$comment"}}},
    ]

    updated = 0
    now = utcnow()

    for group in reviews_col.aggregate(pipeline):
        code = group["_id"]
        if not code:
            continue
        comments = group.get("comments") or []
        if method == "tfidf":
            scores = tfidf_words(comments, global_df, n_docs)
            words = [
                {"word": w, "weight": round(float(c), 4)}
                for w, c in scores.most_common(top_n)
            ]
        else:
            scores = count_words(comments)
            words = top_words(scores, top_n)

        wordcloud_data = {
            "method": method,
            "words": words,
            "generated_at": now,
        }
        result = cities_col.update_many(
            {"code": code, "quartier": None},
            {"$set": {"wordcloud_data": wordcloud_data}},
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
                        "wordcloud_data": wordcloud_data,
                    }
                },
                upsert=True,
            )
        updated += 1

    stats = {"communes_updated": updated, "method": method}
    print(f"Wordclouds terminés: {stats}")
    return stats


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--method",
        choices=("count", "tfidf"),
        default=None,
        help="Méthode de pondération (défaut: count ou WORDCLOUD_METHOD)",
    )
    parser.add_argument("--top", type=int, default=TOP_N)
    args = parser.parse_args()
    generate_wordclouds(method=args.method, top_n=args.top)


if __name__ == "__main__":
    main()
