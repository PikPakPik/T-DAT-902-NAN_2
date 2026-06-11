import { inject, Injectable } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';

export interface SentimentGlobalGql {
  averageScore: number;
  label: string;
  reviewCount: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  analyzedAt: string | null;
}

export interface WordcloudWordGql {
  word: string;
  weight: number;
}

export interface WordcloudDataGql {
  method: string;
  words: WordcloudWordGql[];
  generatedAt: string | null;
}

export interface ReviewInsightGql {
  date: string;
  comment: string;
  overallRating: number;
  sentimentScore: number | null;
  sentimentLabel: string | null;
}

export interface CityInsightsGql {
  code: string;
  name: string | null;
  sentimentGlobal: SentimentGlobalGql | null;
  wordcloudData: WordcloudDataGql | null;
  recentReviews: ReviewInsightGql[];
}

interface CityInsightsQueryResponse {
  cityInsights?: CityInsightsGql;
}

const QUERY_CITY_INSIGHTS = gql`
  query CityInsightsQuery($code: String!, $limit: Int) {
    cityInsights(code: $code, limit: $limit) {
      code
      name
      sentimentGlobal {
        averageScore
        label
        reviewCount
        positiveCount
        neutralCount
        negativeCount
        analyzedAt
      }
      wordcloudData {
        method
        generatedAt
        words {
          word
          weight
        }
      }
      recentReviews {
        date
        comment
        overallRating
        sentimentScore
        sentimentLabel
      }
    }
  }
`;

@Injectable({ providedIn: 'root' })
export class CityInsightsGraphqlService {
  readonly #apollo = inject(Apollo);

  async fetchByCode(
    code: string,
    limit = 10,
  ): Promise<CityInsightsGql | null> {
    const result = await firstValueFrom(
      this.#apollo.query<CityInsightsQueryResponse>({
        query: QUERY_CITY_INSIGHTS,
        variables: { code, limit },
        fetchPolicy: 'no-cache',
        errorPolicy: 'none',
      }),
    );

    return result.data?.cityInsights ?? null;
  }
}
