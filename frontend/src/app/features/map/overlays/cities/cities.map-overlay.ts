import * as mapboxgl from 'mapbox-gl';
import { getPolygonFeatureBounds, getPolygonFeatureCenter } from '../map-overlay-geo';
import type { MapboxOverlay, MapOverlayContext } from '../map-overlay.types';
import { MAP_SECTIONS_MIN_ZOOM } from '../../constants/map-view.constants';
import type { CitiesFeatureCollection } from '../../services/graphql/cities-graphql.service';
import { adminFillColorExpression, formatPriceM2 } from '../shared/price-colors';
import { densityFillColorExpression, formatDensity } from '../shared/density-colors';
import {
  criminalityFillColorExpression,
  formatCriminality,
} from '../shared/criminality-colors';
import { rentFillColorExpression, formatRent } from '../shared/rent-colors';
import {
  airQualityFillColorExpression,
  formatAirQuality,
} from '../shared/air-quality-colors';
import type { MapFilterId } from '../../models/map-filter.model';

const CITIES_SOURCE_ID = 'cities-fr';
const CITIES_FILL_LAYER_ID = 'cities-fr-fill';
const CITIES_BORDER_LAYER_ID = 'cities-fr-borders';

const EMPTY_COLLECTION: CitiesFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

export type CitySelectHandler = (city: { id: number; name: string; code: string }) => void;

export class CitiesMapOverlay implements MapboxOverlay {
  #geoJson: CitiesFeatureCollection = EMPTY_COLLECTION;

  #map?: mapboxgl.Map;
  #popup?: mapboxgl.Popup;
  #hoveredCityId?: string | number;
  #onMove?: (e: mapboxgl.MapMouseEvent) => void;
  #onLeave?: () => void;
  #onClick?: (e: mapboxgl.MapMouseEvent) => void;
  #onZoomEnd?: () => void;
  #detailViewActive = false;
  #interactionsBound = false;

  #activeChoropleth: MapFilterId = 'prix_m2';

  constructor(private readonly onCitySelect?: CitySelectHandler) {}

  attach(ctx: MapOverlayContext): void {
    this.#map = ctx.map;
    this.#ensureLayers();
  }

