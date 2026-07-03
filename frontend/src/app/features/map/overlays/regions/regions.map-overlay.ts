import * as mapboxgl from 'mapbox-gl';
import {
  getPolygonFeatureBounds,
  getPolygonFeatureCenter,
} from '../map-overlay-geo';
import type { MapboxOverlay, MapOverlayContext } from '../map-overlay.types';
import { MAP_DETAIL_MIN_ZOOM } from '../../constants/map-view.constants';
import type { RegionsFeatureCollection } from '../../services/graphql/regions-graphql.service';
import {
  adminFillColorExpression,
  formatPriceM2,
} from '../shared/price-colors';

const REGIONS_SOURCE_ID = 'regions-fr';
const REGIONS_FILL_LAYER_ID = 'regions-fr-fill';
const REGIONS_BORDER_LAYER_ID = 'regions-fr-borders';

/** Au-delà de ce zoom, les interactions région (popup, survol) sont désactivées. */
const REGION_OVERVIEW_MAX_ZOOM = MAP_DETAIL_MIN_ZOOM;

export class RegionsMapOverlay implements MapboxOverlay {
  readonly #geoJson: RegionsFeatureCollection;

  #map?: mapboxgl.Map;
  #popup?: mapboxgl.Popup;
  #hoveredRegionId?: string | number;
  #onMove?: (e: mapboxgl.MapMouseEvent) => void;
  #onLeave?: () => void;
  #onClick?: (e: mapboxgl.MapMouseEvent) => void;
  #onZoomEnd?: () => void;
  #detailViewActive = false;

  constructor(geoJson: RegionsFeatureCollection) {
    this.#geoJson = geoJson;
  }

  attach(ctx: MapOverlayContext): void {
    this.#map = ctx.map;
    this.#ensureLayers();
    this.#bindInteractions();
  }

  onStyleChanged(ctx: MapOverlayContext): void {
    this.destroy();
    this.attach(ctx);
  }

  setVisible(visible: boolean): void {
    const map = this.#map;
    if (!map) return;

    const visibility = visible ? 'visible' : 'none';
    if (map.getLayer(REGIONS_FILL_LAYER_ID)) {
      map.setLayoutProperty(REGIONS_FILL_LAYER_ID, 'visibility', visibility);
    }
    if (map.getLayer(REGIONS_BORDER_LAYER_ID)) {
      map.setLayoutProperty(REGIONS_BORDER_LAYER_ID, 'visibility', visibility);
    }
    if (!visible) {
      this.#clearHoverState();
    }
  }

