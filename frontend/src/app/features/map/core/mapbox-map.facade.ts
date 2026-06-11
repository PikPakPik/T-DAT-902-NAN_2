import * as mapboxgl from 'mapbox-gl';
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';
import {
  MAP_CITIES_MIN_ZOOM,
  MAP_DETAIL_MIN_ZOOM,
  MAP_PLOTS_MIN_ZOOM,
  MAP_SECTIONS_MIN_ZOOM,
} from '../constants/map-view.constants';
import { CitiesMapOverlay } from '../overlays/cities/cities.map-overlay';
import { CountriesMapOverlay } from '../overlays/countries/countries.map-overlay';
import { DepartmentsMapOverlay } from '../overlays/departments/departments.map-overlay';
import { MapOverlayStack } from '../overlays/map-overlay-stack';
import { PlotsMapOverlay } from '../overlays/plots/plots.map-overlay';
import { RegionsMapOverlay } from '../overlays/regions/regions.map-overlay';
import { SectionsMapOverlay } from '../overlays/sections/sections.map-overlay';
import type { CitiesFeatureCollection } from '../services/graphql/cities-graphql.service';
import type { DepartmentsFeatureCollection } from '../services/graphql/departments-graphql.service';
import type { PlotsFeatureCollection } from '../services/graphql/plots-graphql.service';
import type { RegionsFeatureCollection } from '../services/graphql/regions-graphql.service';
import type { SectionsFeatureCollection } from '../services/graphql/sections-graphql.service';
import type { MapBounds } from '../services/map-bounds.utils';

const MAP_STYLE = 'mapbox://styles/mapbox/streets-v12';

const EMPTY_DEPARTMENTS: DepartmentsFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

const EMPTY_CITIES: CitiesFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

const EMPTY_SECTIONS: SectionsFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

const EMPTY_PLOTS: PlotsFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

export type LoadDepartmentsFn = (
  bounds: MapBounds,
) => Promise<DepartmentsFeatureCollection>;

export type LoadCitiesFn = (
  bounds: MapBounds,
) => Promise<CitiesFeatureCollection>;

export type LoadSectionsFn = (
  bounds: MapBounds,
) => Promise<SectionsFeatureCollection>;

export type LoadPlotsFn = (
  bounds: MapBounds,
) => Promise<PlotsFeatureCollection>;

export class MapboxMapFacade {
  #map?: mapboxgl.Map;
  #marker?: mapboxgl.Marker;
  #geolocate?: mapboxgl.GeolocateControl;
  #geocoder?: MapboxGeocoder;
  #overlayStack = new MapOverlayStack();
  readonly #departmentsOverlay = new DepartmentsMapOverlay();
  readonly #citiesOverlay: CitiesMapOverlay;
  readonly #sectionsOverlay: SectionsMapOverlay;
  readonly #plotsOverlay = new PlotsMapOverlay();
  readonly #loadDepartments?: LoadDepartmentsFn;
  readonly #loadCities?: LoadCitiesFn;
  readonly #loadSections?: LoadSectionsFn;
  readonly #loadPlots?: LoadPlotsFn;
  #layerLoadSeq = 0;
  #onMoveEnd?: () => void;

