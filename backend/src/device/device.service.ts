import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from '../city/device.entity';
import { MapBoundsInput } from '../department/bounds.input';
import { DeviceType } from './device.object-type';

interface DeviceRow {
  id: number;
  nom: string;
  address: string | null;
  typequ: string | null;
  categorie: string | null;
  dom: string | null;
  sdom: string | null;
  libcom: string | null;
  longitude: string | number;
  latitude: string | number;
  cityId: number;
  distanceMeters: string | null;
}

const FAMILY_BY_DOM: Record<string, { family: string; label: string }> = {
  A: { family: 'services', label: 'Services publics' },
  B: { family: 'commerce', label: 'Commerces' },
  C: { family: 'education', label: 'Enseignement' },
  D: { family: 'health', label: 'Sante' },
  E: { family: 'transport', label: 'Transports' },
  F: { family: 'sport', label: 'Sports et loisirs' },
  G: { family: 'culture', label: 'Culture' },
};

@Injectable()
export class DeviceService {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
  ) {}

  async findInBounds(
    bounds: MapBoundsInput,
    limit = 2500,
  ): Promise<DeviceType[]> {
    const rows = await this.deviceRepository.query<DeviceRow[]>(
      `
      SELECT
        d.id,
        d.nom,
        d.address,
        d.typequ,
        d.categorie,
        d.dom,
        d.sdom,
        d.libcom,
        d.longitude,
        d.latitude,
        d."cityId",
        NULL AS "distanceMeters"
      FROM devices d
      WHERE d.longitude BETWEEN $1 AND $3
        AND d.latitude BETWEEN $2 AND $4
      ORDER BY d.id
      LIMIT $5
      `,
      [
        bounds.topLeftLng,
        bounds.bottomRightLat,
        bounds.bottomRightLng,
        bounds.topLeftLat,
        Math.max(1, Math.min(limit, 5000)),
      ],
    );

    return rows.map((row) => this.toType(row));
  }

  async findNearPlot(
    plotId: number,
    radiusMeters = 500,
    limit = 30,
  ): Promise<DeviceType[]> {
    const rows = await this.deviceRepository.query<DeviceRow[]>(
      `
      WITH plot_ref AS (
        SELECT
          s."cityId" AS city_id,
          p.geom,
          ST_Transform(p.geom, 2154) AS geom_l93,
          ST_Envelope(ST_Expand(p.geom, $2 / 111320.0)) AS search_bbox
        FROM plots p
        INNER JOIN sections s ON s.id = p."sectionId"
        WHERE p.id = $1
      ),
      candidates AS (
        SELECT
          d.*,
          ST_Distance(
            ST_Transform(ST_SetSRID(ST_MakePoint(d.longitude, d.latitude), 4326), 2154),
            pr.geom_l93
          ) AS distance_meters
        FROM devices d
        CROSS JOIN plot_ref pr
        WHERE d."cityId" = pr.city_id
          AND d.longitude BETWEEN ST_XMin(pr.search_bbox) AND ST_XMax(pr.search_bbox)
          AND d.latitude BETWEEN ST_YMin(pr.search_bbox) AND ST_YMax(pr.search_bbox)
          AND ST_DWithin(
          ST_Transform(ST_SetSRID(ST_MakePoint(d.longitude, d.latitude), 4326), 2154),
          pr.geom_l93,
          $2
        )
      )
      SELECT
        id,
        nom,
        address,
        typequ,
        categorie,
        dom,
        sdom,
        libcom,
        longitude,
        latitude,
        "cityId",
        ROUND(distance_meters::numeric, 0)::text AS "distanceMeters"
      FROM candidates
      ORDER BY distance_meters ASC, nom ASC
      LIMIT $3
      `,
      [plotId, Math.max(50, Math.min(radiusMeters, 3000)), Math.max(1, Math.min(limit, 100))],
    );

    return rows.map((row) => this.toType(row));
  }

  private toType(row: DeviceRow): DeviceType {
    const dom = (row.dom ?? '').trim().toUpperCase();
    const family = FAMILY_BY_DOM[dom] ?? {
      family: 'other',
      label: 'Equipements',
    };

    return {
      id: row.id,
      nom: row.nom,
      address: row.address ?? '',
      typequ: row.typequ ?? '',
      categorie: row.categorie ?? '',
      dom,
      sdom: row.sdom ?? '',
      libcom: row.libcom ?? '',
      family: family.family,
      familyLabel: family.label,
      longitude: Number(row.longitude),
      latitude: Number(row.latitude),
      cityId: row.cityId,
      distanceMeters:
        row.distanceMeters != null ? Number(row.distanceMeters) : null,
    };
  }
}
