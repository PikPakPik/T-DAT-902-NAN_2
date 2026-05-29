import * as mapboxgl from 'mapbox-gl';
import { getPolygonFeatureCenter } from '../map-overlay-geo';
import type { MapboxOverlay, MapOverlayContext } from '../map-overlay.types';
import type { PlotsFeatureCollection } from '../../services/graphql/plots-graphql.service';
import {
  adminFillColorExpression,
  formatPriceM2,
} from '../shared/price-colors';

const PLOTS_SOURCE_ID = 'plots-fr';
const PLOTS_FILL_LAYER_ID = 'plots-fr-fill';
const PLOTS_BORDER_LAYER_ID = 'plots-fr-borders';

const EMPTY_COLLECTION: PlotsFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

export class PlotsMapOverlay implements MapboxOverlay {
  #geoJson: PlotsFeatureCollection = EMPTY_COLLECTION;

  #map?: mapboxgl.Map;
  #popup?: mapboxgl.Popup;
  #hoveredPlotId?: string | number;
  #onMove?: (e: mapboxgl.MapMouseEvent) => void;
  #onLeave?: () => void;
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

  setData(geoJson: PlotsFeatureCollection): void {
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
        map.off('mousemove', PLOTS_FILL_LAYER_ID, this.#onMove);
      }
      if (this.#onLeave) {
        map.off('mouseleave', PLOTS_FILL_LAYER_ID, this.#onLeave);
      }
    }

    if (this.#hoveredPlotId != null && map) {
      map.setFeatureState(
        { source: PLOTS_SOURCE_ID, id: this.#hoveredPlotId },
        { hover: false },
      );
    }
    this.#popup?.remove();
    this.#hoveredPlotId = undefined;
    this.#interactionsBound = false;

    if (map) {
      if (map.getLayer(PLOTS_FILL_LAYER_ID)) {
        map.removeLayer(PLOTS_FILL_LAYER_ID);
      }
      if (map.getLayer(PLOTS_BORDER_LAYER_ID)) {
        map.removeLayer(PLOTS_BORDER_LAYER_ID);
      }
      if (map.getSource(PLOTS_SOURCE_ID)) {
        map.removeSource(PLOTS_SOURCE_ID);
      }
    }

    this.#onMove = undefined;
    this.#onLeave = undefined;
    this.#map = undefined;
  }

  #ensureLayers(): void {
    const map = this.#map;
    if (!map) return;

    if (!map.getSource(PLOTS_SOURCE_ID)) {
      map.addSource(PLOTS_SOURCE_ID, {
        type: 'geojson',
        data: this.#geoJson,
        promoteId: 'id',
      });
    }

    if (!map.getLayer(PLOTS_FILL_LAYER_ID)) {
      map.addLayer({
        id: PLOTS_FILL_LAYER_ID,
        type: 'fill',
        source: PLOTS_SOURCE_ID,
        paint: {
          'fill-color': adminFillColorExpression(),
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            0.95,
            0.82,
          ],
        },
      });
    }

    if (!map.getLayer(PLOTS_BORDER_LAYER_ID)) {
      map.addLayer({
        id: PLOTS_BORDER_LAYER_ID,
        type: 'line',
        source: PLOTS_SOURCE_ID,
        paint: {
          'line-color': 'rgba(15, 23, 42, 0.65)',
          'line-width': 0.75,
        },
      });
    }
  }

  #updateSourceData(): void {
    const map = this.#map;
    if (!map) return;

    const source = map.getSource(PLOTS_SOURCE_ID) as
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
      const feature = e.features?.[0];
      if (!feature) return;

      if (this.#hoveredPlotId != null) {
        map.setFeatureState(
          { source: PLOTS_SOURCE_ID, id: this.#hoveredPlotId },
          { hover: false },
        );
      }

      this.#hoveredPlotId = feature.id as string | number | undefined;
      if (this.#hoveredPlotId != null) {
        map.setFeatureState(
          { source: PLOTS_SOURCE_ID, id: this.#hoveredPlotId },
          { hover: true },
        );
      }

      map.getCanvas().style.cursor = 'pointer';

      const center = getPolygonFeatureCenter(feature);
      if (!center) return;

      const name = feature.properties?.['name'] ?? 'Parcelle';
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

      if (this.#hoveredPlotId != null) {
        map.setFeatureState(
          { source: PLOTS_SOURCE_ID, id: this.#hoveredPlotId },
          { hover: false },
        );
      }
      this.#hoveredPlotId = undefined;
    };

    map.on('mousemove', PLOTS_FILL_LAYER_ID, this.#onMove);
    map.on('mouseleave', PLOTS_FILL_LAYER_ID, this.#onLeave);
  }
}
