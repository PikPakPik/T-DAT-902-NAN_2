import { inject, Injectable } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

interface PingQueryResponse {
  ping?: string;
}

const QUERY_PING = gql`
  query PingSmokeQuery {
    ping
  }
`;

@Injectable({ providedIn: 'root' })
export class MapGraphqlSmokeService {
  readonly #apollo = inject(Apollo);

  async check(): Promise<{ ok: boolean; pingValue?: string; error?: string }> {
    try {
      const result = await firstValueFrom(
        this.#apollo.query<PingQueryResponse>({
          query: QUERY_PING,
          fetchPolicy: 'no-cache',
          errorPolicy: 'none',
        }),
      );

      const ping = result.data?.ping;
      if (!ping) {
        return {
          ok: false,
          error: 'GraphQL response missing ping',
        };
      }

      return {
        ok: true,
        pingValue: ping,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'GraphQL request failed',
      };
    }
  }

  async checkRawHttp(): Promise<{ ok: boolean; info: string }> {
    try {
      const response = await fetch(environment.graphql, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'query RawSmokeCheck { ping }',
        }),
      });

      const payload = await response
        .json()
        .catch(() => ({ message: 'non-json response' }));

      if (!response.ok) {
        return {
          ok: false,
          info: `HTTP ${response.status} ${response.statusText} - ${payload?.message ?? 'request failed'}`,
        };
      }

      const ping = payload?.data?.ping;
      if (!ping) {
        return {
          ok: false,
          info: 'HTTP 200 but missing data.ping',
        };
      }

      return {
        ok: true,
        info: `HTTP ${response.status} - ping=${ping}`,
      };
    } catch (error) {
      return {
        ok: false,
        info: error instanceof Error ? error.message : 'Network error',
      };
    }
  }
}
