import { inject, Injectable } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';

export interface CityCrimeGql {
  annee: number;
  tauxCambriolages: number;
  tauxVolsArmes: number;
  tauxVolsSansViol: number;
  tauxViolencesPhys: number;
  score: number;
  evolutionPct?: number | null;
}

interface CityCrimeQueryResponse {
  cityCrime?: CityCrimeGql | null;
}

interface CityCrimeHistoryQueryResponse {
  cityCrimeHistory: CityCrimeGql[];
}

const QUERY_CITY_CRIME = gql`
  query CityCrimeQuery($code: String!) {
    cityCrime(code: $code) {
      annee
      tauxCambriolages
      tauxVolsArmes
      tauxVolsSansViol
      tauxViolencesPhys
      score
      evolutionPct
    }
  }
`;

const QUERY_CITY_CRIME_HISTORY = gql`
  query CityCrimeHistoryQuery($code: String!) {
    cityCrimeHistory(code: $code) {
      annee
      tauxCambriolages
      tauxVolsArmes
      tauxVolsSansViol
      tauxViolencesPhys
      score
      evolutionPct
    }
  }
`;

@Injectable({ providedIn: 'root' })
export class CityCrimeGraphqlService {
  readonly #apollo = inject(Apollo);

  async fetchByCode(code: string): Promise<CityCrimeGql | null> {
    const result = await firstValueFrom(
      this.#apollo.query<CityCrimeQueryResponse>({
        query: QUERY_CITY_CRIME,
        variables: { code },
        fetchPolicy: 'no-cache',
        errorPolicy: 'none',
      }),
    );

    return result.data?.cityCrime ?? null;
  }

  async fetchHistoryByCode(code: string): Promise<CityCrimeGql[]> {
    const result = await firstValueFrom(
      this.#apollo.query<CityCrimeHistoryQueryResponse>({
        query: QUERY_CITY_CRIME_HISTORY,
        variables: { code },
        fetchPolicy: 'no-cache',
        errorPolicy: 'none',
      }),
    );

    return result.data?.cityCrimeHistory ?? [];
  }
}
