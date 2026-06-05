import { inject, Injectable } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { MAP_BOUNDS_FETCH_PADDING } from '../../constants/map-view.constants';
import { BoundsFeatureCache } from '../bounds-feature-cache';
import { buildFetchBounds, type MapBounds } from '../map-bounds.utils';

export interface CityGql {
  id: number;
  name: string;
  code: string;
  geometry: string;
  prixMedianM2: number | null;
}

interface CitiesInBoundsQueryResponse {
  citiesInBounds?: CityGql[];
}

export type CityFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { id: number; name: string; code: string; prixMedianM2: number | null }
>;

export type CitiesFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { id: number; name: string; code: string; prixMedianM2: number | null }
>;

const QUERY_CITIES_IN_BOUNDS = gql`
  query CitiesInBoundsQuery($bounds: MapBoundsInput!) {
    citiesInBounds(bounds: $bounds) {
      id
      name
      code
      geometry
      prixMedianM2
    }
  }
`;

@Injectable({ providedIn: 'root' })
export class CitiesGraphqlService {
  readonly #apollo = inject(Apollo);
  readonly #cache = new BoundsFeatureCache<CityFeature>();
  #inFlight?: Promise<CitiesFeatureCollection>;

  async fetchFeatureCollection(
    viewport: MapBounds,
  ): Promise<CitiesFeatureCollection> {
    if (this.#cache.isCovered(viewport)) {
      return this.#cache.collectionForDisplay(
        viewport,
        MAP_BOUNDS_FETCH_PADDING,
      );
    }

    if (this.#inFlight) {
      await this.#inFlight.catch(() => undefined);
      if (this.#cache.isCovered(viewport)) {
        return this.#cache.collectionForDisplay(
          viewport,
          MAP_BOUNDS_FETCH_PADDING,
        );
      }
    }

    const fetchPromise = this.#fetchAndMerge(viewport);
    this.#inFlight = fetchPromise;

    try {
      return await fetchPromise;
    } finally {
      if (this.#inFlight === fetchPromise) {
        this.#inFlight = undefined;
      }
    }
  }

  async #fetchAndMerge(viewport: MapBounds): Promise<CitiesFeatureCollection> {
    const fetchBounds = buildFetchBounds(viewport, MAP_BOUNDS_FETCH_PADDING);

    const result = await firstValueFrom(
      this.#apollo.query<CitiesInBoundsQueryResponse>({
        query: QUERY_CITIES_IN_BOUNDS,
        variables: { bounds: fetchBounds },
        fetchPolicy: 'no-cache',
        errorPolicy: 'none',
      }),
    );

    const cities = result.data?.citiesInBounds ?? [];
    const features = cities.map((city) => this.#toFeature(city));

    this.#cache.merge(fetchBounds, features);

    return this.#cache.collectionForBounds(fetchBounds);
  }

  #toFeature(city: CityGql): CityFeature {
    return {
      type: 'Feature',
      id: city.id,
      properties: {
        id: city.id,
        name: city.name,
        code: city.code,
        prixMedianM2: city.prixMedianM2,
      },
      geometry: JSON.parse(city.geometry) as
        | GeoJSON.Polygon
        | GeoJSON.MultiPolygon,
    };
  }
}
