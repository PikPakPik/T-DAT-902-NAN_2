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
  prixMoyenM2: number | null;
  surfaceM2: number | null;
  surfaceDisponibleM2: number | null;
  hasSale: boolean;
  maxSaleAmount: number | null;
}

export interface PlotSaleLotGql {
  id: number;
  typeLocal: string | null;
  surfaceReelleBati: number | null;
  nombrePiecesPrincipales: number | null;
  surfaceTerrain: number | null;
}

export interface PlotSaleGql {
  id: number;
  dateMutation: string;
  natureMutation: string;
  valeurFonciere: number;
  prixM2: number | null;
  lots: PlotSaleLotGql[];
}

export interface PlotDetailsGql
  extends Omit<PlotGql, 'geometry'> {
  sales: PlotSaleGql[];
}

interface PlotsInBoundsQueryResponse {
  plotsInBounds?: PlotGql[];
}

interface PlotsBySectionQueryResponse {
  plotsBySection?: PlotGql[];
}

interface PlotDetailsQueryResponse {
  plotDetails?: PlotDetailsGql | null;
}

export type PlotFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  {
    id: number;
    number: string;
    name: string;
    prixMedianM2: number | null;
    prixMoyenM2: number | null;
    surfaceM2: number | null;
    surfaceDisponibleM2: number | null;
    hasSale: boolean;
    maxSaleAmount: number | null;
    maxSaleLabel: string | null;
  }
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
      prixMoyenM2
      surfaceM2
      surfaceDisponibleM2
      hasSale
      maxSaleAmount
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
      prixMoyenM2
      surfaceM2
      surfaceDisponibleM2
      hasSale
      maxSaleAmount
    }
  }
`;

const QUERY_PLOT_DETAILS = gql`
  query PlotDetailsQuery($plotId: Int!) {
    plotDetails(plotId: $plotId) {
      id
      number
      name
      prixMedianM2
      prixMoyenM2
      surfaceM2
      surfaceDisponibleM2
      hasSale
      maxSaleAmount
      sales {
        id
        dateMutation
        natureMutation
        valeurFonciere
        prixM2
        lots {
          id
          typeLocal
          surfaceReelleBati
          nombrePiecesPrincipales
          surfaceTerrain
        }
      }
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

  async fetchDetails(plotId: number): Promise<PlotDetailsGql | null> {
    const result = await firstValueFrom(
      this.#apollo.query<PlotDetailsQueryResponse>({
        query: QUERY_PLOT_DETAILS,
        variables: { plotId },
        fetchPolicy: 'no-cache',
        errorPolicy: 'none',
      }),
    );

    return result.data?.plotDetails ?? null;
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
        prixMoyenM2: plot.prixMoyenM2,
        surfaceM2: plot.surfaceM2,
        surfaceDisponibleM2: plot.surfaceDisponibleM2,
        hasSale: plot.hasSale,
        maxSaleAmount: plot.maxSaleAmount,
        maxSaleLabel: this.#formatCurrency(plot.maxSaleAmount),
      },
      geometry: JSON.parse(plot.geometry) as
        | GeoJSON.Polygon
        | GeoJSON.MultiPolygon,
    };
  }

  #formatCurrency(value: number | null): string | null {
    if (value == null || !Number.isFinite(value) || value <= 0) return null;
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(value);
  }
}
