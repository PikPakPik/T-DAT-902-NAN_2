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
import type { SelectedCity } from '../models/selected-city.model';
import type { MapFilterId } from '../models/map-filter.model';
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

export type CitySelectFn = (city: SelectedCity) => void;
export type PlotSelectFn = (plotId: number) => void;
export type PriceLegendScopeLevel =
  | 'france'
  | 'region'
  | 'department'
  | 'city';

export interface PriceLegendScope {
  scope: string;
  level: PriceLegendScopeLevel;
  id?: number | null;
  code?: string | null;
  showLegend?: boolean;
}

export type LegendScopeChangeFn = (scope: PriceLegendScope) => void;

interface LegendFeatureProperties {
  id?: number;
  name?: string;
  code?: string;
}

type LegendFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  LegendFeatureProperties
>;

export class MapboxMapFacade {
  #map?: mapboxgl.Map;
  #marker?: mapboxgl.Marker;
  #geolocate?: mapboxgl.GeolocateControl;
  #geocoder?: MapboxGeocoder;
  #overlayStack = new MapOverlayStack();
  readonly #regionsOverlay?: RegionsMapOverlay;
  readonly #departmentsOverlay = new DepartmentsMapOverlay();
  readonly #citiesOverlay: CitiesMapOverlay;
  readonly #sectionsOverlay: SectionsMapOverlay;
  readonly #plotsOverlay: PlotsMapOverlay;
  readonly #loadDepartments?: LoadDepartmentsFn;
  readonly #loadCities?: LoadCitiesFn;
  readonly #loadSections?: LoadSectionsFn;
  readonly #loadPlots?: LoadPlotsFn;
  readonly #regionsGeoJson?: RegionsFeatureCollection;
  readonly #onLegendScopeChange?: LegendScopeChangeFn;
  #layerLoadSeq = 0;
  #onMoveEnd?: () => void;

  constructor(
    private readonly token: string,
    regionsGeoJson?: RegionsFeatureCollection,
    loadDepartments?: LoadDepartmentsFn,
    loadCities?: LoadCitiesFn,
    loadSections?: LoadSectionsFn,
    loadPlots?: LoadPlotsFn,
    onCitySelect?: CitySelectFn,
    onPlotSelect?: PlotSelectFn,
    onLegendScopeChange?: LegendScopeChangeFn,
  ) {
    this.#loadDepartments = loadDepartments;
    this.#loadCities = loadCities;
    this.#loadSections = loadSections;
    this.#loadPlots = loadPlots;
    this.#regionsGeoJson = regionsGeoJson;
    this.#onLegendScopeChange = onLegendScopeChange;

    this.#citiesOverlay = new CitiesMapOverlay(onCitySelect);
    this.#sectionsOverlay = new SectionsMapOverlay();
    this.#plotsOverlay = new PlotsMapOverlay(onPlotSelect);

    this.#overlayStack.register(() => new CountriesMapOverlay());
    if (regionsGeoJson?.features.length) {
      this.#regionsOverlay = new RegionsMapOverlay(regionsGeoJson);
      this.#overlayStack.register(() => this.#regionsOverlay!);
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
      this.#regionsOverlay?.setVisible(true);
      this.#departmentsOverlay.setData(EMPTY_DEPARTMENTS);
      this.#citiesOverlay.setData(EMPTY_CITIES);
      this.#sectionsOverlay.setData(EMPTY_SECTIONS);
      this.#plotsOverlay.setData(EMPTY_PLOTS);
      this.#updateLegendScopeFromRegions(zoom);
      return;
    }

    if (zoom >= MAP_PLOTS_MIN_ZOOM) {
      this.#regionsOverlay?.setVisible(false);
      this.#departmentsOverlay.setData(EMPTY_DEPARTMENTS);
      this.#citiesOverlay.setData(EMPTY_CITIES);
      this.#sectionsOverlay.setData(EMPTY_SECTIONS);

      if (!this.#loadPlots) return;

      const plotsGeoJson = await this.#loadPlots(mapBounds).catch(
        () => EMPTY_PLOTS,
      );
      if (seq !== this.#layerLoadSeq) return;

      this.#plotsOverlay.setData(plotsGeoJson);
      this.#updateLegendScopeFromFeatures(plotsGeoJson, {
        fallback: 'France',
        level: 'city',
        deriveCityCodeFromName: true,
        showLegend: false,
      });
      return;
    }

    this.#plotsOverlay.setData(EMPTY_PLOTS);