  onStyleChanged(ctx: MapOverlayContext): void {
    this.destroy();
    this.attach(ctx);
    if (this.#geoJson.features.length) {
      this.#updateSourceData();
      this.#bindInteractions();
    }
    if (this.#activeChoropleth) {
      this.setChoropleth(this.#activeChoropleth);
    }
  }

  setData(geoJson: CitiesFeatureCollection): void {
    this.#geoJson = geoJson;
    if (!this.#map) return;

    this.#ensureLayers();
    this.#updateSourceData();
    this.#bindInteractions();
  }

  setChoropleth(key: MapFilterId): void {
    this.#activeChoropleth = key;
    const map = this.#map;
    if (!map || !map.getLayer(CITIES_FILL_LAYER_ID)) return;

    const expression =
      key === 'densite'
        ? densityFillColorExpression()
        : key === 'criminalite'
          ? criminalityFillColorExpression()
          : key === 'loyer'
            ? rentFillColorExpression()
            : key === 'qualite_air'
              ? airQualityFillColorExpression()
            : adminFillColorExpression();

    map.setPaintProperty(CITIES_FILL_LAYER_ID, 'fill-color', expression);
  }

  destroy(): void {
    const map = this.#map;
    if (map) {
      if (this.#onMove) {
        map.off('mousemove', CITIES_FILL_LAYER_ID, this.#onMove);
      }
      if (this.#onLeave) {
        map.off('mouseleave', CITIES_FILL_LAYER_ID, this.#onLeave);
      }
      if (this.#onClick) {
        map.off('click', CITIES_FILL_LAYER_ID, this.#onClick);
      }
      if (this.#onZoomEnd) {
        map.off('zoomend', this.#onZoomEnd);
      }
    }

    if (this.#hoveredCityId != null && map) {
      map.setFeatureState({ source: CITIES_SOURCE_ID, id: this.#hoveredCityId }, { hover: false });
    }
    this.#popup?.remove();
    this.#hoveredCityId = undefined;
    this.#interactionsBound = false;

    if (map) {
      if (map.getLayer(CITIES_FILL_LAYER_ID)) {
        map.removeLayer(CITIES_FILL_LAYER_ID);
      }
      if (map.getLayer(CITIES_BORDER_LAYER_ID)) {
        map.removeLayer(CITIES_BORDER_LAYER_ID);
      }
      if (map.getSource(CITIES_SOURCE_ID)) {
        map.removeSource(CITIES_SOURCE_ID);
      }
    }

    this.#onMove = undefined;
    this.#onLeave = undefined;
    this.#onClick = undefined;
    this.#onZoomEnd = undefined;
    this.#detailViewActive = false;
    this.#map = undefined;
  }

  #ensureLayers(): void {
    const map = this.#map;
    if (!map) return;

    if (!map.getSource(CITIES_SOURCE_ID)) {
      map.addSource(CITIES_SOURCE_ID, {
        type: 'geojson',
        data: this.#geoJson,
        promoteId: 'id',
      });
    }

    if (!map.getLayer(CITIES_FILL_LAYER_ID)) {
      map.addLayer({
        id: CITIES_FILL_LAYER_ID,
        type: 'fill',
        source: CITIES_SOURCE_ID,
        paint: {
          'fill-color': adminFillColorExpression(),
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.92, 0.78],
        },
      });
    }

    if (!map.getLayer(CITIES_BORDER_LAYER_ID)) {
      map.addLayer({
        id: CITIES_BORDER_LAYER_ID,
        type: 'line',
        source: CITIES_SOURCE_ID,
        paint: {
          'line-color': 'rgba(15, 23, 42, 0.55)',
          'line-width': 1,
        },
      });
    }
  }

  #updateSourceData(): void {
    const map = this.#map;
    if (!map) return;

    const source = map.getSource(CITIES_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    source?.setData(this.#geoJson);
  }

  #bindInteractions(): void {
    const map = this.#map;
    if (!map || !this.#geoJson.features.length || this.#interactionsBound) {
      return;
    }

    this.#interactionsBound = true;

    this.#popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 8,
    });

    this.#onMove = (e: mapboxgl.MapMouseEvent) => {
      if (this.#isCityInteractionDisabled(map)) return;

      const feature = e.features?.[0];
      if (!feature) return;

      if (this.#hoveredCityId != null) {
        map.setFeatureState(
          { source: CITIES_SOURCE_ID, id: this.#hoveredCityId },
          { hover: false },
        );
      }

      this.#hoveredCityId = feature.id as string | number | undefined;
      if (this.#hoveredCityId != null) {
        map.setFeatureState({ source: CITIES_SOURCE_ID, id: this.#hoveredCityId }, { hover: true });
      }

      map.getCanvas().style.cursor = 'pointer';

      const center = getPolygonFeatureCenter(feature);
      if (!center) return;

      const name = feature.properties?.['name'] ?? 'Commune';
      const metricLabel = this.#formatActiveMetric(feature);

      this.#popup
        ?.setLngLat(center)
        .setHTML(`<div><strong>${name}</strong><br/><span>${metricLabel}</span></div>`)
        .addTo(map);
    };

    this.#onLeave = () => {
      map.getCanvas().style.cursor = '';
      this.#popup?.remove();

      if (this.#hoveredCityId != null) {
        map.setFeatureState(
          { source: CITIES_SOURCE_ID, id: this.#hoveredCityId },
          { hover: false },
        );
      }
      this.#hoveredCityId = undefined;
    };

    this.#onClick = (e: mapboxgl.MapMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;

      const city = this.#resolveCityFromFeature(feature);
      if (!city) return;

      const bounds = getPolygonFeatureBounds(feature);
      if (!bounds) return;

      this.#detailViewActive = true;
      this.#clearHoverState();
      this.onCitySelect?.(city);

      map.fitBounds(bounds, {
        padding: 48,
        duration: 800,
        maxZoom: 14,
      });

      map.once('moveend', () => {
        if (map.getZoom() < MAP_SECTIONS_MIN_ZOOM) {
          map.easeTo({
            center: bounds.getCenter(),
            zoom: MAP_SECTIONS_MIN_ZOOM,
            duration: 400,
          });
        }
      });
    };

    this.#onZoomEnd = () => {
      if (map.getZoom() < MAP_SECTIONS_MIN_ZOOM) {
        this.#detailViewActive = false;
      } else {
        this.#clearHoverState();
      }
    };

    map.on('mousemove', CITIES_FILL_LAYER_ID, this.#onMove);
    map.on('mouseleave', CITIES_FILL_LAYER_ID, this.#onLeave);
    map.on('click', CITIES_FILL_LAYER_ID, this.#onClick);
    map.on('zoomend', this.#onZoomEnd);
  }

  #resolveCityFromFeature(
    feature: GeoJSON.Feature,
  ): { id: number; name: string; code: string } | null {
    const props = feature.properties ?? {};
    const idRaw = feature.id ?? props['id'];
    const cityId = typeof idRaw === 'number' ? idRaw : idRaw != null ? Number(idRaw) : NaN;
    if (!Number.isFinite(cityId)) return null;

    let name = String(props['name'] ?? '');
    let code = String(props['code'] ?? '');

    if (!name || !code) {
      const match = this.#geoJson.features.find(
        (entry) => entry.id === cityId || entry.properties?.id === cityId,
      );
      if (match?.properties) {
        name = name || String(match.properties.name ?? '');
        code = code || String(match.properties.code ?? '');
      }
    }

    if (!code) return null;

    return {
      id: cityId,
      name: name || 'Commune',
      code,
    };
  }

  #isCityInteractionDisabled(map: mapboxgl.Map): boolean {
    return this.#detailViewActive || map.getZoom() >= MAP_SECTIONS_MIN_ZOOM;
  }

  #numberProperty(feature: GeoJSON.Feature, property: string): number | null {
    const raw = feature.properties?.[property];
    const value = typeof raw === 'number' ? raw : raw != null ? Number(raw) : null;
    return value != null && Number.isFinite(value) ? value : null;
  }

  #formatActiveMetric(feature: GeoJSON.Feature): string {
    if (this.#activeChoropleth === 'densite') {
      return formatDensity(this.#numberProperty(feature, 'densite'));
    }

    if (this.#activeChoropleth === 'criminalite') {
      return formatCriminality(this.#numberProperty(feature, 'criminaliteScore'));
    }

    if (this.#activeChoropleth === 'loyer') {
      return formatRent(this.#numberProperty(feature, 'loyerMedianApt'));
    }

    if (this.#activeChoropleth === 'qualite_air') {
      return formatAirQuality(this.#numberProperty(feature, 'indiceAtmoMedian'));
    }

    return formatPriceM2(this.#numberProperty(feature, 'prixMedianM2'));
  }

  #clearHoverState(): void {
    const map = this.#map;
    if (!map) return;

    map.getCanvas().style.cursor = '';
    this.#popup?.remove();

    if (this.#hoveredCityId != null) {
      map.setFeatureState({ source: CITIES_SOURCE_ID, id: this.#hoveredCityId }, { hover: false });
    }
    this.#hoveredCityId = undefined;
  }
}
