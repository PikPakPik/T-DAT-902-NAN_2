import { inject, Injectable } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { MAP_BOUNDS_FETCH_PADDING } from '../../constants/map-view.constants';
import { BoundsFeatureCache } from '../bounds-feature-cache';
import { buildFetchBounds, type MapBounds } from '../map-bounds.utils';

export interface DepartmentGql {
  id: number;
  name: string;
  code: string;
  geometry: string;
  prixMedianM2: number | null;
}

interface DepartmentsInBoundsQueryResponse {
  departmentsInBounds?: DepartmentGql[];
}

export type DepartmentFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { id: number; name: string; code: string; prixMedianM2: number | null }
>;

export type DepartmentsFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { id: number; name: string; code: string; prixMedianM2: number | null }
>;

const QUERY_DEPARTMENTS_IN_BOUNDS = gql`
  query DepartmentsInBoundsQuery($bounds: MapBoundsInput!) {
    departmentsInBounds(bounds: $bounds) {
      id
      name
      code
      geometry
      prixMedianM2
    }
  }
`;

@Injectable({ providedIn: 'root' })
export class DepartmentsGraphqlService {
  readonly #apollo = inject(Apollo);
  readonly #cache = new BoundsFeatureCache<
    GeoJSON.Polygon | GeoJSON.MultiPolygon,
    DepartmentFeature
  >();
  #inFlight?: Promise<DepartmentsFeatureCollection>;

  async fetchFeatureCollection(
    viewport: MapBounds,
  ): Promise<DepartmentsFeatureCollection> {
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

  async #fetchAndMerge(
    viewport: MapBounds,
  ): Promise<DepartmentsFeatureCollection> {
    const fetchBounds = buildFetchBounds(viewport, MAP_BOUNDS_FETCH_PADDING);

    const result = await firstValueFrom(
      this.#apollo.query<DepartmentsInBoundsQueryResponse>({
        query: QUERY_DEPARTMENTS_IN_BOUNDS,
        variables: { bounds: fetchBounds },
        fetchPolicy: 'no-cache',
        errorPolicy: 'none',
      }),
    );

    const departments = result.data?.departmentsInBounds ?? [];
    const features = departments.map((department) =>
      this.#toFeature(department),
    );

    this.#cache.merge(fetchBounds, features);

    return this.#cache.collectionForBounds(fetchBounds);
  }

  #toFeature(department: DepartmentGql): DepartmentFeature {
    return {
      type: 'Feature',
      id: department.id,
      properties: {
        id: department.id,
        name: department.name,
        code: department.code,
        prixMedianM2: department.prixMedianM2,
      },
      geometry: JSON.parse(department.geometry) as
        | GeoJSON.Polygon
        | GeoJSON.MultiPolygon,
    };
  }
}
