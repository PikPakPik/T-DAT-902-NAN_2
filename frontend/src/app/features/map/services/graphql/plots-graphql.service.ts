import { inject, Injectable } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { MAP_BOUNDS_FETCH_PADDING } from '../../constants/map-view.constants';
import { BoundsFeatureCache } from '../bounds-feature-cache';
import { buildFetchBounds, type MapBounds } from '../map-bounds.utils';

export interface PlotGql {
  id: number;
  number: string;
  name: string;
  geometry: string;
  prixMedianM2: number | null;
}

interface PlotsInBoundsQueryResponse {
  plotsInBounds?: PlotGql[];
}

interface PlotsBySectionQueryResponse {
  plotsBySection?: PlotGql[];
}

export type PlotFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { id: number; number: string; name: string; prixMedianM2: number | null }
>;

export type PlotsFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  PlotFeature['properties']
>;

const QUERY_PLOTS_IN_BOUNDS = gql`
  query PlotsInBoundsQuery($bounds: MapBoundsInput!) {
    plotsInBounds(bounds: $bounds) {
      id
      number
      name
      geometry
      prixMedianM2
    }
  }
`;

const QUERY_PLOTS_BY_SECTION = gql`
  query PlotsBySectionQuery($sectionId: Int!) {
    plotsBySection(sectionId: $sectionId) {
      id
      number
      name
      geometry
      prixMedianM2
    }
  }
`;

@Injectable({ providedIn: 'root' })
export class PlotsGraphqlService {
  readonly #apollo = inject(Apollo);
  readonly #cache = new BoundsFeatureCache<PlotFeature>();
  #inFlight?: Promise<PlotsFeatureCollection>;

  async fetchFeatureCollection(
    viewport: MapBounds,
  ): Promise<PlotsFeatureCollection> {
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

  async fetchBySectionId(sectionId: number): Promise<PlotsFeatureCollection> {
    const result = await firstValueFrom(
      this.#apollo.query<PlotsBySectionQueryResponse>({
        query: QUERY_PLOTS_BY_SECTION,
        variables: { sectionId },
        fetchPolicy: 'no-cache',
        errorPolicy: 'none',
      }),
    );

    const plots = result.data?.plotsBySection ?? [];
    return {
      type: 'FeatureCollection',
      features: plots.map((plot) => this.#toFeature(plot)),
    };
  }

  async #fetchInBounds(viewport: MapBounds): Promise<PlotsFeatureCollection> {
    const fetchBounds = buildFetchBounds(viewport, MAP_BOUNDS_FETCH_PADDING);

    const result = await firstValueFrom(
      this.#apollo.query<PlotsInBoundsQueryResponse>({
        query: QUERY_PLOTS_IN_BOUNDS,
        variables: { bounds: fetchBounds },
        fetchPolicy: 'no-cache',
        errorPolicy: 'none',
      }),
    );

    const plots = result.data?.plotsInBounds ?? [];
    const features = plots.map((plot) => this.#toFeature(plot));

    this.#cache.merge(fetchBounds, features);

    return this.#cache.collectionForBounds(fetchBounds);
  }

  #toFeature(plot: PlotGql): PlotFeature {
    return {
      type: 'Feature',
      id: plot.id,
      properties: {
        id: plot.id,
        number: plot.number,
        name: plot.name,
        prixMedianM2: plot.prixMedianM2,
      },
      geometry: JSON.parse(plot.geometry) as
        | GeoJSON.Polygon
        | GeoJSON.MultiPolygon,
    };
  }
}
