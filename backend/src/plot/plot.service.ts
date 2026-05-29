import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MapBoundsInput } from '../department/bounds.input';
import { Plot } from './plot.entity';
import { PlotType } from './plot.object-type';

interface PlotRow {
  id: number;
  number: string;
  name: string;
  geometry: string;
  prixMedianM2: string | null;
}

@Injectable()
export class PlotService {
  constructor(
    @InjectRepository(Plot)
    private readonly plotRepository: Repository<Plot>,
  ) {}

  async findInBounds(bounds: MapBoundsInput): Promise<PlotType[]> {
    const west = bounds.topLeftLng;
    const north = bounds.topLeftLat;
    const east = bounds.bottomRightLng;
    const south = bounds.bottomRightLat;

    const rows = await this.plotRepository.query<PlotRow[]>(
      `
      SELECT
        p.id,
        p.number,
        CONCAT(
          c.code,
          s.prefixe,
          LPAD(s.code, 2, '0'),
          LPAD(p.number, 4, '0')
        ) AS name,
        ST_AsGeoJSON(p.geom)::text AS geometry,
        NULL::numeric AS "prixMedianM2"
      FROM plots p
      INNER JOIN sections s ON s.id = p."sectionId"
      INNER JOIN cities c ON c.id = s."cityId"
      WHERE ST_Intersects(
        p.geom,
        ST_MakeEnvelope($1, $2, $3, $4, 4326)
      )
      ORDER BY name
    `,
      [west, south, east, north],
    );

    return rows.map((row) => this.#toType(row));
  }

  async findBySectionId(sectionId: number): Promise<PlotType[]> {
    const rows = await this.plotRepository.query<PlotRow[]>(
      `
      SELECT
        p.id,
        p.number,
        CONCAT(
          c.code,
          s.prefixe,
          LPAD(s.code, 2, '0'),
          LPAD(p.number, 4, '0')
        ) AS name,
        ST_AsGeoJSON(p.geom)::text AS geometry,
        NULL::numeric AS "prixMedianM2"
      FROM plots p
      INNER JOIN sections s ON s.id = p."sectionId"
      INNER JOIN cities c ON c.id = s."cityId"
      WHERE p."sectionId" = $1
      ORDER BY name
    `,
      [sectionId],
    );

    return rows.map((row) => this.#toType(row));
  }

  #toType(row: PlotRow): PlotType {
    return {
      id: row.id,
      number: row.number,
      name: row.name,
      geometry: row.geometry,
      prixMedianM2:
        row.prixMedianM2 != null ? Number(row.prixMedianM2) : null,
    };
  }
}
