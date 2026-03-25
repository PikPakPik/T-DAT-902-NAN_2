import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import maplibregl from 'maplibre-gl';

declare global {
  interface Window {
    __MAP_READY?: boolean;
    __MAP_STATS?: Record<string, number | string>;
    __MAP_INSTANCE?: maplibregl.Map;
  }
}

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements AfterViewInit, OnDestroy {
  @ViewChild('mapRoot', { static: true })
  mapRoot!: ElementRef<HTMLDivElement>;

  status = 'Loading map...';
  dataset = '/data/cadastre-batiments.json';
  private readonly vectorTileset = 'https://openmaptiles.geo.data.gouv.fr/data/cadastre.json';
  private readonly departementsDataset = '/data/departements.geojson';
  private readonly communesDataset = '/data/communes.geojson';
  private map: maplibregl.Map | null = null;

  ngAfterViewInit(): void {
    const startedAt = performance.now();
    const q = new URLSearchParams(window.location.search);
    const dataUrl = q.get('source') === 'vector' ? this.vectorTileset : q.get('dataset') || '/data/cadastre-batiments.json';
    this.dataset = dataUrl;

    window.__MAP_READY = false;
    window.__MAP_STATS = {};

    let sourceLoaded = false;
    let idleRecorded = false;

    this.map = new maplibregl.Map({
      container: this.mapRoot.nativeElement,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [2.5, 46.7],
      zoom: 5.5,
      hash: true,
      attributionControl: false
    });

    window.__MAP_INSTANCE = this.map;

    this.map.addControl(new maplibregl.NavigationControl(), 'top-right');

    this.map.on('load', () => {
      window.__MAP_STATS!['mapLoadedMs'] = Number((performance.now() - startedAt).toFixed(2));
      this.status = 'Map loaded, loading hierarchical layers...';

      this.map!.addSource('departements', { type: 'geojson', data: this.departementsDataset });
      this.map!.addLayer({
        id: 'departements-fill',
        type: 'fill',
        source: 'departements',
        minzoom: 0,
        maxzoom: 7,
        paint: { 'fill-color': '#d3dfef', 'fill-opacity': 0.5 }
      });
      this.map!.addLayer({
        id: 'departements-line',
        type: 'line',
        source: 'departements',
        minzoom: 0,
        maxzoom: 8,
        paint: { 'line-color': '#2f4b67', 'line-width': 1.1 }
      });

      this.map!.addSource('communes', { type: 'geojson', data: this.communesDataset, tolerance: 0.5 });
      this.map!.addLayer({
        id: 'communes-line',
        type: 'line',
        source: 'communes',
        minzoom: 7,
        maxzoom: 11.5,
        paint: { 'line-color': '#567f92', 'line-width': 0.55 }
      });

      this.map!.addSource('cadastre', { type: 'vector', url: this.vectorTileset });
      this.map!.addLayer({
        id: 'sections-line',
        type: 'line',
        source: 'cadastre',
        'source-layer': 'sections',
        minzoom: 11,
        maxzoom: 14.5,
        paint: { 'line-color': '#b08a53', 'line-width': 0.8 }
      });
      this.map!.addLayer({
        id: 'parcelles-line',
        type: 'line',
        source: 'cadastre',
        'source-layer': 'parcelles',
        minzoom: 13,
        maxzoom: 16.5,
        paint: { 'line-color': '#8d6d3f', 'line-width': 0.45 }
      });
      this.map!.addLayer({
        id: 'batiments-fill',
        type: 'fill',
        source: 'cadastre',
        'source-layer': 'batiments',
        minzoom: 14,
        paint: { 'fill-color': '#c1472b', 'fill-opacity': 0.35 }
      });
      this.map!.addLayer({
        id: 'batiments-line',
        type: 'line',
        source: 'cadastre',
        'source-layer': 'batiments',
        minzoom: 14,
        paint: { 'line-color': '#6d1f12', 'line-width': 0.25 }
      });
    });

    this.map.on('sourcedata', (event) => {
      if (event.isSourceLoaded && !sourceLoaded) {
        sourceLoaded = true;
        window.__MAP_STATS!['sourceLoadedMs'] = Number((performance.now() - startedAt).toFixed(2));
        this.status = 'Polygons loaded.';
      }
    });

    this.map.on('idle', () => {
      if (!idleRecorded) {
        idleRecorded = true;
        if (!sourceLoaded) {
          sourceLoaded = true;
          window.__MAP_STATS!['sourceLoadedMs'] = Number((performance.now() - startedAt).toFixed(2));
        }
        window.__MAP_STATS!['firstIdleMs'] = Number((performance.now() - startedAt).toFixed(2));
        window.__MAP_READY = true;
        this.status = 'Ready for benchmark';
      }
    });
  }

  ngOnDestroy(): void {
    window.__MAP_READY = false;
    window.__MAP_INSTANCE = undefined;
    this.map?.remove();
  }
}
