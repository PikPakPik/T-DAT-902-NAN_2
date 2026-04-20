<template>
  <main class="bench-root">
    <div class="bench-topbar">
      <strong>Nuxt benchmark</strong>
      <span>{{ status }}</span>
      <code>{{ dataset }}</code>
    </div>
    <div ref="mapEl" class="map-canvas"></div>
  </main>
</template>

<script setup lang="ts">
import maplibregl from 'maplibre-gl';
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const status = ref('Loading map...');
const dataset = ref('/data/cadastre-batiments.json');
const mapEl = ref<HTMLDivElement | null>(null);
let map: maplibregl.Map | null = null;
const VECTOR_TILESET = 'https://openmaptiles.geo.data.gouv.fr/data/cadastre.json';
const DEPARTEMENTS_DATASET = '/data/departements.geojson';
const COMMUNES_DATASET = '/data/communes.geojson';

function datasetFromQuery(): string {
  const q = new URLSearchParams(window.location.search);
  if (q.get('source') === 'vector') return VECTOR_TILESET;
  return q.get('dataset') || '/data/cadastre-batiments.json';
}

onMounted(async () => {
  status.value = 'Mounted, initializing map...';
  await nextTick();
  if (!mapEl.value) {
    status.value = 'Error: map container not found';
    return;
  }

  const startedAt = performance.now();
  const dataUrl = datasetFromQuery();
  dataset.value = dataUrl;

  window.__MAP_READY = false;
  window.__MAP_STATS = {};

  let sourceLoaded = false;
  let idleRecorded = false;

  try {
    map = new maplibregl.Map({
      container: mapEl.value,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [2.5, 46.7],
      zoom: 5.5,
      hash: true,
      attributionControl: false
    });
  } catch (error) {
    status.value = `Error: ${(error as Error).message}`;
    return;
  }

  window.__MAP_INSTANCE = map;

  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  map.on('load', () => {
    window.__MAP_STATS!.mapLoadedMs = Number((performance.now() - startedAt).toFixed(2));
    status.value = 'Map loaded, loading hierarchical layers...';

    map!.addSource('departements', { type: 'geojson', data: DEPARTEMENTS_DATASET });
    map!.addLayer({
      id: 'departements-fill',
      type: 'fill',
      source: 'departements',
      minzoom: 0,
      maxzoom: 7,
      paint: { 'fill-color': '#d3dfef', 'fill-opacity': 0.5 }
    });
    map!.addLayer({
      id: 'departements-line',
      type: 'line',
      source: 'departements',
      minzoom: 0,
      maxzoom: 8,
      paint: { 'line-color': '#2f4b67', 'line-width': 1.1 }
    });

    map!.addSource('communes', { type: 'geojson', data: COMMUNES_DATASET, tolerance: 0.5 });
    map!.addLayer({
      id: 'communes-line',
      type: 'line',
      source: 'communes',
      minzoom: 7,
      maxzoom: 11.5,
      paint: { 'line-color': '#567f92', 'line-width': 0.55 }
    });

    map!.addSource('cadastre', { type: 'vector', url: VECTOR_TILESET });
    map!.addLayer({
      id: 'sections-line',
      type: 'line',
      source: 'cadastre',
      'source-layer': 'sections',
      minzoom: 11,
      maxzoom: 14.5,
      paint: { 'line-color': '#b08a53', 'line-width': 0.8 }
    });
    map!.addLayer({
      id: 'parcelles-line',
      type: 'line',
      source: 'cadastre',
      'source-layer': 'parcelles',
      minzoom: 13,
      maxzoom: 16.5,
      paint: { 'line-color': '#8d6d3f', 'line-width': 0.45 }
    });
    map!.addLayer({
      id: 'batiments-fill',
      type: 'fill',
      source: 'cadastre',
      'source-layer': 'batiments',
      minzoom: 14,
      paint: { 'fill-color': '#c1472b', 'fill-opacity': 0.35 }
    });
    map!.addLayer({
      id: 'batiments-line',
      type: 'line',
      source: 'cadastre',
      'source-layer': 'batiments',
      minzoom: 14,
      paint: { 'line-color': '#6d1f12', 'line-width': 0.25 }
    });
  });

  map.on('sourcedata', (event) => {
    if (event.isSourceLoaded && !sourceLoaded) {
      sourceLoaded = true;
      window.__MAP_STATS!.sourceLoadedMs = Number((performance.now() - startedAt).toFixed(2));
      status.value = 'Polygons loaded.';
    }
  });

  map.on('idle', () => {
    if (!idleRecorded) {
      idleRecorded = true;
      if (!sourceLoaded) {
        sourceLoaded = true;
        window.__MAP_STATS!.sourceLoadedMs = Number((performance.now() - startedAt).toFixed(2));
      }
      window.__MAP_STATS!.firstIdleMs = Number((performance.now() - startedAt).toFixed(2));
      window.__MAP_READY = true;
      status.value = 'Ready for benchmark';
    }
  });

  map.on('error', (event) => {
    const message =
      typeof event.error?.message === 'string' ? event.error.message : 'Map error while loading data';
    status.value = `Error: ${message}`;
  });
});

onBeforeUnmount(() => {
  window.__MAP_READY = false;
  window.__MAP_INSTANCE = undefined;
  map?.remove();
});
</script>
