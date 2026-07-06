import * as mapboxgl from 'mapbox-gl';
import {
  getPolygonFeatureBounds,
  getPolygonFeatureCenter,
} from '../map-overlay-geo';
import type { MapboxOverlay, MapOverlayContext } from '../map-overlay.types';
import { MAP_PLOTS_MIN_ZOOM } from '../../constants/map-view.constants';
import type { SectionsFeatureCollection } from '../../services/graphql/sections-graphql.service';
import {
  ADMIN_NO_DATA_COLOR,
  adminFillColorExpression,
  formatPriceM2,
} from '../shared/price-colors';
import type { MapFilterId } from '../../models/map-filter.model';

const SECTIONS_SOURCE_ID = 'sections-fr';
const SECTIONS_FILL_LAYER_ID = 'sections-fr-fill';
const SECTIONS_BORDER_LAYER_ID = 'sections-fr-borders';

const EMPTY_COLLECTION: SectionsFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

export type SectionSelectHandler = (sectionId: number) => void;

export class SectionsMapOverlay implements MapboxOverlay {
  #geoJson: SectionsFeatureCollection = EMPTY_COLLECTION;

  #map?: mapboxgl.Map;
  #popup?: mapboxgl.Popup;
  #hoveredSectionId?: string | number;
  #onMove?: (e: mapboxgl.MapMouseEvent) => void;
  #onLeave?: () => void;
  #onClick?: (e: mapboxgl.MapMouseEvent) => void;
  #onZoomEnd?: () => void;
  #detailViewActive = false;
  #interactionsBound = false;

  #activeChoropleth: MapFilterId = 'prix_m2';

  constructor(private readonly onSectionSelect?: SectionSelectHandler) {}

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

