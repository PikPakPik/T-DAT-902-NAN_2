import * as mapboxgl from 'mapbox-gl';
import { getPolygonFeatureCenter } from '../map-overlay-geo';
import type { MapboxOverlay, MapOverlayContext } from '../map-overlay.types';
import type { ExpressionSpecification } from 'mapbox-gl';
import type { PlotsFeatureCollection } from '../../services/graphql/plots-graphql.service';

const PLOTS_SOURCE_ID = 'plots-fr';
const PLOTS_FILL_LAYER_ID = 'plots-fr-fill';
const PLOTS_BORDER_LAYER_ID = 'plots-fr-borders';
const PLOTS_SALE_LABEL_LAYER_ID = 'plots-fr-sale-labels';
const PLOT_SELECT_MIN_ZOOM = 18.5;

const EMPTY_COLLECTION: PlotsFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

export type PlotSelectFn = (plotId: number) => void;

function plotFillColorExpression(): ExpressionSpecification {
  return [
    'case',
    ['boolean', ['get', 'hasSale'], false],
    'rgba(168, 85, 247, 0.72)',
    'rgba(255, 255, 255, 0.08)',
  ];
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return 'Vente DVF';
  }
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

export class PlotsMapOverlay implements MapboxOverlay {
  #geoJson: PlotsFeatureCollection = EMPTY_COLLECTION;

  #map?: mapboxgl.Map;
  #popup?: mapboxgl.Popup;
  #hoveredPlotId?: string | number;
  #onMove?: (e: mapboxgl.MapMouseEvent) => void;
  #onClick?: (e: mapboxgl.MapMouseEvent) => void;
  #onLeave?: () => void;
  #interactionsBound = false;

  constructor(private readonly onPlotSelect?: PlotSelectFn) {}

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
      if (this.#onClick) {
        map.off('click', PLOTS_FILL_LAYER_ID, this.#onClick);
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
      if (map.getLayer(PLOTS_SALE_LABEL_LAYER_ID)) {
        map.removeLayer(PLOTS_SALE_LABEL_LAYER_ID);
      }
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
    this.#onClick = undefined;
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
          'fill-color': plotFillColorExpression(),
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

    if (!map.getLayer(PLOTS_SALE_LABEL_LAYER_ID)) {
      map.addLayer({
        id: PLOTS_SALE_LABEL_LAYER_ID,
        type: 'symbol',
        source: PLOTS_SOURCE_ID,
        filter: ['all', ['==', ['get', 'hasSale'], true], ['has', 'maxSaleLabel']],
        layout: {
          'text-field': ['get', 'maxSaleLabel'],
          'text-size': 12,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': '#111827',
          'text-halo-color': '#ffffff',
          'text-halo-width': 6,
          'text-halo-blur': 0,
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

      const maxSaleRaw = feature.properties?.['maxSaleAmount'];
      const maxSale =
        typeof maxSaleRaw === 'number'
          ? maxSaleRaw
          : maxSaleRaw != null
            ? Number(maxSaleRaw)
            : null;

      this.#popup
        ?.setLngLat(center)
        .setHTML(
          `<div class="plot-sale-tooltip">${formatCurrency(maxSale)}</div>`,
        )
        .addTo(map);
    };

    this.#onClick = (e: mapboxgl.MapMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;

      const rawId = feature?.properties?.['id'] ?? feature?.id;
      const plotId = typeof rawId === 'number' ? rawId : Number(rawId);
      if (!Number.isFinite(plotId)) return;

      const center = getPolygonFeatureCenter(feature);
      if (center) {
        map.easeTo({
          center,
          zoom: Math.min(Math.max(map.getZoom(), PLOT_SELECT_MIN_ZOOM), 20),
          duration: 650,
          essential: true,
        });
      }

      this.onPlotSelect?.(plotId);
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
    map.on('click', PLOTS_FILL_LAYER_ID, this.#onClick);
    map.on('mouseleave', PLOTS_FILL_LAYER_ID, this.#onLeave);
  }
}
