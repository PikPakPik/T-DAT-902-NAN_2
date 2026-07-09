import { inject, Injectable } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { MAP_BOUNDS_FETCH_PADDING } from '../../constants/map-view.constants';
import { BoundsFeatureCache } from '../bounds-feature-cache';
import { buildFetchBounds, type MapBounds } from '../map-bounds.utils';

export interface SectionGql {
  id: number;
  code: string;
  prefixe: string;
  name: string;
  geometry: string;
  prixMedianM2: number | null;
}

interface SectionsInBoundsQueryResponse {
  sectionsInBounds?: SectionGql[];
}

interface SectionsByCityQueryResponse {
  sectionsByCity?: SectionGql[];
}

export type SectionFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  {
    id: number;
    code: string;
    prefixe: string;
    name: string;
    prixMedianM2: number | null;
  }
>;

export type SectionsFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  SectionFeature['properties']
>;

const QUERY_SECTIONS_IN_BOUNDS = gql`
  query SectionsInBoundsQuery($bounds: MapBoundsInput!) {
    sectionsInBounds(bounds: $bounds) {
      id
      code
      prefixe
      name
      geometry
      prixMedianM2
    }
  }
`;

const QUERY_SECTIONS_BY_CITY = gql`
  query SectionsByCityQuery($cityId: Int!) {
    sectionsByCity(cityId: $cityId) {
      id
      code
      prefixe
      name
      geometry
      prixMedianM2
    }
  }
`;

@Injectable({ providedIn: 'root' })
export class SectionsGraphqlService {
  readonly #apollo = inject(Apollo);
  readonly #cache = new BoundsFeatureCache<
    GeoJSON.Polygon | GeoJSON.MultiPolygon,
    SectionFeature
  >();
  #inFlight?: Promise<SectionsFeatureCollection>;

  async fetchFeatureCollection(
    viewport: MapBounds,
  ): Promise<SectionsFeatureCollection> {
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

    const fetchPromise = this.#fetchInBounds(viewport);
    this.#inFlight = fetchPromise;

    try {
      return await fetchPromise;
    } finally {
      if (this.#inFlight === fetchPromise) {
        this.#inFlight = undefined;
      }
    }
  }

  async fetchByCityId(cityId: number): Promise<SectionsFeatureCollection> {
    const result = await firstValueFrom(
      this.#apollo.query<SectionsByCityQueryResponse>({
        query: QUERY_SECTIONS_BY_CITY,
        variables: { cityId },
        fetchPolicy: 'no-cache',
        errorPolicy: 'none',
      }),
    );

    const sections = result.data?.sectionsByCity ?? [];
    return {
      type: 'FeatureCollection',
      features: sections.map((section) => this.#toFeature(section)),
    };
  }

  async #fetchInBounds(
    viewport: MapBounds,
  ): Promise<SectionsFeatureCollection> {
    const fetchBounds = buildFetchBounds(viewport, MAP_BOUNDS_FETCH_PADDING);

    const result = await firstValueFrom(
      this.#apollo.query<SectionsInBoundsQueryResponse>({
        query: QUERY_SECTIONS_IN_BOUNDS,
        variables: { bounds: fetchBounds },
        fetchPolicy: 'no-cache',
        errorPolicy: 'none',
      }),
    );

    const sections = result.data?.sectionsInBounds ?? [];
    const features = sections.map((section) => this.#toFeature(section));

    this.#cache.merge(fetchBounds, features);

    return this.#cache.collectionForBounds(fetchBounds);
  }

  #toFeature(section: SectionGql): SectionFeature {
    return {
      type: 'Feature',
      id: section.id,
      properties: {
        id: section.id,
        code: section.code,
        prefixe: section.prefixe,
        name: section.name,
        prixMedianM2: section.prixMedianM2,
      },
      geometry: JSON.parse(section.geometry) as
        | GeoJSON.Polygon
        | GeoJSON.MultiPolygon,
    };
  }
}
