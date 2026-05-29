import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MapBoundsInput } from './bounds.input';
import { Department } from './department.entity';
import { DepartmentType } from './department.object-type';

interface DepartmentRow {
  id: number;
  name: string;
  code: string;
  geometry: string;
  prixMedianM2: string | null;
}

@Injectable()
export class DepartmentService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
  ) {}

  async findInBounds(bounds: MapBoundsInput): Promise<DepartmentType[]> {
    const west = bounds.topLeftLng;
    const north = bounds.topLeftLat;
    const east = bounds.bottomRightLng;
    const south = bounds.bottomRightLat;

    const rows = await this.departmentRepository.query<DepartmentRow[]>(
      `
      SELECT
        d.id,
        d.name,
        d.code,
        ST_AsGeoJSON(d.geom)::text AS geometry,
        (
          SELECT ROUND(
            SUM(sd.prix_median_m2 * sd.nb_transactions)::numeric
            / NULLIF(SUM(sd.nb_transactions), 0),
            2
          )
          FROM stats_departments sd
          WHERE sd."departmentId" = d.id
        ) AS "prixMedianM2"
      FROM departments d
      WHERE ST_Intersects(
        d.geom,
        ST_MakeEnvelope($1, $2, $3, $4, 4326)
      )
      ORDER BY d.name
    `,
      [west, south, east, north],
    );

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      geometry: row.geometry,
      prixMedianM2: row.prixMedianM2 ? parseFloat(row.prixMedianM2) : null,
    }));
  }
}
