from __future__ import annotations

import pytest

from silver.dpe_load import build_silver, normalized_name


def test_normalized_name_handles_accents_and_symbols() -> None:
    assert normalized_name("Étiquette DPE / énergie") == "etiquette_dpe_energie"
    assert normalized_name("Code INSEE BAN") == "code_insee_ban"


def test_build_silver_keeps_one_row_per_valid_dpe(spark) -> None:
    bronze = spark.createDataFrame(
        [
            (
                "DPE-1",
                2024,
                "A",
                "B",
                75.4,
                "Maison",
                1998,
                "44109",
                356478.0,
                6688238.0,
                "dpe03existant.csv",
            ),
            (
                "DPE-1",
                2024,
                "A",
                "B",
                75.4,
                "Maison",
                1998,
                "44109",
                356478.0,
                6688238.0,
                "dpe03existant.csv",
            ),
            (
                "DPE-2",
                2023,
                "X",
                "C",
                120.0,
                "Tertiaire",
                0,
                "35238",
                351669.0,
                6788307.0,
                "dpe01tertiaire.csv",
            ),
        ],
        [
            "dpe_id",
            "annee",
            "classe_energie",
            "classe_ges",
            "surface_habitable",
            "type_batiment",
            "annee_construction",
            "code_insee",
            "x_l93",
            "y_l93",
            "source_file",
        ],
    )

    silver, rejects = build_silver(bronze)

    rows = silver.collect()
    assert len(rows) == 1
    assert rows[0].dpe_id == "DPE-1"
    assert rows[0].surface_habitable == pytest.approx(75.4)

    rejected = rejects.collect()
    assert len(rejected) == 1
    assert rejected[0].dpe_id == "DPE-2"
    assert rejected[0].motif == "etiquette_dpe invalide"
