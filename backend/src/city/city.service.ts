import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MapBoundsInput } from '../department/bounds.input';
import { City } from './city.entity';
import { CityType, PopulationStatsType } from './city.object-type';

interface CityRow {
  id: number;
  name: string;
  code: string;
  geometry: string;
  prixMedianM2: string | null;
  densite: string | null;
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
        ) AS "densite"
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
    }));
  }

  async findLatestPopulationByCode(
    code: string,
  ): Promise<PopulationStatsType | null> {
    const rows = await this.cityRepository.query<
      { population: string; annee: string; superficie: string; densite: string }[]
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
}
