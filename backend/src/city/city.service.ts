import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MapBoundsInput } from '../department/bounds.input';
import { City } from './city.entity';
import { CityType } from './city.object-type';

interface CityRow {
  id: number;
  name: string;
  code: string;
  geometry: string;
  prixMedianM2: string | null;
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
        ) AS "prixMedianM2"
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
    }));
  }
}
