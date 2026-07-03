import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MapBoundsInput } from '../department/bounds.input';
import { Plot } from './plot.entity';
import { PlotSaleLotType, PlotSaleType, PlotType } from './plot.object-type';

interface PlotRow {
  id: number;
  number: string;
  name: string;
  geometry: string;
  prixMedianM2: string | null;
  prixMoyenM2: string | null;
  surfaceM2: string | null;
  surfaceDisponibleM2: string | null;
  hasSale: boolean;
  maxSaleAmount: string | null;
}

interface PlotSaleRow {
  id: number;
  dateMutation: string;
  natureMutation: string;
  valeurFonciere: string;
  prixM2: string | null;
}

interface PlotSaleLotRow {
  id: number;
  mutationId: number;
  typeLocal: string | null;
  surfaceReelleBati: string | null;
  nombrePiecesPrincipales: number | null;
  surfaceTerrain: string | null;
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
      WITH visible_plots AS (
        SELECT
          p.id,
          p.number,
          p.geom,
          p.capacity,
          CONCAT(
            c.code,
            s.prefixe,
            LPAD(s.code, 2, '0'),
            LPAD(p.number, 4, '0')
          ) AS name
        FROM plots p
        INNER JOIN sections s ON s.id = p."sectionId"
        INNER JOIN cities c ON c.id = s."cityId"
        WHERE p.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
          AND ST_Intersects(p.geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))
      ),
      enriched_plots AS (
        SELECT
          vp.*,
          COALESCE(
            NULLIF(REPLACE(REGEXP_REPLACE(COALESCE(vp.capacity, ''), '[^0-9,.]', '', 'g'), ',', '.'), '')::numeric,
            ROUND(ST_Area(ST_Transform(vp.geom, 2154))::numeric, 2)
          ) AS surface_m2
        FROM visible_plots vp
      )
      SELECT
        ep.id,
        ep.number,
        ep.name,
        ST_AsGeoJSON(ep.geom)::text AS geometry,
        sales.prix_moyen_m2 AS "prixMedianM2",
        sales.prix_moyen_m2 AS "prixMoyenM2",
        ep.surface_m2 AS "surfaceM2",
        CASE
          WHEN ep.surface_m2 IS NULL THEN NULL
          ELSE GREATEST(ep.surface_m2 - COALESCE(sales.max_surface_habitable, 0), 0)
        END AS "surfaceDisponibleM2",
        COALESCE(sales.sale_count, 0) > 0 AS "hasSale",
        sales.max_sale_amount AS "maxSaleAmount"
      FROM enriched_plots ep
      LEFT JOIN LATERAL (
        SELECT
          COUNT(DISTINCT m.id) AS sale_count,
          MAX(m.valeur_fonciere) AS max_sale_amount,
          ROUND(AVG(NULLIF(m.prix_m2, 0))::numeric, 2) AS prix_moyen_m2,
          MAX(m.surface_habitable) AS max_surface_habitable
        FROM mutation_locals ml
        INNER JOIN mutations m ON m.id = ml."mutationId"
        WHERE ml."plotId" = ep.id
      ) sales ON TRUE
      ORDER BY ep.name
    `,
      [west, south, east, north],
    );

    return rows.map((row) => this.#toType(row));
  }

  async findBySectionId(sectionId: number): Promise<PlotType[]> {
    const rows = await this.plotRepository.query<PlotRow[]>(
      `
      WITH section_plots AS (
        SELECT
          p.id,
          p.number,
          p.geom,
          p.capacity,
          CONCAT(
            c.code,
            s.prefixe,
            LPAD(s.code, 2, '0'),
            LPAD(p.number, 4, '0')
          ) AS name
        FROM plots p
        INNER JOIN sections s ON s.id = p."sectionId"
        INNER JOIN cities c ON c.id = s."cityId"
        WHERE p."sectionId" = $1
      ),
      enriched_plots AS (
        SELECT
          sp.*,
          COALESCE(
            NULLIF(REPLACE(REGEXP_REPLACE(COALESCE(sp.capacity, ''), '[^0-9,.]', '', 'g'), ',', '.'), '')::numeric,
            ROUND(ST_Area(ST_Transform(sp.geom, 2154))::numeric, 2)
          ) AS surface_m2
        FROM section_plots sp
      )
      SELECT
        ep.id,
        ep.number,
        ep.name,
        ST_AsGeoJSON(ep.geom)::text AS geometry,
        sales.prix_moyen_m2 AS "prixMedianM2",
        sales.prix_moyen_m2 AS "prixMoyenM2",
        ep.surface_m2 AS "surfaceM2",
        CASE
          WHEN ep.surface_m2 IS NULL THEN NULL
          ELSE GREATEST(ep.surface_m2 - COALESCE(sales.max_surface_habitable, 0), 0)
        END AS "surfaceDisponibleM2",
        COALESCE(sales.sale_count, 0) > 0 AS "hasSale",
        sales.max_sale_amount AS "maxSaleAmount"
      FROM enriched_plots ep
      LEFT JOIN LATERAL (
        SELECT
          COUNT(DISTINCT m.id) AS sale_count,
          MAX(m.valeur_fonciere) AS max_sale_amount,
          ROUND(AVG(NULLIF(m.prix_m2, 0))::numeric, 2) AS prix_moyen_m2,
          MAX(m.surface_habitable) AS max_surface_habitable
        FROM mutation_locals ml
        INNER JOIN mutations m ON m.id = ml."mutationId"
        WHERE ml."plotId" = ep.id
      ) sales ON TRUE
      ORDER BY ep.name
    `,
      [sectionId],
    );

    return rows.map((row) => this.#toType(row));
  }

  async findDetailsById(plotId: number): Promise<PlotType | null> {
    const rows = await this.plotRepository.query<PlotRow[]>(
      `
      WITH base_plot AS (
        SELECT
          p.id,
          p.number,
          p.geom,
          p.capacity,
          CONCAT(
            c.code,
            s.prefixe,
            LPAD(s.code, 2, '0'),
            LPAD(p.number, 4, '0')
          ) AS name
        FROM plots p
        INNER JOIN sections s ON s.id = p."sectionId"
        INNER JOIN cities c ON c.id = s."cityId"
        WHERE p.id = $1
      ),
      enriched_plot AS (
        SELECT
          bp.*,
          COALESCE(
            NULLIF(REPLACE(REGEXP_REPLACE(COALESCE(bp.capacity, ''), '[^0-9,.]', '', 'g'), ',', '.'), '')::numeric,
            ROUND(ST_Area(ST_Transform(bp.geom, 2154))::numeric, 2)
          ) AS surface_m2
        FROM base_plot bp
      )
      SELECT
        ep.id,
        ep.number,
        ep.name,
        ST_AsGeoJSON(ep.geom)::text AS geometry,
        sales.prix_moyen_m2 AS "prixMedianM2",
        sales.prix_moyen_m2 AS "prixMoyenM2",
        ep.surface_m2 AS "surfaceM2",
        CASE
          WHEN ep.surface_m2 IS NULL THEN NULL
          ELSE GREATEST(ep.surface_m2 - COALESCE(sales.max_surface_habitable, 0), 0)
        END AS "surfaceDisponibleM2",
        COALESCE(sales.sale_count, 0) > 0 AS "hasSale",
        sales.max_sale_amount AS "maxSaleAmount"
      FROM enriched_plot ep
      LEFT JOIN LATERAL (
        SELECT
          COUNT(DISTINCT m.id) AS sale_count,
          MAX(m.valeur_fonciere) AS max_sale_amount,
          ROUND(AVG(NULLIF(m.prix_m2, 0))::numeric, 2) AS prix_moyen_m2,
          MAX(m.surface_habitable) AS max_surface_habitable
        FROM mutation_locals ml
        INNER JOIN mutations m ON m.id = ml."mutationId"
        WHERE ml."plotId" = ep.id
      ) sales ON TRUE
    `,
      [plotId],
    );

    const plot = rows[0];
    if (!plot) return null;

    const salesRows = await this.plotRepository.query<PlotSaleRow[]>(
      `
      SELECT
        m.id,
        m.date_mutation::text AS "dateMutation",
        m.nature_mutation AS "natureMutation",
        m.valeur_fonciere AS "valeurFonciere",
        m.prix_m2 AS "prixM2"
      FROM mutations m
      INNER JOIN mutation_locals ml ON ml."mutationId" = m.id
      WHERE ml."plotId" = $1
      GROUP BY
        m.id,
        m.date_mutation,
        m.nature_mutation,
        m.valeur_fonciere,
        m.prix_m2
      ORDER BY m.valeur_fonciere DESC NULLS LAST, m.date_mutation DESC
    `,
      [plotId],
    );

    if (!salesRows.length) {
      return this.#toType(plot);
    }

    const saleIds = salesRows.map((sale) => sale.id);
    const lotsRows = await this.plotRepository.query<PlotSaleLotRow[]>(
      `
      SELECT
        ml.id,
        ml."mutationId" AS "mutationId",
        ml.type_local AS "typeLocal",
        ml.surface_reelle_bati AS "surfaceReelleBati",
        ml.nombre_pieces_principales AS "nombrePiecesPrincipales",
        ml.surface_terrain AS "surfaceTerrain"
      FROM mutation_locals ml
      WHERE ml."plotId" = $1
        AND ml."mutationId" = ANY($2::int[])
      ORDER BY ml.id
    `,
      [plotId, saleIds],
    );

    const lotsBySale = new Map<number, PlotSaleLotType[]>();
    for (const lot of lotsRows) {
      const saleLots = lotsBySale.get(lot.mutationId) ?? [];
      saleLots.push({
        id: lot.id,
        typeLocal: lot.typeLocal,
        surfaceReelleBati: this.#toNullableNumber(lot.surfaceReelleBati),
        nombrePiecesPrincipales: lot.nombrePiecesPrincipales,
        surfaceTerrain: this.#toNullableNumber(lot.surfaceTerrain),
      });
      lotsBySale.set(lot.mutationId, saleLots);
    }

    return {
      ...this.#toType(plot),
      sales: salesRows.map((sale): PlotSaleType => ({
        id: sale.id,
        dateMutation: sale.dateMutation,
        natureMutation: sale.natureMutation,
        valeurFonciere: Number(sale.valeurFonciere),
        prixM2: this.#toNullableNumber(sale.prixM2),
        lots: lotsBySale.get(sale.id) ?? [],
      })),
    };
  }

  #toType(row: PlotRow): PlotType {
    return {
      id: row.id,
      number: row.number,
      name: row.name,
      geometry: row.geometry,
      prixMedianM2: row.prixMedianM2 != null ? Number(row.prixMedianM2) : null,
      prixMoyenM2: this.#toNullableNumber(row.prixMoyenM2),
      surfaceM2: this.#toNullableNumber(row.surfaceM2),
      surfaceDisponibleM2: this.#toNullableNumber(row.surfaceDisponibleM2),
      hasSale: row.hasSale,
      maxSaleAmount: this.#toNullableNumber(row.maxSaleAmount),
      sales: [],
    };
  }

  #toNullableNumber(value: string | number | null): number | null {
    if (value == null) return null;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }
}
