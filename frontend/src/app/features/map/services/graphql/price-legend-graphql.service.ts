import { inject, Injectable } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import type { PriceLegendScope } from '../../core/mapbox-map.facade';

export interface PriceLegendGql {
  label: string;
  min: number | null;
  median: number | null;
  max: number | null;
  count: number;
}

interface PriceLegendQueryResponse {
  priceLegend: PriceLegendGql;
}

const QUERY_PRICE_LEGEND = gql`
  query PriceLegendQuery($scope: PriceLegendScopeInput!) {
    priceLegend(scope: $scope) {
      label
      min
      median
      max
      count
    }
  }
`;

@Injectable({ providedIn: 'root' })
export class PriceLegendGraphqlService {
  readonly #apollo = inject(Apollo);

  async fetch(scope: PriceLegendScope): Promise<PriceLegendGql> {
    const result = await firstValueFrom(
      this.#apollo.query<PriceLegendQueryResponse>({
        query: QUERY_PRICE_LEGEND,
        variables: {
          scope: {
            level: scope.level,
            id: scope.id ?? null,
            code: scope.code ?? null,
          },
        },
        fetchPolicy: 'no-cache',
        errorPolicy: 'none',
      }),
    );

    if (!result.data?.priceLegend) {
      throw new Error('Legende prix indisponible.');
    }

    return result.data.priceLegend;
  }
}
