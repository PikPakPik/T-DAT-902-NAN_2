from __future__ import annotations

import logging
import sys
from pathlib import Path

import pytest
from pyspark.sql.functions import col, lit, lpad, trim
from pyspark.sql.types import Row

from load_loyers import (
    CSV_SUFFIXES,
    find_csv,
    jdbc_config,
    log_unmatched_communes,
    main,
    merge_indicators,
    parse_args,
    read_loyers_csv,
)


def test_parse_args_cli(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sys, "argv", ["load_loyers.py", "--year", "2023", "--data-dir", "/tmp/data"])
    args = parse_args()
    assert args.year == 2023
    assert args.data_dir == "/tmp/data"


def test_parse_args_env_year(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sys, "argv", ["load_loyers.py"])
    monkeypatch.setenv("LOYERS_YEAR", "2024")
    args = parse_args()
    assert args.year == 2024


def test_jdbc_config_uses_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("POSTGRES_USER", "app")
    monkeypatch.setenv("POSTGRES_PASSWORD", "secret")
    monkeypatch.setenv("POSTGRES_DB", "testdb")
    url, props = jdbc_config()
    assert url == "jdbc:postgresql://postgis:5432/testdb"
    assert props["user"] == "app"
    assert props["password"] == "secret"


def test_find_csv_resolves_suffix(loyers_year_dir: Path) -> None:
    path = find_csv(str(loyers_year_dir), CSV_SUFFIXES["loyer_median_apt"])
    assert path.endswith("pred-app-mef-dhup.csv")


def test_find_csv_raises_when_missing(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match="Aucun CSV"):
        find_csv(str(tmp_path), "pred-app-mef-dhup")


def test_read_loyers_csv_normalizes_insee_and_parses_decimals(
    spark, loyers_year_dir: Path
) -> None:
    path = find_csv(str(loyers_year_dir), CSV_SUFFIXES["loyer_median_apt"])
    rows = {r.code_insee: r for r in read_loyers_csv(spark, path).collect()}

    assert "44109" in rows
    assert rows["44109"].loypredm2 == pytest.approx(12.5)
    assert rows["44109"].nbobs_com == 500
    assert rows["44109"].r2_adj == pytest.approx(0.75)


def test_read_loyers_csv_pads_short_insee_code(spark, tmp_path: Path) -> None:
    csv_path = tmp_path / "pred-app-mef-dhup.csv"
    csv_path.write_text(
        '"id_zone";"INSEE_C";"LIBGEO";"EPCI";"DEP";"REG";"loypredm2";'
        '"lwr.IPm2";"upr.IPm2";"TYPPRED";"nbobs_com";"nbobs_mail";"R2_adj"\n'
        '"1";"1001";"Bourg";"200000000";"01";"84";9,25;7,0;11,0;"commune";42;42;0,60\n',
        encoding="utf-8",
    )
    row = read_loyers_csv(spark, str(csv_path)).collect()[0]
    assert row.code_insee == "01001"
    assert row.loypredm2 == pytest.approx(9.25)


def test_merge_indicators_joins_all_types(spark, loyers_year_dir: Path) -> None:
    merged = merge_indicators(spark, str(loyers_year_dir))
    rows = {r.code_insee: r for r in merged.collect()}

    assert set(rows) == {"44109", "35238", "99999"}
    nantes = rows["44109"]
    assert nantes.loyer_median_apt == pytest.approx(12.5)
    assert nantes.loyer_median_t1t2 == pytest.approx(11.0)
    assert nantes.loyer_median_t3plus == pytest.approx(14.0)
    assert nantes.loyer_median_maison == pytest.approx(9.5)
    assert nantes.nbobs_com == 500
    assert nantes.r2_adj == pytest.approx(0.75)


def _cities_df(spark, codes: list[tuple[int, str]]):
    return (
        spark.createDataFrame(codes, ["id", "code"])
        .withColumn("code", lpad(trim(col("code").cast("string")), 5, "0"))
    )


def test_join_maps_city_id_and_builds_rent_columns(spark, loyers_year_dir: Path) -> None:
    loyers = merge_indicators(spark, str(loyers_year_dir))
    cities = _cities_df(spark, [(1, "44109"), (2, "35238")])

    joined = loyers.join(cities, loyers.code_insee == cities.code, how="left")
    to_write = joined.filter(col("id").isNotNull()).select(
        lit(2024).cast("smallint").alias("annee"),
        col("loyer_median_apt"),
        col("loyer_median_t1t2"),
        col("loyer_median_t3plus"),
        col("loyer_median_maison"),
        col("nbobs_com").alias("nb_observations"),
        col("r2_adj").alias("r2"),
        col("id").alias("cityId"),
    )
    rows = sorted(to_write.collect(), key=lambda r: r.cityId)

    assert len(rows) == 2
    assert rows[0] == Row(
        annee=2024,
        loyer_median_apt=12.5,
        loyer_median_t1t2=11.0,
        loyer_median_t3plus=14.0,
        loyer_median_maison=9.5,
        nb_observations=500,
        r2=0.75,
        cityId=1,
    )


def test_log_unmatched_communes_warns(spark, loyers_year_dir: Path, caplog) -> None:
    loyers = merge_indicators(spark, str(loyers_year_dir))
    cities = _cities_df(spark, [(1, "44109")])

    joined = loyers.join(cities, loyers.code_insee == cities.code, how="left")
    unmatched = joined.filter(col("id").isNull())

    with caplog.at_level(logging.WARNING, logger="load_loyers"):
        log_unmatched_communes(unmatched)

    assert any("Communes non trouvées" in record.message for record in caplog.records)
    assert "99999" in caplog.text
    assert "35238" in caplog.text


def test_log_unmatched_communes_silent_when_none(spark, caplog) -> None:
    empty = spark.createDataFrame([], "code_insee string")
    with caplog.at_level(logging.WARNING, logger="load_loyers"):
        log_unmatched_communes(empty)
    assert caplog.records == []


def test_main_requires_year(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sys, "argv", ["load_loyers.py"])
    monkeypatch.delenv("LOYERS_YEAR", raising=False)
    assert main() == 1


def test_main_missing_year_dir(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(
        sys,
        "argv",
        ["load_loyers.py", "--year", "2099", "--data-dir", str(tmp_path / "carte_loyers")],
    )
    assert main() == 1
