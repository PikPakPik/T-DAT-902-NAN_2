import * as mapboxgl from 'mapbox-gl';
import {
  getPolygonFeatureBounds,
  getPolygonFeatureCenter,
} from '../map-overlay-geo';
import type { MapboxOverlay, MapOverlayContext } from '../map-overlay.types';
import { MAP_CITIES_MIN_ZOOM } from '../../constants/map-view.constants';
import type { DepartmentsFeatureCollection } from '../../services/graphql/departments-graphql.service';
import {
  adminFillColorExpression,
  formatPriceM2,
} from '../shared/price-colors';

const DEPARTMENTS_SOURCE_ID = 'departments-fr';
const DEPARTMENTS_FILL_LAYER_ID = 'departments-fr-fill';
const DEPARTMENTS_BORDER_LAYER_ID = 'departments-fr-borders';

const EMPTY_COLLECTION: DepartmentsFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

export class DepartmentsMapOverlay implements MapboxOverlay {
  #geoJson: DepartmentsFeatureCollection = EMPTY_COLLECTION;

  #map?: mapboxgl.Map;
  #popup?: mapboxgl.Popup;
  #hoveredDepartmentId?: string | number;
  #onMove?: (e: mapboxgl.MapMouseEvent) => void;
  #onLeave?: () => void;
  #onClick?: (e: mapboxgl.MapMouseEvent) => void;
  #onZoomEnd?: () => void;
  #detailViewActive = false;
  #interactionsBound = false;

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
  }

  setData(geoJson: DepartmentsFeatureCollection): void {
    this.#geoJson = geoJson;
    if (!this.#map) return;

    this.#ensureLayers();
    this.#updateSourceData();
    this.#bindInteractions();
  }

  destroy(): void {
    const map = this.#map;
    if (map) {
      if (this.#onMove) {
        map.off('mousemove', DEPARTMENTS_FILL_LAYER_ID, this.#onMove);
      }
      if (this.#onLeave) {
        map.off('mouseleave', DEPARTMENTS_FILL_LAYER_ID, this.#onLeave);
      }
      if (this.#onClick) {
        map.off('click', DEPARTMENTS_FILL_LAYER_ID, this.#onClick);
      }
      if (this.#onZoomEnd) {
        map.off('zoomend', this.#onZoomEnd);
      }
    }

    if (this.#hoveredDepartmentId != null && map) {
      map.setFeatureState(
        { source: DEPARTMENTS_SOURCE_ID, id: this.#hoveredDepartmentId },
        { hover: false },
      );
    }
    this.#popup?.remove();
    this.#hoveredDepartmentId = undefined;
    this.#interactionsBound = false;

    if (map) {
      if (map.getLayer(DEPARTMENTS_FILL_LAYER_ID)) {
        map.removeLayer(DEPARTMENTS_FILL_LAYER_ID);
      }
      if (map.getLayer(DEPARTMENTS_BORDER_LAYER_ID)) {
        map.removeLayer(DEPARTMENTS_BORDER_LAYER_ID);
      }
      if (map.getSource(DEPARTMENTS_SOURCE_ID)) {
        map.removeSource(DEPARTMENTS_SOURCE_ID);
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

    if (!map.getSource(DEPARTMENTS_SOURCE_ID)) {
      map.addSource(DEPARTMENTS_SOURCE_ID, {
        type: 'geojson',
        data: this.#geoJson,
        promoteId: 'id',
      });
    }

    if (!map.getLayer(DEPARTMENTS_FILL_LAYER_ID)) {
      map.addLayer({
        id: DEPARTMENTS_FILL_LAYER_ID,
        type: 'fill',
        source: DEPARTMENTS_SOURCE_ID,
        paint: {
          'fill-color': adminFillColorExpression(),
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            0.9,
            0.75,
          ],
        },
      });
    }

    if (!map.getLayer(DEPARTMENTS_BORDER_LAYER_ID)) {
      map.addLayer({
        id: DEPARTMENTS_BORDER_LAYER_ID,
        type: 'line',
        source: DEPARTMENTS_SOURCE_ID,
        paint: {
          'line-color': 'rgba(15, 23, 42, 0.5)',
          'line-width': 1.5,
        },
      });
    }
  }

  #updateSourceData(): void {
    const map = this.#map;
    if (!map) return;

    const source = map.getSource(DEPARTMENTS_SOURCE_ID) as
      | mapboxgl.GeoJSONSource
      | undefined;
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
      if (this.#isDepartmentInteractionDisabled(map)) return;

      const feature = e.features?.[0];
      if (!feature) return;

      if (this.#hoveredDepartmentId != null) {
        map.setFeatureState(
          { source: DEPARTMENTS_SOURCE_ID, id: this.#hoveredDepartmentId },
          { hover: false },
        );
      }

      this.#hoveredDepartmentId = feature.id as string | number | undefined;
      if (this.#hoveredDepartmentId != null) {
        map.setFeatureState(
          { source: DEPARTMENTS_SOURCE_ID, id: this.#hoveredDepartmentId },
          { hover: true },
        );
      }

      map.getCanvas().style.cursor = 'pointer';

      const center = getPolygonFeatureCenter(feature);
      if (!center) return;

      const name = feature.properties?.['name'] ?? 'Département';
      const prixRaw = feature.properties?.['prixMedianM2'];
      const prix =
        typeof prixRaw === 'number'
          ? prixRaw
          : prixRaw != null
            ? Number(prixRaw)
            : null;

      this.#popup
        ?.setLngLat(center)
        .setHTML(
          `<div><strong>${name}</strong><br/><span>${formatPriceM2(prix)}</span></div>`,
        )
        .addTo(map);
    };

    this.#onLeave = () => {
      map.getCanvas().style.cursor = '';
      this.#popup?.remove();

      if (this.#hoveredDepartmentId != null) {
        map.setFeatureState(
          { source: DEPARTMENTS_SOURCE_ID, id: this.#hoveredDepartmentId },
          { hover: false },
        );
      }
      this.#hoveredDepartmentId = undefined;
    };

    this.#onClick = (e: mapboxgl.MapMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;

      const bounds = getPolygonFeatureBounds(feature);
      if (!bounds) return;

      this.#detailViewActive = true;
      this.#clearHoverState();

      map.fitBounds(bounds, {
        padding: 48,
        duration: 800,
        maxZoom: 12,
      });

      map.once('moveend', () => {
        if (map.getZoom() < MAP_CITIES_MIN_ZOOM) {
          map.easeTo({
            center: bounds.getCenter(),
            zoom: MAP_CITIES_MIN_ZOOM,
            duration: 400,
          });
        }
      });
    };

    this.#onZoomEnd = () => {
      if (map.getZoom() < MAP_CITIES_MIN_ZOOM) {
        this.#detailViewActive = false;
      } else {
        this.#clearHoverState();
      }
    };

    map.on('mousemove', DEPARTMENTS_FILL_LAYER_ID, this.#onMove);
    map.on('mouseleave', DEPARTMENTS_FILL_LAYER_ID, this.#onLeave);
    map.on('click', DEPARTMENTS_FILL_LAYER_ID, this.#onClick);
    map.on('zoomend', this.#onZoomEnd);
  }

  #isDepartmentInteractionDisabled(map: mapboxgl.Map): boolean {
    return this.#detailViewActive || map.getZoom() >= MAP_CITIES_MIN_ZOOM;
  }

  #clearHoverState(): void {
    const map = this.#map;
    if (!map) return;

    map.getCanvas().style.cursor = '';
    this.#popup?.remove();

    if (this.#hoveredDepartmentId != null) {
      map.setFeatureState(
        { source: DEPARTMENTS_SOURCE_ID, id: this.#hoveredDepartmentId },
        { hover: false },
      );
    }
    this.#hoveredDepartmentId = undefined;
  }
}
