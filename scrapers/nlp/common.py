"""Utilitaires partagés pour le pipeline NLP avis (MongoDB, tokenisation, stopwords)."""

from __future__ import annotations

import os
import re
from datetime import datetime, timezone

from pymongo import MongoClient
from pymongo.database import Database

TOKEN_RE = re.compile(r"[a-zàâäéèêëïîôùûüçœæ'-]+", re.I)

# Stopwords français (liste compacte, extensible)
FRENCH_STOPWORDS = frozenset(
    """
    alors au aucuns aussi autre avant avec avoir bon car ce cela ces ceux chaque ci comme
    comment dans des du dedans dehors depuis devrait doit donc dos dedans derriere des
    desole detre devrait doit du dès déjà elle elles en encore essai est etait ete etre eu
    eux fi flac floc font gens ha he hem hep hi ho holà hop hormis hors hou hua huehui hui
    hum hé hélas i il ils je jusque juste la le les leur leurs loin lui ma maint maison mais
    me meme mes moi mon mot moyennant même néanmoins ni nommés nos notre nous ne nom non nos
    notre nous nul nôtre nôtres on ont ou o par parce pas pendant peut peu peux plupart pour
    pourquoi quand que quel quelle quelles quels qui quoi sa sans se ses si sien sien siens
    sient son sont sous soyez suis sur ta te tes ton tous tout toute toutes tu un une va vers
    voici voila vont votre vous vu votre vos vu y à a ai aie aient aies ait as avons avez ont
    été étiez étions étions étiez été c d j l m n s t qu il ell on ce se ne pas plus très
    bien tres trop encore aussi meme ca sa ou et le la les un une des du de au aux en sur
    pour par avec sans sous chez entre contre vers dans dont où que qui quoi dont lequel
    cette ces mon ton son ma ta sa mes tes ses notre votre leur nos vos leurs ce cet
    """.split()
)


def get_mongo_db() -> Database:
    url = os.environ.get("MONGODB_URL")
    if not url:
        raise RuntimeError("MONGODB_URL manquant")
    client = MongoClient(url)
    return client.get_database()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def tokenize(text: str) -> list[str]:
    if not text:
        return []
    return [
        w.lower()
        for w in TOKEN_RE.findall(text)
        if len(w) >= 3 and w.lower() not in FRENCH_STOPWORDS
    ]


def classify_label(star_score: float) -> str:
    """Classifie positif / neutre / négatif à partir d'un score 1–5."""
    if star_score <= 2.0:
        return "negative"
    if star_score <= 3.0:
        return "neutral"
    return "positive"
