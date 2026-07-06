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
  densite: string | null;
  criminaliteScore: string | null;
  loyerMedianApt: string | null;
  indiceAtmoMedian: string | null;
}

@Injectable()
export class RegionService {
  constructor(
    @InjectRepository(Region)
    private readonly regionRepository: Repository<Region>,
  ) {}

  async findAll(): Promise<RegionType[]> {
    const rows = await this.regionRepository.query<RegionRow[]>(`
      WITH latest_populate AS (
        SELECT DISTINCT ON (pc."cityId") pc."cityId", pc.population
        FROM populate_cities pc
        ORDER BY pc."cityId", pc.annee DESC
      ),
      latest_crime AS (
        SELECT DISTINCT ON (cr."cityId") cr."cityId",
          (
            cr.taux_cambriolages
            + cr.taux_vols_armes
            + cr.taux_vols_sans_viol
            + cr.taux_violences_phys
          ) AS score
        FROM crimes_cities cr
        ORDER BY cr."cityId", cr.annee DESC
      ),
      latest_rent AS (
        SELECT DISTINCT ON (r."cityId") r."cityId", r.loyer_median_apt
        FROM rents r
        ORDER BY r."cityId", r.annee DESC
      ),
      latest_air AS (
        SELECT DISTINCT ON (aq."cityId") aq."cityId", aq.indice_atmo_median
        FROM air_quality aq
        ORDER BY aq."cityId", aq.annee DESC
      )
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
        ) AS "prixMedianM2",
        (
          SELECT ROUND(
            AVG(lp.population / NULLIF(ST_Area(ST_Transform(c.geom, 2154)) / 1000000, 0))::numeric,
            0
          )
          FROM cities c
          INNER JOIN departments d ON d.id = c."departmentId"
          JOIN latest_populate lp ON lp."cityId" = c.id
          WHERE d."regionId" = r.id
        ) AS "densite",
        (
          SELECT ROUND(AVG(lc.score)::numeric, 2)
          FROM cities c
          INNER JOIN departments d ON d.id = c."departmentId"
          JOIN latest_crime lc ON lc."cityId" = c.id
          WHERE d."regionId" = r.id
        ) AS "criminaliteScore",
        (
          SELECT ROUND(AVG(lr.loyer_median_apt)::numeric, 2)
          FROM cities c
          INNER JOIN departments d ON d.id = c."departmentId"
          JOIN latest_rent lr ON lr."cityId" = c.id
          WHERE d."regionId" = r.id
        ) AS "loyerMedianApt",
        (
          SELECT ROUND(AVG(la.indice_atmo_median)::numeric, 2)
          FROM cities c
          INNER JOIN departments d ON d.id = c."departmentId"
          JOIN latest_air la ON la."cityId" = c.id
          WHERE d."regionId" = r.id
        ) AS "indiceAtmoMedian"
      FROM regions r
      ORDER BY r.name
    `);

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
}
