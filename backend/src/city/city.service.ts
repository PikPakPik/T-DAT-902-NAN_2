import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MapBoundsInput } from '../department/bounds.input';
import { City } from './city.entity';
import {
  AirQualityStatsType,
  CityType,
  CrimeStatsType,
  PopulationStatsType,
  RentStatsType,
} from './city.object-type';

interface CityRow {
  id: number;
  name: string;
  code: string;
  geometry: string;
  prixMedianM2: string | null;
  densite: string | null;
  criminaliteScore: string | null;
  loyerMedianApt: string | null;
  indiceAtmoMedian: string | null;
}

@Injectable()
export class CityService {
  constructor(
    @InjectRepository(City)
    private readonly cityRepository: Repository<City>,
  ) {}

  async findInBounds(bounds: MapBoundsInput): Promise<CityType[]> {
    const west = bounds.topLeftLng;
    const north = bounds.topLeftLat;
    const east = bounds.bottomRightLng;
    const south = bounds.bottomRightLat;

    const rows = await this.cityRepository.query<CityRow[]>(
      `
      SELECT
        c.id,
        c.name,
        c.code,
        ST_AsGeoJSON(c.geom)::text AS geometry,
        (
          SELECT ROUND(
            SUM(sc.prix_median_m2 * sc.nb_transactions)::numeric
            / NULLIF(SUM(sc.nb_transactions), 0),
            2
          )
          FROM stats_cities sc
          WHERE sc."cityId" = c.id
        ) AS "prixMedianM2",
        (
          SELECT ROUND(
            (pc.population / NULLIF(ST_Area(ST_Transform(c.geom, 2154)) / 1000000, 0))::numeric,
            0
          )
          FROM populate_cities pc
          WHERE pc."cityId" = c.id
          ORDER BY pc.annee DESC
          LIMIT 1
        ) AS "densite",
        (
          SELECT ROUND(
            (
              cr.taux_cambriolages
              + cr.taux_vols_armes
              + cr.taux_vols_sans_viol
              + cr.taux_violences_phys
            )::numeric,
            2
          )
          FROM crimes_cities cr
          WHERE cr."cityId" = c.id
          ORDER BY cr.annee DESC
          LIMIT 1
        ) AS "criminaliteScore",
        (
          SELECT r.loyer_median_apt
          FROM rents r
          WHERE r."cityId" = c.id
          ORDER BY r.annee DESC
          LIMIT 1
        ) AS "loyerMedianApt",
        (
          SELECT aq.indice_atmo_median
          FROM air_quality aq
          WHERE aq."cityId" = c.id
          ORDER BY aq.annee DESC
          LIMIT 1
        ) AS "indiceAtmoMedian"
      FROM cities c
      WHERE ST_Intersects(
        c.geom,
        ST_MakeEnvelope($1, $2, $3, $4, 4326)
      )
      ORDER BY c.name
    `,
      [west, south, east, north],
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      geometry: row.geometry,
      prixMedianM2: row.prixMedianM2 != null ? Number(row.prixMedianM2) : null,
      densite: row.densite != null ? Number(row.densite) : null,
      criminaliteScore:
        row.criminaliteScore != null ? Number(row.criminaliteScore) : null,
      loyerMedianApt:
        row.loyerMedianApt != null ? Number(row.loyerMedianApt) : null,
      indiceAtmoMedian:
        row.indiceAtmoMedian != null ? Number(row.indiceAtmoMedian) : null,
    }));
  }

  async findLatestPopulationByCode(
    code: string,
  ): Promise<PopulationStatsType | null> {
    const rows = await this.cityRepository.query<
      {
        population: string;
        annee: string;
        superficie: string;
        densite: string;
      }[]
    >(
      `
      SELECT
        pc.population,
        pc.annee,
        ROUND((ST_Area(ST_Transform(c.geom, 2154)) / 1000000)::numeric, 2) AS superficie,
        ROUND((pc.population / NULLIF(ST_Area(ST_Transform(c.geom, 2154)) / 1000000, 0))::numeric, 0) AS densite
      FROM populate_cities pc
      JOIN cities c ON c.id = pc."cityId"
      WHERE c.code = $1
      ORDER BY pc.annee DESC
      LIMIT 1
      `,
      [code],
    );

    if (!rows.length) return null;
    return {
      population: Number(rows[0].population),
      annee: Number(rows[0].annee),
      superficie: Number(rows[0].superficie),
      densite: Number(rows[0].densite),
      evolutionPct: null,
    };
  }

  async findPopulationHistoryByCode(
    code: string,
  ): Promise<PopulationStatsType[]> {
    const rows = await this.cityRepository.query<
      { population: string; annee: string; evolution_pct: string | null }[]
    >(
      `
      SELECT
        pc.population,
        pc.annee,
        ROUND(
          (pc.population - LAG(pc.population) OVER (ORDER BY pc.annee))::numeric
          / NULLIF(LAG(pc.population) OVER (ORDER BY pc.annee), 0) * 100,
          2
        ) AS evolution_pct
      FROM populate_cities pc
      JOIN cities c ON c.id = pc."cityId"
      WHERE c.code = $1
      ORDER BY pc.annee ASC
      `,
      [code],
    );

    return rows.map((r) => ({
      population: Number(r.population),
      annee: Number(r.annee),
      superficie: null,
      densite: null,
      evolutionPct: r.evolution_pct != null ? Number(r.evolution_pct) : null,
    }));
  }

  async findLatestCrimeByCode(code: string): Promise<CrimeStatsType | null> {
    const rows = await this.cityRepository.query<
      {
        annee: string;
        taux_cambriolages: string;
        taux_vols_armes: string;
        taux_vols_sans_viol: string;
        taux_violences_phys: string;
        score: string;
        evolution_pct: string | null;
      }[]
    >(
      `
      SELECT
        cr.annee,
        cr.taux_cambriolages,
        cr.taux_vols_armes,
        cr.taux_vols_sans_viol,
        cr.taux_violences_phys,
        ROUND(
          (
            cr.taux_cambriolages
            + cr.taux_vols_armes
            + cr.taux_vols_sans_viol
            + cr.taux_violences_phys
          )::numeric,
          2
        ) AS score,
        NULL AS evolution_pct
      FROM crimes_cities cr
      JOIN cities c ON c.id = cr."cityId"
      WHERE c.code = $1
      ORDER BY cr.annee DESC
      LIMIT 1
      `,
      [code],
    );

    if (!rows.length) return null;

    const row = rows[0];
    return {
      annee: Number(row.annee),
      tauxCambriolages: Number(row.taux_cambriolages),
      tauxVolsArmes: Number(row.taux_vols_armes),
      tauxVolsSansViol: Number(row.taux_vols_sans_viol),
      tauxViolencesPhys: Number(row.taux_violences_phys),
      score: Number(row.score),
      evolutionPct: null,
    };
  }

  async findCrimeHistoryByCode(code: string): Promise<CrimeStatsType[]> {
    const rows = await this.cityRepository.query<
      {
        annee: string;
        taux_cambriolages: string;
        taux_vols_armes: string;
        taux_vols_sans_viol: string;
        taux_violences_phys: string;
        score: string;
        evolution_pct: string | null;
      }[]
    >(
      `
      WITH yearly_crimes AS (
        SELECT
          cr.annee,
          cr.taux_cambriolages,
          cr.taux_vols_armes,
          cr.taux_vols_sans_viol,
          cr.taux_violences_phys,
          ROUND(
            (
              cr.taux_cambriolages
              + cr.taux_vols_armes
              + cr.taux_vols_sans_viol
              + cr.taux_violences_phys
            )::numeric,
            2
          ) AS score
        FROM crimes_cities cr
        JOIN cities c ON c.id = cr."cityId"
        WHERE c.code = $1
      )
      SELECT
        yc.*,
        ROUND(
          (yc.score - LAG(yc.score) OVER (ORDER BY yc.annee))::numeric
          / NULLIF(LAG(yc.score) OVER (ORDER BY yc.annee), 0) * 100,
          2
        ) AS evolution_pct
      FROM yearly_crimes yc
      ORDER BY yc.annee ASC
      `,
      [code],
    );

    return rows.map((row) => ({
      annee: Number(row.annee),
      tauxCambriolages: Number(row.taux_cambriolages),
      tauxVolsArmes: Number(row.taux_vols_armes),
      tauxVolsSansViol: Number(row.taux_vols_sans_viol),
      tauxViolencesPhys: Number(row.taux_violences_phys),
      score: Number(row.score),
      evolutionPct: row.evolution_pct != null ? Number(row.evolution_pct) : null,
    }));
  }

  async findLatestRentByCode(code: string): Promise<RentStatsType | null> {
    const rows = await this.cityRepository.query<
      {
        annee: string;
        loyer_median_apt: string | null;
        loyer_median_t1t2: string | null;
        loyer_median_t3plus: string | null;
        loyer_median_maison: string | null;
        nb_observations: string | null;
        evolution_pct: string | null;
      }[]
    >(
      `
      SELECT
        r.annee,
        r.loyer_median_apt,
        r.loyer_median_t1t2,
        r.loyer_median_t3plus,
        r.loyer_median_maison,
        r.nb_observations,
        NULL AS evolution_pct
      FROM rents r
      JOIN cities c ON c.id = r."cityId"
      WHERE c.code = $1
      ORDER BY r.annee DESC
      LIMIT 1
      `,
      [code],
    );

    if (!rows.length) return null;
    return this.mapRentRow(rows[0]);
  }

  async findRentHistoryByCode(code: string): Promise<RentStatsType[]> {
    const rows = await this.cityRepository.query<
      {
        annee: string;
        loyer_median_apt: string | null;
        loyer_median_t1t2: string | null;
        loyer_median_t3plus: string | null;
        loyer_median_maison: string | null;
        nb_observations: string | null;
        evolution_pct: string | null;
      }[]
    >(
      `
      SELECT
        r.annee,
        r.loyer_median_apt,
        r.loyer_median_t1t2,
        r.loyer_median_t3plus,
        r.loyer_median_maison,
        r.nb_observations,
        ROUND(
          (r.loyer_median_apt - LAG(r.loyer_median_apt) OVER (ORDER BY r.annee))::numeric
          / NULLIF(LAG(r.loyer_median_apt) OVER (ORDER BY r.annee), 0) * 100,
          2
        ) AS evolution_pct
      FROM rents r
      JOIN cities c ON c.id = r."cityId"
      WHERE c.code = $1
      ORDER BY r.annee ASC
      `,
      [code],
    );

    return rows.map((row) => this.mapRentRow(row));
  }

  async findLatestAirQualityByCode(
    code: string,
  ): Promise<AirQualityStatsType | null> {
    const rows = await this.cityRepository.query<
      {
        annee: string;
        indice_atmo_median: string;
        pm25_median: string;
        pm10_median: string;
        no2_median: string;
        o3_median: string;
        nb_jours_bon: string;
        nb_jours_moyen: string;
        nb_jours_mauvais: string;
        evolution_pct: string | null;
      }[]
    >(
      `
      SELECT
        aq.annee,
        aq.indice_atmo_median,
        aq.pm25_median,
        aq.pm10_median,
        aq.no2_median,
        aq.o3_median,
        aq.nb_jours_bon,
        aq.nb_jours_moyen,
        aq.nb_jours_mauvais,
        NULL AS evolution_pct
      FROM air_quality aq
      JOIN cities c ON c.id = aq."cityId"
      WHERE c.code = $1
      ORDER BY aq.annee DESC
      LIMIT 1
      `,
      [code],
    );

    if (!rows.length) return null;
    return this.mapAirQualityRow(rows[0]);
  }

  async findAirQualityHistoryByCode(
    code: string,
  ): Promise<AirQualityStatsType[]> {
    const rows = await this.cityRepository.query<
      {
        annee: string;
        indice_atmo_median: string;
        pm25_median: string;
        pm10_median: string;
        no2_median: string;
        o3_median: string;
        nb_jours_bon: string;
        nb_jours_moyen: string;
        nb_jours_mauvais: string;
        evolution_pct: string | null;
      }[]
    >(
      `
      SELECT
        aq.annee,
        aq.indice_atmo_median,
        aq.pm25_median,
        aq.pm10_median,
        aq.no2_median,
        aq.o3_median,
        aq.nb_jours_bon,
        aq.nb_jours_moyen,
        aq.nb_jours_mauvais,
        ROUND(
          (aq.indice_atmo_median - LAG(aq.indice_atmo_median) OVER (ORDER BY aq.annee))::numeric
          / NULLIF(LAG(aq.indice_atmo_median) OVER (ORDER BY aq.annee), 0) * 100,
          2
        ) AS evolution_pct
      FROM air_quality aq
      JOIN cities c ON c.id = aq."cityId"
      WHERE c.code = $1
      ORDER BY aq.annee ASC
      `,
      [code],
    );

    return rows.map((row) => this.mapAirQualityRow(row));
  }

  private mapRentRow(row: {
    annee: string;
    loyer_median_apt: string | null;
    loyer_median_t1t2: string | null;
    loyer_median_t3plus: string | null;
    loyer_median_maison: string | null;
    nb_observations: string | null;
    evolution_pct: string | null;
  }): RentStatsType {
    return {
      annee: Number(row.annee),
      loyerMedianApt:
        row.loyer_median_apt != null ? Number(row.loyer_median_apt) : null,
      loyerMedianT1T2:
        row.loyer_median_t1t2 != null ? Number(row.loyer_median_t1t2) : null,
      loyerMedianT3Plus:
        row.loyer_median_t3plus != null ? Number(row.loyer_median_t3plus) : null,
      loyerMedianMaison:
        row.loyer_median_maison != null ? Number(row.loyer_median_maison) : null,
      nbObservations:
        row.nb_observations != null ? Number(row.nb_observations) : null,
      evolutionPct: row.evolution_pct != null ? Number(row.evolution_pct) : null,
    };
  }

  private mapAirQualityRow(row: {
    annee: string;
    indice_atmo_median: string;
    pm25_median: string;
    pm10_median: string;
    no2_median: string;
    o3_median: string;
    nb_jours_bon: string;
    nb_jours_moyen: string;
    nb_jours_mauvais: string;
    evolution_pct: string | null;
  }): AirQualityStatsType {
    return {
      annee: Number(row.annee),
      indiceAtmoMedian: Number(row.indice_atmo_median),
      pm25Median: Number(row.pm25_median),
      pm10Median: Number(row.pm10_median),
      no2Median: Number(row.no2_median),
      o3Median: Number(row.o3_median),
      nbJoursBon: Number(row.nb_jours_bon),
      nbJoursMoyen: Number(row.nb_jours_moyen),
      nbJoursMauvais: Number(row.nb_jours_mauvais),
      evolutionPct: row.evolution_pct != null ? Number(row.evolution_pct) : null,
    };
  }
}