  constructor(
    private readonly token: string,
    regionsGeoJson?: RegionsFeatureCollection,
    loadDepartments?: LoadDepartmentsFn,
    loadCities?: LoadCitiesFn,
    loadSections?: LoadSectionsFn,
    loadPlots?: LoadPlotsFn,
  ) {
    this.#loadDepartments = loadDepartments;
    this.#loadCities = loadCities;
    this.#loadSections = loadSections;
    this.#loadPlots = loadPlots;

    this.#citiesOverlay = new CitiesMapOverlay();
    this.#sectionsOverlay = new SectionsMapOverlay();

    this.#overlayStack.register(() => new CountriesMapOverlay());
    if (regionsGeoJson?.features.length) {
      this.#overlayStack.register(
        () => new RegionsMapOverlay(regionsGeoJson),
      );
    }
    this.#overlayStack.register(() => this.#departmentsOverlay);
    this.#overlayStack.register(() => this.#citiesOverlay);
    this.#overlayStack.register(() => this.#sectionsOverlay);
    this.#overlayStack.register(() => this.#plotsOverlay);
  }

  init(container: HTMLElement): void {
    if (!this.token) return;

    (mapboxgl as { setTelemetryEnabled?: (enabled: boolean) => void })
      .setTelemetryEnabled?.(false);

    this.#map = new mapboxgl.Map({
      container,
      accessToken: this.token,
      style: MAP_STYLE,
      center: [2.2137, 46.2276], // France
      zoom: 4.5,
      maxZoom: 20,
      attributionControl: true,
      performanceMetricsCollection: false,
    });

    this.#map.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      'top-left',
    );

    this.#geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
      showUserHeading: true,
      showUserLocation: true,
      fitBoundsOptions: { maxZoom: 16 },
    });
    this.#map.addControl(this.#geolocate, 'top-left');

    this.#geocoder = new MapboxGeocoder({
      accessToken: this.token,
      mapboxgl,
      marker: false,
      placeholder: 'Rechercher une adresse...',
      language: 'fr',
    });
    this.#map.addControl(this.#geocoder, 'top-right');

    this.#geocoder.on('result', (e: {
      result: {
        center?: [number, number];
        geometry?: { coordinates?: [number, number] };
      };
    }) => {
      const center = e.result.center ?? e.result.geometry?.coordinates;
      if (!center || center.length < 2 || !this.#map) return;
      const [lon, lat] = center;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
      if (!this.#marker) {
        this.#marker = new mapboxgl.Marker({ color: '#2563eb' })
          .setLngLat([lon, lat])
          .addTo(this.#map);
        return;
      }
      this.#marker.setLngLat([lon, lat]);
    });

    this.#onMoveEnd = () => {
      void this.#syncLayersForViewport();
    };
    this.#map.on('moveend', this.#onMoveEnd);

    this.#map.on('load', () => {
      if (this.#map) {
        this.#overlayStack.mount(this.#map, this.token);
      }
    });
  }

  async #syncLayersForViewport(): Promise<void> {
    const map = this.#map;
    if (!map) return;

    const zoom = map.getZoom();
    const bounds = map.getBounds();
    if (!bounds) return;

    const mapBounds: MapBounds = {
      topLeftLng: bounds.getWest(),
      topLeftLat: bounds.getNorth(),
      bottomRightLng: bounds.getEast(),
      bottomRightLat: bounds.getSouth(),
    };

    const seq = ++this.#layerLoadSeq;

    if (zoom <= MAP_DETAIL_MIN_ZOOM) {
      this.#departmentsOverlay.setData(EMPTY_DEPARTMENTS);
      this.#citiesOverlay.setData(EMPTY_CITIES);
      this.#sectionsOverlay.setData(EMPTY_SECTIONS);
      this.#plotsOverlay.setData(EMPTY_PLOTS);
      return;
    }

    if (zoom >= MAP_PLOTS_MIN_ZOOM) {
      this.#departmentsOverlay.setData(EMPTY_DEPARTMENTS);
      this.#citiesOverlay.setData(EMPTY_CITIES);
      this.#sectionsOverlay.setData(EMPTY_SECTIONS);

      if (!this.#loadPlots) return;

      const plotsGeoJson = await this.#loadPlots(mapBounds).catch(
        () => EMPTY_PLOTS,
      );
      if (seq !== this.#layerLoadSeq) return;

      this.#plotsOverlay.setData(plotsGeoJson);
      return;
    }

    this.#plotsOverlay.setData(EMPTY_PLOTS);

    if (zoom >= MAP_SECTIONS_MIN_ZOOM) {
      this.#departmentsOverlay.setData(EMPTY_DEPARTMENTS);
      this.#citiesOverlay.setData(EMPTY_CITIES);

      if (!this.#loadSections) return;

      const sectionsGeoJson = await this.#loadSections(mapBounds).catch(
        () => EMPTY_SECTIONS,
      );
      if (seq !== this.#layerLoadSeq) return;

      this.#sectionsOverlay.setData(sectionsGeoJson);
      return;
    }

    this.#sectionsOverlay.setData(EMPTY_SECTIONS);

    if (zoom >= MAP_CITIES_MIN_ZOOM) {
      this.#departmentsOverlay.setData(EMPTY_DEPARTMENTS);

      if (!this.#loadCities) return;

      const citiesGeoJson = await this.#loadCities(mapBounds).catch(
        () => EMPTY_CITIES,
      );
      if (seq !== this.#layerLoadSeq) return;

      this.#citiesOverlay.setData(citiesGeoJson);
      return;
    }

    this.#citiesOverlay.setData(EMPTY_CITIES);

    if (!this.#loadDepartments) return;

    const departmentsGeoJson = await this.#loadDepartments(mapBounds).catch(
      () => EMPTY_DEPARTMENTS,
    );
    if (seq !== this.#layerLoadSeq) return;

    this.#departmentsOverlay.setData(departmentsGeoJson);
  }

  destroy(): void {
    if (this.#map && this.#onMoveEnd) {
      this.#map.off('moveend', this.#onMoveEnd);
    }
    this.#marker?.remove();
    this.#overlayStack.destroy();
    if (this.#map && this.#geocoder) this.#map.removeControl(this.#geocoder);
    if (this.#map && this.#geolocate) this.#map.removeControl(this.#geolocate);
    this.#map?.remove();
  }
}