  destroy(): void {
    const map = this.#map;
    if (map) {
      if (this.#onMove) {
        map.off('mousemove', REGIONS_FILL_LAYER_ID, this.#onMove);
      }
      if (this.#onLeave) {
        map.off('mouseleave', REGIONS_FILL_LAYER_ID, this.#onLeave);
      }
      if (this.#onClick) {
        map.off('click', REGIONS_FILL_LAYER_ID, this.#onClick);
      }
      if (this.#onZoomEnd) {
        map.off('zoomend', this.#onZoomEnd);
      }
    }

    if (this.#hoveredRegionId != null && map) {
      map.setFeatureState(
        { source: REGIONS_SOURCE_ID, id: this.#hoveredRegionId },
        { hover: false },
      );
    }
    this.#popup?.remove();
    this.#hoveredRegionId = undefined;

    if (map) {
      if (map.getLayer(REGIONS_FILL_LAYER_ID)) {
        map.removeLayer(REGIONS_FILL_LAYER_ID);
      }
      if (map.getLayer(REGIONS_BORDER_LAYER_ID)) {
        map.removeLayer(REGIONS_BORDER_LAYER_ID);
      }
      if (map.getSource(REGIONS_SOURCE_ID)) {
        map.removeSource(REGIONS_SOURCE_ID);
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
    if (!map || !this.#geoJson.features.length) return;

    if (!map.getSource(REGIONS_SOURCE_ID)) {
      map.addSource(REGIONS_SOURCE_ID, {
        type: 'geojson',
        data: this.#geoJson,
        promoteId: 'id',
      });
    }

    if (!map.getLayer(REGIONS_FILL_LAYER_ID)) {
      map.addLayer({
        id: REGIONS_FILL_LAYER_ID,
        type: 'fill',
        source: REGIONS_SOURCE_ID,
        paint: {
          'fill-color': adminFillColorExpression(),
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            0.85,
            0.65,
          ],
        },
      });
    }

    if (!map.getLayer(REGIONS_BORDER_LAYER_ID)) {
      map.addLayer({
        id: REGIONS_BORDER_LAYER_ID,
        type: 'line',
        source: REGIONS_SOURCE_ID,
        paint: {
          'line-color': 'rgba(15, 23, 42, 0.35)',
          'line-width': 1,
        },
      });
    }
  }

  #bindInteractions(): void {
    const map = this.#map;
    if (!map || !this.#geoJson.features.length) return;

    this.#popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 8,
    });

    this.#onMove = (e: mapboxgl.MapMouseEvent) => {
      if (this.#isRegionInteractionDisabled(map)) return;

      const feature = e.features?.[0];
      if (!feature) return;

      if (this.#hoveredRegionId != null) {
        map.setFeatureState(
          { source: REGIONS_SOURCE_ID, id: this.#hoveredRegionId },
          { hover: false },
        );
      }

      this.#hoveredRegionId = feature.id as string | number | undefined;
      if (this.#hoveredRegionId != null) {
        map.setFeatureState(
          { source: REGIONS_SOURCE_ID, id: this.#hoveredRegionId },
          { hover: true },
        );
      }

      map.getCanvas().style.cursor = 'pointer';

      const center = getPolygonFeatureCenter(feature);
      if (!center) return;

      const name = feature.properties?.['name'] ?? 'Région';
      const prixRaw = feature.properties?.['prixMedianM2'];
      const prix =
        typeof prixRaw === 'number'
          ? prixRaw
          : prixRaw != null
            ? Number(prixRaw)
            : null;
      const priceLabel = formatPriceM2(prix);

      this.#popup
        ?.setLngLat(center)
        .setHTML(
          `<div><strong>${name}</strong><br/><span>${priceLabel}</span></div>`,
        )
        .addTo(map);
    };

    this.#onLeave = () => {
      map.getCanvas().style.cursor = '';
      this.#popup?.remove();

      if (this.#hoveredRegionId != null) {
        map.setFeatureState(
          { source: REGIONS_SOURCE_ID, id: this.#hoveredRegionId },
          { hover: false },
        );
      }
      this.#hoveredRegionId = undefined;
    };

    this.#onClick = (e: mapboxgl.MapMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;

      const bounds = getPolygonFeatureBounds(feature);
      if (!bounds) return;

      this.#detailViewActive = true;
      this.#clearHoverState();

      map.fitBounds(bounds, {
        padding: 64,
        duration: 800,
        maxZoom: 9,
      });
    };

    this.#onZoomEnd = () => {
      if (map.getZoom() <= REGION_OVERVIEW_MAX_ZOOM) {
        this.#detailViewActive = false;
      } else {
        this.#clearHoverState();
      }
    };

    map.on('mousemove', REGIONS_FILL_LAYER_ID, this.#onMove);
    map.on('mouseleave', REGIONS_FILL_LAYER_ID, this.#onLeave);
    map.on('click', REGIONS_FILL_LAYER_ID, this.#onClick);
    map.on('zoomend', this.#onZoomEnd);
  }

  #isRegionInteractionDisabled(map: mapboxgl.Map): boolean {
    return this.#detailViewActive || map.getZoom() > REGION_OVERVIEW_MAX_ZOOM;
  }

  #clearHoverState(): void {
    const map = this.#map;
    if (!map) return;

    map.getCanvas().style.cursor = '';
    this.#popup?.remove();

    if (this.#hoveredRegionId != null) {
      map.setFeatureState(
        { source: REGIONS_SOURCE_ID, id: this.#hoveredRegionId },
        { hover: false },
      );
    }
    this.#hoveredRegionId = undefined;
  }
}
