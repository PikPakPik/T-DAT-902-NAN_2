import * as mapboxgl from 'mapbox-gl';
import type { ExpressionSpecification } from 'mapbox-gl';
import type { DevicesFeatureCollection } from '../../services/graphql/devices-graphql.service';
import type { MapboxOverlay, MapOverlayContext } from '../map-overlay.types';

const DEVICES_SOURCE_ID = 'devices-bpe';
const DEVICES_CLUSTER_LAYER_ID = 'devices-bpe-clusters';
const DEVICES_CLUSTER_COUNT_LAYER_ID = 'devices-bpe-cluster-count';
const DEVICES_POINT_LAYER_ID = 'devices-bpe-points';
const DEVICES_ICON_LAYER_ID = 'devices-bpe-icons';

const EMPTY_COLLECTION: DevicesFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

function deviceColorExpression(): ExpressionSpecification {
  return [
    'match',
    ['get', 'family'],
    'services',
    '#2563eb',
    'commerce',
    '#dc2626',
    'education',
    '#7c3aed',
    'health',
    '#16a34a',
    'transport',
    '#0891b2',
    'sport',
    '#ea580c',
    'culture',
    '#be185d',
    '#475569',
  ];
}

function deviceIconExpression(): ExpressionSpecification {
  return [
    'match',
    ['get', 'family'],
    'services',
    'town-hall-15',
    'commerce',
    'shop-15',
    'education',
    'school-15',
    'health',
    'hospital-15',
    'transport',
    'rail-15',
    'sport',
    'soccer-15',
    'culture',
    'museum-15',
    'marker-15',
  ];
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export class DevicesMapOverlay implements MapboxOverlay {
  #geoJson: DevicesFeatureCollection = EMPTY_COLLECTION;
  #map?: mapboxgl.Map;
  #popup?: mapboxgl.Popup;
  #onClickPoint?: (e: mapboxgl.MapMouseEvent) => void;
  #onClickCluster?: (e: mapboxgl.MapMouseEvent) => void;
  #onEnter?: () => void;
  #onLeave?: () => void;
  #interactionsBound = false;

  attach(ctx: MapOverlayContext): void {
    this.#map = ctx.map;
    this.#ensureLayers();
  }

  onStyleChanged(ctx: MapOverlayContext): void {
    this.destroy();
    this.attach(ctx);
    this.setData(this.#geoJson);
  }

  setData(geoJson: DevicesFeatureCollection): void {
    this.#geoJson = geoJson;
    if (!this.#map) return;
    this.#ensureLayers();
    this.#updateSourceData();
    this.#bindInteractions();
  }

  destroy(): void {
    const map = this.#map;
    if (map) {
      if (this.#onClickPoint) {
        map.off('click', DEVICES_POINT_LAYER_ID, this.#onClickPoint);
      }
      if (this.#onClickCluster) {
        map.off('click', DEVICES_CLUSTER_LAYER_ID, this.#onClickCluster);
      }
      if (this.#onEnter) {
        map.off('mouseenter', DEVICES_POINT_LAYER_ID, this.#onEnter);
        map.off('mouseenter', DEVICES_CLUSTER_LAYER_ID, this.#onEnter);
      }
      if (this.#onLeave) {
        map.off('mouseleave', DEVICES_POINT_LAYER_ID, this.#onLeave);
        map.off('mouseleave', DEVICES_CLUSTER_LAYER_ID, this.#onLeave);
      }

      for (const layer of [
        DEVICES_ICON_LAYER_ID,
        DEVICES_POINT_LAYER_ID,
        DEVICES_CLUSTER_COUNT_LAYER_ID,
        DEVICES_CLUSTER_LAYER_ID,
      ]) {
        if (map.getLayer(layer)) map.removeLayer(layer);
      }
      if (map.getSource(DEVICES_SOURCE_ID)) map.removeSource(DEVICES_SOURCE_ID);
    }

    this.#popup?.remove();
    this.#popup = undefined;
    this.#onClickPoint = undefined;
    this.#onClickCluster = undefined;
    this.#onEnter = undefined;
    this.#onLeave = undefined;
    this.#interactionsBound = false;
    this.#map = undefined;
  }

  #ensureLayers(): void {
    const map = this.#map;
    if (!map) return;

    if (!map.getSource(DEVICES_SOURCE_ID)) {
      map.addSource(DEVICES_SOURCE_ID, {
        type: 'geojson',
        data: this.#geoJson,
        promoteId: 'id',
        cluster: true,
        clusterMaxZoom: 15,
        clusterRadius: 46,
      });
    }

    if (!map.getLayer(DEVICES_CLUSTER_LAYER_ID)) {
      map.addLayer({
        id: DEVICES_CLUSTER_LAYER_ID,
        type: 'circle',
        source: DEVICES_SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#0f766e',
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            16,
            25,
            21,
            100,
            28,
          ],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-opacity': 0.92,
        },
      });
    }

    if (!map.getLayer(DEVICES_CLUSTER_COUNT_LAYER_ID)) {
      map.addLayer({
        id: DEVICES_CLUSTER_COUNT_LAYER_ID,
        type: 'symbol',
        source: DEVICES_SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 12,
        },
        paint: {
          'text-color': '#ffffff',
        },
      });
    }

    if (!map.getLayer(DEVICES_POINT_LAYER_ID)) {
      map.addLayer({
        id: DEVICES_POINT_LAYER_ID,
        type: 'circle',
        source: DEVICES_SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': deviceColorExpression(),
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 4, 17, 7],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
          'circle-opacity': 0.94,
        },
      });
    }

    if (!map.getLayer(DEVICES_ICON_LAYER_ID)) {
      map.addLayer({
        id: DEVICES_ICON_LAYER_ID,
        type: 'symbol',
        source: DEVICES_SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        minzoom: 15,
        layout: {
          'icon-image': deviceIconExpression(),
          'icon-size': ['interpolate', ['linear'], ['zoom'], 13, 0.72, 17, 0.95],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: {
          'icon-color': '#ffffff',
          'icon-halo-color': 'rgba(15, 23, 42, 0.28)',
          'icon-halo-width': 1,
        },
      });
    }
  }

  #updateSourceData(): void {
    const source = this.#map?.getSource(DEVICES_SOURCE_ID) as
      | mapboxgl.GeoJSONSource
      | undefined;
    source?.setData(this.#geoJson);
  }

  #bindInteractions(): void {
    const map = this.#map;
    if (!map || this.#interactionsBound) return;
    this.#interactionsBound = true;

    this.#popup = new mapboxgl.Popup({
      closeButton: true,
      closeOnClick: true,
      offset: 12,
    });

    this.#onClickPoint = (e: mapboxgl.MapMouseEvent) => {
      const feature = e.features?.[0];
      const coordinates = (feature?.geometry as GeoJSON.Point | undefined)
        ?.coordinates as [number, number] | undefined;
      if (!feature?.properties || !coordinates) return;

      const p = feature.properties;
      this.#popup
        ?.setLngLat(coordinates)
        .setHTML(
          `<div class="device-popup">
            <strong>${escapeHtml(p['nom'])}</strong>
            <span>${escapeHtml(p['familyLabel'])}</span>
            <small>${escapeHtml(p['typequ'])}</small>
            <small>${escapeHtml(p['address'])}</small>
          </div>`,
        )
        .addTo(map);
    };

    this.#onClickCluster = (e: mapboxgl.MapMouseEvent) => {
      const feature = e.features?.[0];
      const clusterId = feature?.properties?.['cluster_id'];
      const source = map.getSource(DEVICES_SOURCE_ID) as mapboxgl.GeoJSONSource;
      const coordinates = (feature?.geometry as GeoJSON.Point | undefined)
        ?.coordinates as [number, number] | undefined;
      if (clusterId == null || !coordinates) return;

      source.getClusterExpansionZoom(Number(clusterId), (error, zoom) => {
        if (error || zoom == null) return;
        map.easeTo({
          center: coordinates,
          zoom,
          duration: 450,
          essential: true,
        });
      });
    };

    this.#onEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    this.#onLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', DEVICES_POINT_LAYER_ID, this.#onClickPoint);
    map.on('click', DEVICES_CLUSTER_LAYER_ID, this.#onClickCluster);
    map.on('mouseenter', DEVICES_POINT_LAYER_ID, this.#onEnter);
    map.on('mouseenter', DEVICES_CLUSTER_LAYER_ID, this.#onEnter);
    map.on('mouseleave', DEVICES_POINT_LAYER_ID, this.#onLeave);
    map.on('mouseleave', DEVICES_CLUSTER_LAYER_ID, this.#onLeave);
  }
}
