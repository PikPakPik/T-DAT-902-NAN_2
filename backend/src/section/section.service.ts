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
      WITH visible_sections AS (
        SELECT
          s.id,
          s.code,
          s.prefixe,
          s.geom,
          CONCAT(c.code, s.prefixe, LPAD(s.code, 2, '0')) AS name
        FROM sections s
        INNER JOIN cities c ON c.id = s."cityId"
        WHERE s.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
          AND ST_Intersects(s.geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))
      ),
      section_mutations AS (
        SELECT DISTINCT
          p."sectionId" AS section_id,
          m.id AS mutation_id,
          m.prix_m2
        FROM plots p
        INNER JOIN visible_sections vs ON vs.id = p."sectionId"
        INNER JOIN mutation_locals ml ON ml."plotId" = p.id
        INNER JOIN mutations m ON m.id = ml."mutationId"
        WHERE m.prix_m2 IS NOT NULL
          AND m.prix_m2 > 0
      ),
      section_prices AS (
        SELECT
          section_id,
          ROUND(AVG(prix_m2)::numeric, 2) AS prix_median_m2
        FROM section_mutations
        GROUP BY section_id
      )
      SELECT
        vs.id,
        vs.code,
        vs.prefixe,
        vs.name,
        ST_AsGeoJSON(vs.geom)::text AS geometry,
        sp.prix_median_m2 AS "prixMedianM2"
      FROM visible_sections vs
      LEFT JOIN section_prices sp ON sp.section_id = vs.id
      ORDER BY vs.name
    `,
      [west, south, east, north],
    );

    return rows.map((row) => this.#toType(row));
  }

  async findByCityId(cityId: number): Promise<SectionType[]> {
    const rows = await this.sectionRepository.query<SectionRow[]>(
      `
      WITH city_sections AS (
        SELECT
          s.id,
          s.code,
          s.prefixe,
          s.geom,
          CONCAT(c.code, s.prefixe, LPAD(s.code, 2, '0')) AS name
        FROM sections s
        INNER JOIN cities c ON c.id = s."cityId"
        WHERE s."cityId" = $1
      ),
      section_mutations AS (
        SELECT DISTINCT
          p."sectionId" AS section_id,
          m.id AS mutation_id,
          m.prix_m2
        FROM plots p
        INNER JOIN city_sections cs ON cs.id = p."sectionId"
        INNER JOIN mutation_locals ml ON ml."plotId" = p.id
        INNER JOIN mutations m ON m.id = ml."mutationId"
        WHERE m.prix_m2 IS NOT NULL
          AND m.prix_m2 > 0
      ),
      section_prices AS (
        SELECT
          section_id,
          ROUND(AVG(prix_m2)::numeric, 2) AS prix_median_m2
        FROM section_mutations
        GROUP BY section_id
      )
      SELECT
        cs.id,
        cs.code,
        cs.prefixe,
        cs.name,
        ST_AsGeoJSON(cs.geom)::text AS geometry,
        sp.prix_median_m2 AS "prixMedianM2"
      FROM city_sections cs
      LEFT JOIN section_prices sp ON sp.section_id = cs.id
      ORDER BY cs.name
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