    if (zoom >= MAP_SECTIONS_MIN_ZOOM) {
      this.#regionsOverlay?.setVisible(false);
      this.#departmentsOverlay.setData(EMPTY_DEPARTMENTS);
      this.#citiesOverlay.setData(EMPTY_CITIES);

      if (!this.#loadSections) return;

      const sectionsGeoJson = await this.#loadSections(mapBounds).catch(
        () => EMPTY_SECTIONS,
      );
      if (seq !== this.#layerLoadSeq) return;

      this.#sectionsOverlay.setData(sectionsGeoJson);
      this.#updateLegendScopeFromFeatures(sectionsGeoJson, {
        fallback: 'France',
        level: 'city',
        deriveCityCodeFromName: true,
      });
      return;
    }

    this.#sectionsOverlay.setData(EMPTY_SECTIONS);

    if (zoom >= MAP_CITIES_MIN_ZOOM) {
      this.#regionsOverlay?.setVisible(false);
      this.#departmentsOverlay.setData(EMPTY_DEPARTMENTS);

      if (!this.#loadCities) return;

      const citiesGeoJson = await this.#loadCities(mapBounds).catch(
        () => EMPTY_CITIES,
      );
      if (seq !== this.#layerLoadSeq) return;

      this.#citiesOverlay.setData(citiesGeoJson);
      this.#updateLegendScopeFromFeatures(citiesGeoJson, {
        fallback: 'France',
        level: 'city',
      });
      return;
    }

    this.#citiesOverlay.setData(EMPTY_CITIES);
    this.#regionsOverlay?.setVisible(false);

    if (!this.#loadDepartments) return;

    const departmentsGeoJson = await this.#loadDepartments(mapBounds).catch(
      () => EMPTY_DEPARTMENTS,
    );
    if (seq !== this.#layerLoadSeq) return;

    this.#departmentsOverlay.setData(departmentsGeoJson);
    this.#updateLegendScopeFromFeatures(departmentsGeoJson, {
      fallback: 'France',
      level: 'department',
    });
  }

  setChoropleth(key: MapFilterId): void {
    this.#citiesOverlay.setChoropleth(key);
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

  #updateLegendScope(scope: PriceLegendScope): void {
    this.#onLegendScopeChange?.(scope);
  }

  #updateLegendScopeFromRegions(zoom: number): void {
    if (zoom < MAP_DETAIL_MIN_ZOOM - 1) {
      this.#updateLegendScope({ scope: 'France', level: 'france' });
      return;
    }
    this.#updateLegendScopeFromFeatures(this.#regionsGeoJson, {
      fallback: 'France',
      level: 'region',
    });
  }

  #updateLegendScopeFromFeatures(
    collection: LegendFeatureCollection | undefined,
    options: {
      fallback: string;
      level: PriceLegendScopeLevel;
      deriveCityCodeFromName?: boolean;
      showLegend?: boolean;
    },
  ): void {
    const feature = this.#resolveDominantFeature(collection);
    const properties = feature?.properties;
    const name = properties?.name ?? options.fallback;
    const cityCode = options.deriveCityCodeFromName
      ? this.#cityCodeFromCadastralName(name)
      : null;

    this.#updateLegendScope({
      scope: name,
      level: options.level,
      id:
        options.level === 'region' ||
        options.level === 'department' ||
        (options.level === 'city' && !cityCode)
          ? (properties?.id ?? null)
          : null,
      code: cityCode ?? properties?.code ?? null,
      showLegend: options.showLegend ?? true,
    });
  }

  #resolveDominantFeature(
    collection: LegendFeatureCollection | undefined,
  ): GeoJSON.Feature<
    GeoJSON.Polygon | GeoJSON.MultiPolygon,
    LegendFeatureProperties
  > | null {
    const map = this.#map;
    const features = collection?.features ?? [];
    if (!map || !features.length) return null;

    const center = map.getCenter();
    const point: [number, number] = [center.lng, center.lat];
    const containing = features.find((feature) =>
      this.#featureContainsPoint(feature, point),
    );
    if (containing) return containing;

    let nearestFeature: GeoJSON.Feature<
      GeoJSON.Polygon | GeoJSON.MultiPolygon,
      LegendFeatureProperties
    > | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const feature of features) {
      const bboxCenter = this.#featureBboxCenter(feature);
      if (!bboxCenter) continue;
      const distance =
        (bboxCenter[0] - point[0]) ** 2 + (bboxCenter[1] - point[1]) ** 2;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestFeature = feature;
      }
    }

    return nearestFeature;
  }

  #cityCodeFromCadastralName(name: string | null | undefined): string | null {
    const match = name?.match(/^(\d{5})/);
    return match?.[1] ?? null;
  }

  #featureContainsPoint(
    feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
    point: [number, number],
  ): boolean {
    const polygons =
      feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;

    return polygons.some((polygon) => {
      const outerRing = polygon[0];
      if (!outerRing || !this.#ringContainsPoint(outerRing, point)) {
        return false;
      }
      return !polygon
        .slice(1)
        .some((hole) => this.#ringContainsPoint(hole, point));
    });
  }

  #ringContainsPoint(
    ring: GeoJSON.Position[],
    point: [number, number],
  ): boolean {
    let inside = false;
    const [x, y] = point;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      const intersects =
        yi > y !== yj > y &&
        x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
      if (intersects) inside = !inside;
    }

    return inside;
  }

  #featureBboxCenter(
    feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  ): [number, number] | null {
    const bbox = this.#featureBbox(feature);
    if (!bbox) return null;
    return [(bbox.minLng + bbox.maxLng) / 2, (bbox.minLat + bbox.maxLat) / 2];
  }

  #featureBbox(
    feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  ): { minLng: number; minLat: number; maxLng: number; maxLat: number } | null {
    let minLng = Number.POSITIVE_INFINITY;
    let minLat = Number.POSITIVE_INFINITY;
    let maxLng = Number.NEGATIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;

    const visit = (position: GeoJSON.Position): void => {
      const [lng, lat] = position;
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    };

    const polygons =
      feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;

    for (const polygon of polygons) {
      for (const ring of polygon) {
        for (const position of ring) {
          visit(position);
        }
      }
    }

    if (![minLng, minLat, maxLng, maxLat].every(Number.isFinite)) return null;
    return { minLng, minLat, maxLng, maxLat };
  }
}
