import { inject, Injectable } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';

export interface CityRentGql {
  annee: number;
  loyerMedianApt?: number | null;
  loyerMedianT1T2?: number | null;
  loyerMedianT3Plus?: number | null;
  loyerMedianMaison?: number | null;
  nbObservations?: number | null;
  evolutionPct?: number | null;
}

interface CityRentQueryResponse {
  cityRent?: CityRentGql | null;
}

interface CityRentHistoryQueryResponse {
  cityRentHistory: CityRentGql[];
}

const CITY_RENT_FIELDS = gql`
  fragment CityRentFields on RentStatsType {
    annee
    loyerMedianApt
    loyerMedianT1T2
    loyerMedianT3Plus
    loyerMedianMaison
    nbObservations
    evolutionPct
  }
`;

const QUERY_CITY_RENT = gql`
  ${CITY_RENT_FIELDS}
  query CityRentQuery($code: String!) {
    cityRent(code: $code) {
      ...CityRentFields
    }
  }
`;

const QUERY_CITY_RENT_HISTORY = gql`
  ${CITY_RENT_FIELDS}
  query CityRentHistoryQuery($code: String!) {
    cityRentHistory(code: $code) {
      ...CityRentFields
    }
  }
`;

@Injectable({ providedIn: 'root' })
export class CityRentGraphqlService {
  readonly #apollo = inject(Apollo);

  async fetchByCode(code: string): Promise<CityRentGql | null> {
    const result = await firstValueFrom(
      this.#apollo.query<CityRentQueryResponse>({
        query: QUERY_CITY_RENT,
        variables: { code },
        fetchPolicy: 'no-cache',
        errorPolicy: 'none',
      }),
    );

    return result.data?.cityRent ?? null;
  }

  async fetchHistoryByCode(code: string): Promise<CityRentGql[]> {
    const result = await firstValueFrom(
      this.#apollo.query<CityRentHistoryQueryResponse>({
        query: QUERY_CITY_RENT_HISTORY,
        variables: { code },
        fetchPolicy: 'no-cache',
        errorPolicy: 'none',
      }),
    );

    return result.data?.cityRentHistory ?? [];
  }
}