  setData(geoJson: SectionsFeatureCollection): void {
    this.#geoJson = geoJson;
    if (!this.#map) return;

    this.#ensureLayers();
    this.#updateSourceData();
    this.#bindInteractions();
  }

  /**
   * Le prix au m² est la seule métrique disponible à la granularité section
   * (densité/criminalité/loyer/qualité de l'air ne sont mesurées qu'au niveau commune).
   * Pour tout autre filtre, on affiche donc explicitement "pas de donnée" plutôt que
   * de rebasculer silencieusement sur le prix.
   */
  setChoropleth(key: MapFilterId): void {
    this.#activeChoropleth = key;
    const map = this.#map;
    if (!map || !map.getLayer(SECTIONS_FILL_LAYER_ID)) return;

    const expression =
      key === 'prix_m2' ? adminFillColorExpression() : ADMIN_NO_DATA_COLOR;

    map.setPaintProperty(SECTIONS_FILL_LAYER_ID, 'fill-color', expression);
  }

  destroy(): void {
    const map = this.#map;
    if (map) {
      if (this.#onMove) {
        map.off('mousemove', SECTIONS_FILL_LAYER_ID, this.#onMove);
      }
      if (this.#onLeave) {
        map.off('mouseleave', SECTIONS_FILL_LAYER_ID, this.#onLeave);
      }
      if (this.#onClick) {
        map.off('click', SECTIONS_FILL_LAYER_ID, this.#onClick);
      }
      if (this.#onZoomEnd) {
        map.off('zoomend', this.#onZoomEnd);
      }
    }

    if (this.#hoveredSectionId != null && map) {
      map.setFeatureState(
        { source: SECTIONS_SOURCE_ID, id: this.#hoveredSectionId },
        { hover: false },
      );
    }
    this.#popup?.remove();
    this.#hoveredSectionId = undefined;
    this.#interactionsBound = false;

    if (map) {
      if (map.getLayer(SECTIONS_FILL_LAYER_ID)) {
        map.removeLayer(SECTIONS_FILL_LAYER_ID);
      }
      if (map.getLayer(SECTIONS_BORDER_LAYER_ID)) {
        map.removeLayer(SECTIONS_BORDER_LAYER_ID);
      }
      if (map.getSource(SECTIONS_SOURCE_ID)) {
        map.removeSource(SECTIONS_SOURCE_ID);
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

    if (!map.getSource(SECTIONS_SOURCE_ID)) {
      map.addSource(SECTIONS_SOURCE_ID, {
        type: 'geojson',
        data: this.#geoJson,
        promoteId: 'id',
      });
    }

    if (!map.getLayer(SECTIONS_FILL_LAYER_ID)) {
      map.addLayer({
        id: SECTIONS_FILL_LAYER_ID,
        type: 'fill',
        source: SECTIONS_SOURCE_ID,
        paint: {
          'fill-color': adminFillColorExpression(),
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            0.92,
            0.78,
          ],
        },
      });
    }

    if (!map.getLayer(SECTIONS_BORDER_LAYER_ID)) {
      map.addLayer({
        id: SECTIONS_BORDER_LAYER_ID,
        type: 'line',
        source: SECTIONS_SOURCE_ID,
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

    const source = map.getSource(SECTIONS_SOURCE_ID) as
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
      if (this.#isSectionInteractionDisabled(map)) return;

      const feature = e.features?.[0];
      if (!feature) return;

      if (this.#hoveredSectionId != null) {
        map.setFeatureState(
          { source: SECTIONS_SOURCE_ID, id: this.#hoveredSectionId },
          { hover: false },
        );
      }

      this.#hoveredSectionId = feature.id as string | number | undefined;
      if (this.#hoveredSectionId != null) {
        map.setFeatureState(
          { source: SECTIONS_SOURCE_ID, id: this.#hoveredSectionId },
          { hover: true },
        );
      }

      map.getCanvas().style.cursor = 'pointer';

      const center = getPolygonFeatureCenter(feature);
      if (!center) return;

      const name = feature.properties?.['name'] ?? 'Section';
      const metricLabel = this.#formatActiveMetric(feature);

      this.#popup
        ?.setLngLat(center)
        .setHTML(
          `<div><strong>${name}</strong><br/><span>${metricLabel}</span></div>`,
        )
        .addTo(map);
    };

    this.#onLeave = () => {
      map.getCanvas().style.cursor = '';
      this.#popup?.remove();

      if (this.#hoveredSectionId != null) {
        map.setFeatureState(
          { source: SECTIONS_SOURCE_ID, id: this.#hoveredSectionId },
          { hover: false },
        );
      }
      this.#hoveredSectionId = undefined;
    };

    this.#onClick = (e: mapboxgl.MapMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;

      const sectionIdRaw = feature.properties?.['id'];
      const sectionId =
        typeof sectionIdRaw === 'number'
          ? sectionIdRaw
          : sectionIdRaw != null
            ? Number(sectionIdRaw)
            : null;
      if (sectionId == null || !Number.isFinite(sectionId)) return;

      const bounds = getPolygonFeatureBounds(feature);
      if (!bounds) return;

      this.#detailViewActive = true;
      this.#clearHoverState();
      this.onSectionSelect?.(sectionId);

      map.fitBounds(bounds, {
        padding: 48,
        duration: 800,
        maxZoom: 18,
      });

      map.once('moveend', () => {
        if (map.getZoom() < MAP_PLOTS_MIN_ZOOM) {
          map.easeTo({
            center: bounds.getCenter(),
            zoom: MAP_PLOTS_MIN_ZOOM,
            duration: 400,
          });
        }
      });
    };

    this.#onZoomEnd = () => {
      if (map.getZoom() < MAP_PLOTS_MIN_ZOOM) {
        this.#detailViewActive = false;
      } else {
        this.#clearHoverState();
      }
    };

    map.on('mousemove', SECTIONS_FILL_LAYER_ID, this.#onMove);
    map.on('mouseleave', SECTIONS_FILL_LAYER_ID, this.#onLeave);
    map.on('click', SECTIONS_FILL_LAYER_ID, this.#onClick);
    map.on('zoomend', this.#onZoomEnd);
  }

  #isSectionInteractionDisabled(map: mapboxgl.Map): boolean {
    return this.#detailViewActive || map.getZoom() >= MAP_PLOTS_MIN_ZOOM;
  }

  #formatActiveMetric(feature: GeoJSON.Feature): string {
    if (this.#activeChoropleth !== 'prix_m2') {
      return 'Donnée disponible au niveau commune uniquement';
    }

    const prixRaw = feature.properties?.['prixMedianM2'];
    const prix =
      typeof prixRaw === 'number' ? prixRaw : prixRaw != null ? Number(prixRaw) : null;
    return formatPriceM2(prix);
  }

  #clearHoverState(): void {
    const map = this.#map;
    if (!map) return;

    map.getCanvas().style.cursor = '';
    this.#popup?.remove();

    if (this.#hoveredSectionId != null) {
      map.setFeatureState(
        { source: SECTIONS_SOURCE_ID, id: this.#hoveredSectionId },
        { hover: false },
      );
    }
    this.#hoveredSectionId = undefined;
  }
}
