import { inject, Injectable } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { MAP_BOUNDS_FETCH_PADDING } from '../../constants/map-view.constants';
import { BoundsFeatureCache } from '../bounds-feature-cache';
import { buildFetchBounds, type MapBounds } from '../map-bounds.utils';

export interface DeviceGql {
  id: number;
  nom: string;
  address: string;
  typequ: string;
  categorie: string;
  dom: string;
  sdom: string;
  libcom: string;
  family: string;
  familyLabel: string;
  typeLabel: string;
  longitude: number;
  latitude: number;
  cityId: number;
  distanceMeters: number | null;
}

interface DevicesInBoundsQueryResponse {
  devicesInBounds?: DeviceGql[];
}

interface DevicesNearPlotQueryResponse {
  devicesNearPlot?: DeviceGql[];
}

export type DeviceFeature = GeoJSON.Feature<
  GeoJSON.Point,
  {
    id: number;
    nom: string;
    address: string;
    typequ: string;
    categorie: string;
    dom: string;
    sdom: string;
    libcom: string;
    family: string;
    familyLabel: string;
    typeLabel: string;
    distanceMeters: number | null;
  }
>;

export type DevicesFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  DeviceFeature['properties']
>;

const QUERY_DEVICES_IN_BOUNDS = gql`
  query DevicesInBoundsQuery($bounds: MapBoundsInput!, $limit: Int) {
    devicesInBounds(bounds: $bounds, limit: $limit) {
      id
      nom
      address
      typequ
      categorie
      dom
      sdom
      libcom
      family
      familyLabel
      typeLabel
      longitude
      latitude
      cityId
    }
  }
`;

const QUERY_DEVICES_NEAR_PLOT = gql`
  query DevicesNearPlotQuery($plotId: Int!, $radiusMeters: Int, $limit: Int) {
    devicesNearPlot(
      plotId: $plotId
      radiusMeters: $radiusMeters
      limit: $limit
    ) {
      id
      nom
      address
      typequ
      categorie
      dom
      sdom
      libcom
      family
      familyLabel
      typeLabel
      longitude
      latitude
      cityId
      distanceMeters
    }
  }
`;

@Injectable({ providedIn: 'root' })
export class DevicesGraphqlService {
  readonly #apollo = inject(Apollo);
  readonly #cache = new BoundsFeatureCache<GeoJSON.Point, DeviceFeature>();
  #inFlight?: Promise<DevicesFeatureCollection>;

  async fetchFeatureCollection(
    viewport: MapBounds,
  ): Promise<DevicesFeatureCollection> {
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

  async fetchNearPlot(
    plotId: number,
    radiusMeters = 500,
    limit = 30,
  ): Promise<DeviceGql[]> {
    const result = await firstValueFrom(
      this.#apollo.query<DevicesNearPlotQueryResponse>({
        query: QUERY_DEVICES_NEAR_PLOT,
        variables: { plotId, radiusMeters, limit },
        fetchPolicy: 'no-cache',
        errorPolicy: 'none',
      }),
    );

    return result.data?.devicesNearPlot ?? [];
  }

  async #fetchInBounds(
    viewport: MapBounds,
  ): Promise<DevicesFeatureCollection> {
    const fetchBounds = buildFetchBounds(viewport, MAP_BOUNDS_FETCH_PADDING);

    const result = await firstValueFrom(
      this.#apollo.query<DevicesInBoundsQueryResponse>({
        query: QUERY_DEVICES_IN_BOUNDS,
        variables: { bounds: fetchBounds, limit: 3000 },
        fetchPolicy: 'no-cache',
        errorPolicy: 'none',
      }),
    );

    const devices = result.data?.devicesInBounds ?? [];
    const features = devices.map((device) => this.#toFeature(device));

    this.#cache.merge(fetchBounds, features);

    return this.#cache.collectionForBounds(fetchBounds);
  }

  #toFeature(device: DeviceGql): DeviceFeature {
    return {
      type: 'Feature',
      id: device.id,
      properties: {
        id: device.id,
        nom: device.nom,
        address: device.address,
        typequ: device.typequ,
        categorie: device.categorie,
        dom: device.dom,
        sdom: device.sdom,
        libcom: device.libcom,
        family: device.family,
        familyLabel: device.familyLabel,
        typeLabel: device.typeLabel,
        distanceMeters: device.distanceMeters,
      },
      geometry: {
        type: 'Point',
        coordinates: [device.longitude, device.latitude],
      },
    };
  }
}
