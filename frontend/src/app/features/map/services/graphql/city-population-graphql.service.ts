import { inject, Injectable } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';

export interface CityPopulationGql {
  population: number;
  annee: number;
  superficie?: number | null;
  densite?: number | null;
  evolutionPct?: number | null;
}

interface CityPopulationQueryResponse {
  cityPopulation?: CityPopulationGql | null;
}

interface CityPopulationHistoryQueryResponse {
  cityPopulationHistory: CityPopulationGql[];
}

const QUERY_CITY_POPULATION = gql`
  query CityPopulationQuery($code: String!) {
    cityPopulation(code: $code) {
      population
      annee
      superficie
      densite
    }
  }
`;

const QUERY_CITY_POPULATION_HISTORY = gql`
  query CityPopulationHistoryQuery($code: String!) {
    cityPopulationHistory(code: $code) {
      population
      annee
      evolutionPct
    }
  }
`;

@Injectable({ providedIn: 'root' })
export class CityPopulationGraphqlService {
  readonly #apollo = inject(Apollo);

  async fetchByCode(code: string): Promise<CityPopulationGql | null> {
    const result = await firstValueFrom(
      this.#apollo.query<CityPopulationQueryResponse>({
        query: QUERY_CITY_POPULATION,
        variables: { code },
        fetchPolicy: 'no-cache',
        errorPolicy: 'none',
      }),
    );

    return result.data?.cityPopulation ?? null;
  }

  async fetchHistoryByCode(code: string): Promise<CityPopulationGql[]> {
    const result = await firstValueFrom(
      this.#apollo.query<CityPopulationHistoryQueryResponse>({
        query: QUERY_CITY_POPULATION_HISTORY,
        variables: { code },
        fetchPolicy: 'no-cache',
        errorPolicy: 'none',
      }),
    );

    return result.data?.cityPopulationHistory ?? [];
  }
}
