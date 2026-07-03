from __future__ import annotations

from pathlib import Path

import pytest
from pyspark.sql import SparkSession


FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"
LOYERS_FIXTURE_YEAR = FIXTURES_DIR / "carte_loyers" / "2024"


@pytest.fixture(scope="session")
def spark() -> SparkSession:
    session = (
        SparkSession.builder.master("local[1]")
        .appName("load_loyers-tests")
        .config("spark.ui.enabled", "false")
        .config("spark.driver.bindAddress", "127.0.0.1")
        .getOrCreate()
    )
    session.sparkContext.setLogLevel("ERROR")
    yield session
    session.stop()


@pytest.fixture
def loyers_year_dir() -> Path:
    return LOYERS_FIXTURE_YEAR
