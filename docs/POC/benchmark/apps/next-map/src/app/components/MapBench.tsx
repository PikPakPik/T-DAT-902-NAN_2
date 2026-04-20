'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

declare global {
  interface Window {
    __MAP_READY?: boolean;
    __MAP_STATS?: Record<string, number | string>;
    __MAP_INSTANCE?: maplibregl.Map;
  }
}

const DEFAULT_DATASET = '/data/cadastre-batiments.json';
const VECTOR_TILESET = 'https://openmaptiles.geo.data.gouv.fr/data/cadastre.json';
const DEPARTEMENTS_DATASET = '/data/departements.geojson';
const COMMUNES_DATASET = '/data/communes.geojson';

function datasetFromQuery(): string {
  if (typeof window === 'undefined') return DEFAULT_DATASET;
  const q = new URLSearchParams(window.location.search);
  if (q.get('source') === 'vector') return VECTOR_TILESET;
  return q.get('dataset') || DEFAULT_DATASET;
}

export default function MapBench() {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState('Loading map...');
  const [dataset, setDataset] = useState(DEFAULT_DATASET);

  useEffect(() => {
    if (!mapRef.current) return;

    const startedAt = performance.now();
    const dataUrl = datasetFromQuery();
    setDataset(dataUrl);

    window.__MAP_READY = false;
    window.__MAP_STATS = {};

    let sourceLoaded = false;
    let idleRecorded = false;

    const map = new maplibregl.Map({
      container: mapRef.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [2.5, 46.7],
      zoom: 5.5,
      hash: true,
      attributionControl: false
    });

    window.__MAP_INSTANCE = map;

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      window.__MAP_STATS!.mapLoadedMs = Number((performance.now() - startedAt).toFixed(2));
      setStatus('Map loaded, loading hierarchical layers...');

      map.addSource('departements', { type: 'geojson', data: DEPARTEMENTS_DATASET });
      map.addLayer({
        id: 'departements-fill',
        type: 'fill',
        source: 'departements',
        minzoom: 0,
        maxzoom: 7,
        paint: { 'fill-color': '#d3dfef', 'fill-opacity': 0.5 }
      });
      map.addLayer({
        id: 'departements-line',
        type: 'line',
        source: 'departements',
        minzoom: 0,
        maxzoom: 8,
        paint: { 'line-color': '#2f4b67', 'line-width': 1.1 }
      });

      map.addSource('communes', { type: 'geojson', data: COMMUNES_DATASET, tolerance: 0.5 });
      map.addLayer({
        id: 'communes-line',
        type: 'line',
        source: 'communes',
        minzoom: 7,
        maxzoom: 11.5,
        paint: { 'line-color': '#567f92', 'line-width': 0.55 }
      });

      map.addSource('cadastre', { type: 'vector', url: VECTOR_TILESET });
      map.addLayer({
        id: 'sections-line',
        type: 'line',
        source: 'cadastre',
        'source-layer': 'sections',
        minzoom: 11,
        maxzoom: 14.5,
        paint: { 'line-color': '#b08a53', 'line-width': 0.8 }
      });
      map.addLayer({
        id: 'parcelles-line',
        type: 'line',
        source: 'cadastre',
        'source-layer': 'parcelles',
        minzoom: 13,
        maxzoom: 16.5,
        paint: { 'line-color': '#8d6d3f', 'line-width': 0.45 }
      });
      map.addLayer({
        id: 'batiments-fill',
        type: 'fill',
        source: 'cadastre',
        'source-layer': 'batiments',
        minzoom: 14,
        paint: { 'fill-color': '#c1472b', 'fill-opacity': 0.35 }
      });
      map.addLayer({
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
        setStatus('Polygons loaded.');
      }
    });

    map.on('error', (event) => {
      const message =
        typeof event.error?.message === 'string' ? event.error.message : 'Map error while loading data';
      setStatus(`Error: ${message}`);
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
        setStatus('Ready for benchmark');
      }
    });

    return () => {
      window.__MAP_READY = false;
      window.__MAP_INSTANCE = undefined;
      map.remove();
    };
  }, []);

  return (
    <main className="bench-root">
      <div className="bench-topbar">
        <strong>Next.js benchmark</strong>
        <span>{status}</span>
        <code>{dataset}</code>
      </div>
      <div ref={mapRef} className="map-canvas" />
    </main>
  );
}
