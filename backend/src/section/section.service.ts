import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MapBoundsInput } from '../department/bounds.input';
import { Section } from './section.entity';
import { SectionType } from './section.object-type';

interface SectionRow {
  id: number;
  code: string;
  prefixe: string;
  name: string;
  geometry: string;
  prixMedianM2: string | null;
}

@Injectable()
export class SectionService {
  constructor(
    @InjectRepository(Section)
    private readonly sectionRepository: Repository<Section>,
  ) {}

  async findInBounds(bounds: MapBoundsInput): Promise<SectionType[]> {
    const west = bounds.topLeftLng;
    const north = bounds.topLeftLat;
    const east = bounds.bottomRightLng;
    const south = bounds.bottomRightLat;

    const rows = await this.sectionRepository.query<SectionRow[]>(
      `
      SELECT
        s.id,
        s.code,
        s.prefixe,
        CONCAT(c.code, s.prefixe, LPAD(s.code, 2, '0')) AS name,
        ST_AsGeoJSON(s.geom)::text AS geometry,
        (
          SELECT ROUND(
            SUM(sc.prix_median_m2 * sc.nb_transactions)::numeric
            / NULLIF(SUM(sc.nb_transactions), 0),
            2
          )
          FROM stats_cities sc
          WHERE sc."cityId" = s."cityId"
        ) AS "prixMedianM2"
      FROM sections s
      INNER JOIN cities c ON c.id = s."cityId"
      WHERE s.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
        AND ST_Intersects(s.geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))
      ORDER BY name
    `,
      [west, south, east, north],
    );

    return rows.map((row) => this.#toType(row));
  }

  async findByCityId(cityId: number): Promise<SectionType[]> {
    const rows = await this.sectionRepository.query<SectionRow[]>(
      `
      SELECT
        s.id,
        s.code,
        s.prefixe,
        CONCAT(c.code, s.prefixe, LPAD(s.code, 2, '0')) AS name,
        ST_AsGeoJSON(s.geom)::text AS geometry,
        (
          SELECT ROUND(
            SUM(sc.prix_median_m2 * sc.nb_transactions)::numeric
            / NULLIF(SUM(sc.nb_transactions), 0),
            2
          )
          FROM stats_cities sc
          WHERE sc."cityId" = s."cityId"
        ) AS "prixMedianM2"
      FROM sections s
      INNER JOIN cities c ON c.id = s."cityId"
      WHERE s."cityId" = $1
      ORDER BY name
    `,
      [cityId],
    );

    return rows.map((row) => this.#toType(row));
  }

  #toType(row: SectionRow): SectionType {
    return {
      id: row.id,
      code: row.code,
      prefixe: row.prefixe,
      name: row.name,
      geometry: row.geometry,
      prixMedianM2: row.prixMedianM2 != null ? Number(row.prixMedianM2) : null,
    };
  }
}
