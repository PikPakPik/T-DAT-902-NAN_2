"""
DAG Airflow — Pipeline Avis + NLP (issues #38, #55, #56)
---------------------------------------------------------
1. Scrape avis bien-dans-ma-ville → MongoDB (cities + reviews)
2. Analyse de sentiment (HuggingFace nlptown/bert-base-multilingual-uncased-sentiment)
3. Génération wordcloud par commune (top 50 mots, stopwords FR)
4. Rapport final

Schedule : hebdomadaire (dimanche 03:00)
"""

from __future__ import annotations

from datetime import datetime, timedelta

from airflow import DAG
from airflow.providers.standard.operators.python import PythonOperator

from pipeline_avis import (
    report_pipeline_stats,
    run_bdmv_scraper,
    run_sentiment_analysis,
    run_wordcloud_generation,
)

with DAG(
    dag_id="pipeline_avis_nlp",
    description="Scrape avis bien-dans-ma-ville, sentiment NLP et wordclouds par commune",
    start_date=datetime(2026, 1, 1),
    schedule="0 3 * * 0",
    catchup=False,
    default_args={
        "retries": 2,
        "retry_delay": timedelta(minutes=5),
    },
    tags=["homepedia", "avis", "nlp", "mongodb"],
) as dag:
    scrape = PythonOperator(
        task_id="scrape_bdmv_reviews",
        python_callable=run_bdmv_scraper,
        execution_timeout=timedelta(hours=12),
    )

    sentiment = PythonOperator(
        task_id="analyze_sentiment",
        python_callable=run_sentiment_analysis,
        execution_timeout=timedelta(hours=6),
    )

    wordcloud = PythonOperator(
        task_id="generate_wordclouds",
        python_callable=run_wordcloud_generation,
        execution_timeout=timedelta(hours=2),
    )

    report = PythonOperator(
        task_id="report_pipeline",
        python_callable=report_pipeline_stats,
    )

    scrape >> sentiment >> wordcloud >> report
