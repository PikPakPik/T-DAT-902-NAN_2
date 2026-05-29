import { inject, Injectable } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';

export interface RegionGql {
  id: number;
  name: string;
  code: string;
  geometry: string;
  prixMedianM2: number | null;
}

interface RegionsQueryResponse {
  regions?: RegionGql[];
}

export type RegionsFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { id: number; name: string; code: string; prixMedianM2: number | null }
>;

const QUERY_REGIONS = gql`
  query RegionsQuery {
    regions {
      id
      name
      code
      geometry
      prixMedianM2
    }
  }
`;

@Injectable({ providedIn: 'root' })
export class RegionsGraphqlService {
  readonly #apollo = inject(Apollo);

  async fetchFeatureCollection(): Promise<RegionsFeatureCollection> {
    const result = await firstValueFrom(
      this.#apollo.query<RegionsQueryResponse>({
        query: QUERY_REGIONS,
        fetchPolicy: 'no-cache',
        errorPolicy: 'none',
      }),
    );

    const regions = result.data?.regions;
    if (!regions?.length) {
      return { type: 'FeatureCollection', features: [] };
    }

    return {
      type: 'FeatureCollection',
      features: regions.map((region) => ({
        type: 'Feature' as const,
        id: region.id,
        properties: {
          id: region.id,
          name: region.name,
          code: region.code,
          prixMedianM2: region.prixMedianM2,
        },
        geometry: JSON.parse(region.geometry) as
          | GeoJSON.Polygon
          | GeoJSON.MultiPolygon,
      })),
    };
  }
}
