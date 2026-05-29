import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Region } from './region.entity';
import { RegionType } from './region.object-type';

interface RegionRow {
  id: number;
  name: string;
  code: string;
  geometry: string;
  prixMedianM2: string | null;
}

@Injectable()
export class RegionService {
  constructor(
    @InjectRepository(Region)
    private readonly regionRepository: Repository<Region>,
  ) {}

  async findAll(): Promise<RegionType[]> {
    const rows = await this.regionRepository.query<RegionRow[]>(`
      SELECT
        r.id,
        r.name,
        r.code,
        ST_AsGeoJSON(r.geom)::text AS geometry,
        (
          SELECT ROUND(
            SUM(sd.prix_median_m2 * sd.nb_transactions)::numeric
            / NULLIF(SUM(sd.nb_transactions), 0),
            2
          )
          FROM departments d
          INNER JOIN stats_departments sd ON sd."departmentId" = d.id
          WHERE d."regionId" = r.id
        ) AS "prixMedianM2"
      FROM regions r
      ORDER BY r.name
    `);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      geometry: row.geometry,
      prixMedianM2:
        row.prixMedianM2 != null ? Number(row.prixMedianM2) : null,
    }));
  }
}
