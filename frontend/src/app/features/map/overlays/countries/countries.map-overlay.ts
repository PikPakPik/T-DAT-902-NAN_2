import * as mapboxgl from 'mapbox-gl';
import type { MapboxOverlay, MapOverlayContext } from '../map-overlay.types';

const COUNTRIES_SOURCE_ID = 'countries-world';
const COUNTRIES_FILL_LAYER_ID = 'countries-world-grey';
const COUNTRIES_BORDER_LAYER_ID = 'countries-world-borders';

type NestedCoordinates = [number, number] | NestedCoordinates[];

export class CountriesMapOverlay implements MapboxOverlay {
  #map?: mapboxgl.Map;
  #popup?: mapboxgl.Popup;
  #hoveredCountryId?: string | number;
  #onMove?: (e: mapboxgl.MapMouseEvent) => void;
  #onLeave?: () => void;

  attach(ctx: MapOverlayContext): void {
    this.#map = ctx.map;
    this.#ensureLayers();
    this.#bindInteractions();
  }

  onStyleChanged(ctx: MapOverlayContext): void {
    this.destroy();
    this.attach(ctx);
  }

  destroy(): void {
    const map = this.#map;
    if (map) {
      if (this.#onMove) {
        map.off('mousemove', COUNTRIES_FILL_LAYER_ID, this.#onMove);
      }
      if (this.#onLeave) {
        map.off('mouseleave', COUNTRIES_FILL_LAYER_ID, this.#onLeave);
      }
    }

    if (this.#hoveredCountryId != null && map) {
      map.setFeatureState(
        { source: COUNTRIES_SOURCE_ID, id: this.#hoveredCountryId },
        { hover: false },
      );
    }
    this.#popup?.remove();
    this.#hoveredCountryId = undefined;

    if (map) {
      if (map.getLayer(COUNTRIES_FILL_LAYER_ID)) {
        map.removeLayer(COUNTRIES_FILL_LAYER_ID);
      }
      if (map.getLayer(COUNTRIES_BORDER_LAYER_ID)) {
        map.removeLayer(COUNTRIES_BORDER_LAYER_ID);
      }
      if (map.getSource(COUNTRIES_SOURCE_ID)) {
        map.removeSource(COUNTRIES_SOURCE_ID);
      }
    }

    this.#onMove = undefined;
    this.#onLeave = undefined;
    this.#map = undefined;
  }

  #ensureLayers(): void {
    const map = this.#map;
    if (!map) return;

    if (!map.getSource(COUNTRIES_SOURCE_ID)) {
      map.addSource(COUNTRIES_SOURCE_ID, {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson',
        promoteId: 'ISO3166-1-Alpha-3',
      });
    }

    if (!map.getLayer(COUNTRIES_FILL_LAYER_ID)) {
      map.addLayer({
        id: COUNTRIES_FILL_LAYER_ID,
        type: 'fill',
        source: COUNTRIES_SOURCE_ID,
        paint: {
          'fill-color': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            'rgba(71, 85, 105, 1)',
            'rgba(148, 163, 184, 0.55)',
          ],
          'fill-opacity': 1,
        },
        filter: ['!=', ['get', 'name'], 'France'],
      });
    }

    if (!map.getLayer(COUNTRIES_BORDER_LAYER_ID)) {
      map.addLayer({
        id: COUNTRIES_BORDER_LAYER_ID,
        type: 'line',
        source: COUNTRIES_SOURCE_ID,
        paint: {
          'line-color': 'rgba(15, 23, 42, 0.45)',
          'line-width': 0.7,
        },
      });
    }
  }

  #bindInteractions(): void {
    const map = this.#map;
    if (!map) return;

    this.#popup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 8,
    });

    this.#onMove = (e: mapboxgl.MapMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;

      if (this.#hoveredCountryId != null) {
        map.setFeatureState(
          { source: COUNTRIES_SOURCE_ID, id: this.#hoveredCountryId },
          { hover: false },
        );
      }

      this.#hoveredCountryId = feature.id as string | number | undefined;
      if (this.#hoveredCountryId != null) {
        map.setFeatureState(
          { source: COUNTRIES_SOURCE_ID, id: this.#hoveredCountryId },
          { hover: true },
        );
      }

      map.getCanvas().style.cursor = 'pointer';

      const center = this.#getFeatureCenter(feature);
      if (!center) return;

      this.#popup
        ?.setLngLat(center)
        .setHTML('<div>Pas assez de données disponibles</div>')
        .addTo(map);
    };

    this.#onLeave = () => {
      map.getCanvas().style.cursor = '';
      this.#popup?.remove();

      if (this.#hoveredCountryId != null) {
        map.setFeatureState(
          { source: COUNTRIES_SOURCE_ID, id: this.#hoveredCountryId },
          { hover: false },
        );
      }
      this.#hoveredCountryId = undefined;
    };

    map.on('mousemove', COUNTRIES_FILL_LAYER_ID, this.#onMove);
    map.on('mouseleave', COUNTRIES_FILL_LAYER_ID, this.#onLeave);
  }

  #getFeatureCenter(feature: mapboxgl.GeoJSONFeature): mapboxgl.LngLatLike | null {
    const geometry = feature.geometry;

    const expandBounds = (coords: NestedCoordinates, bounds: mapboxgl.LngLatBounds): void => {
      for (const c of coords) {
        if (
          Array.isArray(c) &&
          c.length === 2 &&
          typeof c[0] === 'number' &&
          typeof c[1] === 'number'
        ) {
          bounds.extend([c[0], c[1]]);
        } else if (Array.isArray(c)) {
          expandBounds(c, bounds);
        }
      }
    };

    const bounds = new mapboxgl.LngLatBounds();

    if (geometry.type === 'Polygon') {
      expandBounds(geometry.coordinates as NestedCoordinates, bounds);
    } else if (geometry.type === 'MultiPolygon') {
      expandBounds(geometry.coordinates as NestedCoordinates, bounds);
    } else {
      return null;
    }

    if (!bounds.isEmpty()) {
      return bounds.getCenter();
    }

    return null;
  }
}
