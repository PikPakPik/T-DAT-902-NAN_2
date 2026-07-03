import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  PriceLegendScopeInput,
  PriceLegendScopeLevel,
} from './price-legend.input';
import { PriceLegendType } from './price-legend.object-type';

interface PriceLegendRow {
  label: string | null;
  min: string | null;
  median: string | null;
  max: string | null;
  count: string;
}

type ScopeSql = {
  labelSql: string;
  whereSql: string;
  params: (string | number)[];
  fallbackLabel: string;
};

@Injectable()
export class PriceLegendService {
  readonly #cache = new Map<string, PriceLegendType>();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getLegend(scope: PriceLegendScopeInput): Promise<PriceLegendType> {
    const normalized = this.#normalizeScope(scope);
    const cacheKey = JSON.stringify(normalized);
    const cached = this.#cache.get(cacheKey);
    if (cached) return cached;

    const scopeSql = this.#scopeSql(normalized);
    const rows = await this.dataSource.query<PriceLegendRow[]>(
      this.#legendQuery(scopeSql),
      scopeSql.params,
    );

    let legend = this.#toLegend(rows[0], scopeSql.fallbackLabel);

    if (legend.count === 0 && normalized.level !== PriceLegendScopeLevel.FRANCE) {
      const rawScopeSql = this.#rawScopeSql(normalized);
      const rawRows = await this.dataSource.query<PriceLegendRow[]>(
        this.#rawLegendQuery(rawScopeSql),
        rawScopeSql.params,
      );
      legend = this.#toLegend(rawRows[0], rawScopeSql.fallbackLabel);
    }

