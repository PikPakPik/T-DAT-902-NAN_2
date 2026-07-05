import { inject, Injectable } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';

export interface CityAirQualityGql {
  annee: number;
  indiceAtmoMedian: number;
  pm25Median: number;
  pm10Median: number;
  no2Median: number;
  o3Median: number;
  nbJoursBon: number;
  nbJoursMoyen: number;
  nbJoursMauvais: number;
  evolutionPct?: number | null;
}

interface CityAirQualityQueryResponse {
  cityAirQuality?: CityAirQualityGql | null;
}

interface CityAirQualityHistoryQueryResponse {
  cityAirQualityHistory: CityAirQualityGql[];
}

const CITY_AIR_QUALITY_FIELDS = gql`
  fragment CityAirQualityFields on AirQualityStatsType {
    annee
    indiceAtmoMedian
    pm25Median
    pm10Median
    no2Median
    o3Median
    nbJoursBon
    nbJoursMoyen
    nbJoursMauvais
    evolutionPct
  }
`;

const QUERY_CITY_AIR_QUALITY = gql`
  ${CITY_AIR_QUALITY_FIELDS}
  query CityAirQualityQuery($code: String!) {
    cityAirQuality(code: $code) {
      ...CityAirQualityFields
    }
  }
`;

const QUERY_CITY_AIR_QUALITY_HISTORY = gql`
  ${CITY_AIR_QUALITY_FIELDS}
  query CityAirQualityHistoryQuery($code: String!) {
    cityAirQualityHistory(code: $code) {
      ...CityAirQualityFields
    }
  }
`;

@Injectable({ providedIn: 'root' })
export class CityAirQualityGraphqlService {
  readonly #apollo = inject(Apollo);

  async fetchByCode(code: string): Promise<CityAirQualityGql | null> {
    const result = await firstValueFrom(
      this.#apollo.query<CityAirQualityQueryResponse>({
        query: QUERY_CITY_AIR_QUALITY,
        variables: { code },
        fetchPolicy: 'no-cache',
        errorPolicy: 'none',
      }),
    );

    return result.data?.cityAirQuality ?? null;
  }

  async fetchHistoryByCode(code: string): Promise<CityAirQualityGql[]> {
    const result = await firstValueFrom(
      this.#apollo.query<CityAirQualityHistoryQueryResponse>({
        query: QUERY_CITY_AIR_QUALITY_HISTORY,
        variables: { code },
        fetchPolicy: 'no-cache',
        errorPolicy: 'none',
      }),
    );

    return result.data?.cityAirQualityHistory ?? [];
  }
}