    this.#cache.set(cacheKey, legend);
    return legend;
  }

  #normalizeScope(scope: PriceLegendScopeInput): PriceLegendScopeInput {
    return {
      level: scope.level,
      id: scope.id ?? null,
      code: scope.code?.trim() || null,
    };
  }

  #scopeSql(scope: PriceLegendScopeInput): ScopeSql {
    if (scope.level === PriceLegendScopeLevel.REGION && scope.id != null) {
      return {
        labelSql: '(SELECT r.name FROM regions r WHERE r.id = $1)',
        whereSql: `
          FROM stats_departments sd
          INNER JOIN departments d ON d.id = sd."departmentId"
          WHERE d."regionId" = $1
            AND sd.prix_median_m2 > 0
        `,
        params: [scope.id],
        fallbackLabel: 'Région',
      };
    }

    if (scope.level === PriceLegendScopeLevel.DEPARTMENT && scope.id != null) {
      return {
        labelSql: '(SELECT d2.name FROM departments d2 WHERE d2.id = $1)',
        whereSql: `
          FROM stats_cities sc
          INNER JOIN cities c ON c.id = sc."cityId"
          WHERE c."departmentId" = $1
            AND sc.prix_median_m2 > 0
        `,
        params: [scope.id],
        fallbackLabel: 'Département',
      };
    }

    if (scope.level === PriceLegendScopeLevel.CITY) {
      if (scope.id != null) {
        return {
          labelSql: '(SELECT c2.name FROM cities c2 WHERE c2.id = $1)',
          whereSql: `
            FROM stats_cities sc
            WHERE sc."cityId" = $1
              AND sc.prix_median_m2 > 0
          `,
          params: [scope.id],
          fallbackLabel: 'Commune',
        };
      }

      if (scope.code) {
        return {
          labelSql: '(SELECT c2.name FROM cities c2 WHERE c2.code = $1)',
          whereSql: `
            FROM stats_cities sc
            INNER JOIN cities c ON c.id = sc."cityId"
            WHERE c.code = $1
              AND sc.prix_median_m2 > 0
          `,
          params: [scope.code],
          fallbackLabel: 'Commune',
        };
      }
    }

    return {
      labelSql: `'France'`,
      whereSql: `
        FROM stats_departments sd
        WHERE sd.prix_median_m2 > 0
      `,
      params: [],
      fallbackLabel: 'France',
    };
  }

  #legendQuery(scopeSql: ScopeSql): string {
    return `
      WITH scoped_prices AS (
        SELECT prix_median_m2 AS prix_m2
        ${scopeSql.whereSql}
      )
      SELECT
        ${scopeSql.labelSql} AS label,
        ROUND(
          percentile_cont(0.05) WITHIN GROUP (ORDER BY prix_m2)::numeric,
          2
        ) AS min,
        ROUND(
          percentile_cont(0.5) WITHIN GROUP (ORDER BY prix_m2)::numeric,
          2
        ) AS median,
        ROUND(
          percentile_cont(0.95) WITHIN GROUP (ORDER BY prix_m2)::numeric,
          2
        ) AS max,
        COUNT(*)::text AS count
      FROM scoped_prices
    `;
  }

  #rawScopeSql(scope: PriceLegendScopeInput): ScopeSql {
    if (scope.level === PriceLegendScopeLevel.REGION && scope.id != null) {
      return {
        labelSql: '(SELECT r.name FROM regions r WHERE r.id = $1)',
        whereSql: 'AND d."regionId" = $1',
        params: [scope.id],
        fallbackLabel: 'Région',
      };
    }

    if (scope.level === PriceLegendScopeLevel.DEPARTMENT && scope.id != null) {
      return {
        labelSql: '(SELECT d2.name FROM departments d2 WHERE d2.id = $1)',
        whereSql: 'AND d.id = $1',
        params: [scope.id],
        fallbackLabel: 'Département',
      };
    }

    if (scope.level === PriceLegendScopeLevel.CITY) {
      if (scope.id != null) {
        return {
          labelSql: '(SELECT c2.name FROM cities c2 WHERE c2.id = $1)',
          whereSql: 'AND c.id = $1',
          params: [scope.id],
          fallbackLabel: 'Commune',
        };
      }

      if (scope.code) {
        return {
          labelSql: '(SELECT c2.name FROM cities c2 WHERE c2.code = $1)',
          whereSql: 'AND c.code = $1',
          params: [scope.code],
          fallbackLabel: 'Commune',
        };
      }
    }

    return this.#scopeSql({ level: PriceLegendScopeLevel.FRANCE });
  }

  #rawLegendQuery(scopeSql: ScopeSql): string {
    return `
      WITH scoped_prices AS (
        SELECT DISTINCT m.id, m.prix_m2
        FROM mutations m
        INNER JOIN mutation_locals ml ON ml."mutationId" = m.id
        INNER JOIN plots p ON p.id = ml."plotId"
        INNER JOIN sections s ON s.id = p."sectionId"
        INNER JOIN cities c ON c.id = s."cityId"
        INNER JOIN departments d ON d.id = c."departmentId"
        WHERE m.prix_m2 IS NOT NULL
          AND m.prix_m2 > 0
          ${scopeSql.whereSql}
      )
      SELECT
        ${scopeSql.labelSql} AS label,
        ROUND(
          percentile_cont(0.05) WITHIN GROUP (ORDER BY prix_m2)::numeric,
          2
        ) AS min,
        ROUND(
          percentile_cont(0.5) WITHIN GROUP (ORDER BY prix_m2)::numeric,
          2
        ) AS median,
        ROUND(
          percentile_cont(0.95) WITHIN GROUP (ORDER BY prix_m2)::numeric,
          2
        ) AS max,
        COUNT(*)::text AS count
      FROM scoped_prices
    `;
  }

  #toLegend(
    row: PriceLegendRow | undefined,
    fallbackLabel: string,
  ): PriceLegendType {
    return {
      label: row?.label ?? fallbackLabel,
      min: this.#toNullableNumber(row?.min ?? null),
      median: this.#toNullableNumber(row?.median ?? null),
      max: this.#toNullableNumber(row?.max ?? null),
      count: Number(row?.count ?? 0),
    };
  }

  #toNullableNumber(value: string | null): number | null {
    if (value == null) return null;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }
}
