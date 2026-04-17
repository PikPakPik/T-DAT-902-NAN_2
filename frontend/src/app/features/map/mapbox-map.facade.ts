import * as mapboxgl from 'mapbox-gl';
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';
import { CountriesMapOverlay } from './overlays/countries/countries.map-overlay';
import { MapOverlayStack } from './overlays/map-overlay-stack';

export class MapboxMapFacade {
  #map?: mapboxgl.Map;
  #marker?: mapboxgl.Marker;
  #geolocate?: mapboxgl.GeolocateControl;
  #geocoder?: MapboxGeocoder;
  #themeObserver?: MutationObserver;
  #overlayStack = new MapOverlayStack();

  constructor(private readonly token: string) {
    this.#overlayStack.register(() => new CountriesMapOverlay());
  }

  init(container: HTMLElement): void {
    if (!this.token) return;

    (mapboxgl as { setTelemetryEnabled?: (enabled: boolean) => void })
      .setTelemetryEnabled?.(false);

    this.#map = new mapboxgl.Map({
      container,
      accessToken: this.token,
      style: this.#styleForTheme(this.#isDarkMode()),
      center: [2.2137, 46.2276], // France
      zoom: 4.5,
      maxZoom: 20,
      attributionControl: true,
      performanceMetricsCollection: false,
    });

    this.#map.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      'top-left',
    );

    this.#geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
      showUserHeading: true,
      showUserLocation: true,
      fitBoundsOptions: { maxZoom: 16 },
    });
    this.#map.addControl(this.#geolocate, 'top-left');

    this.#geocoder = new MapboxGeocoder({
      accessToken: this.token,
      mapboxgl,
      marker: false,
      placeholder: 'Rechercher une adresse...',
      language: 'fr',
    });
    this.#map.addControl(this.#geocoder, 'top-right');

    this.#geocoder.on('result', (e: {
      result: {
        center?: [number, number];
        geometry?: { coordinates?: [number, number] };
      };
    }) => {
      const center = e.result.center ?? e.result.geometry?.coordinates;
      if (!center || center.length < 2 || !this.#map) return;
      const [lon, lat] = center;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
      if (!this.#marker) {
        this.#marker = new mapboxgl.Marker({ color: '#2563eb' })
          .setLngLat([lon, lat])
          .addTo(this.#map);
        return;
      }
      this.#marker.setLngLat([lon, lat]);
    });

    this.#map.on('load', () => {
      if (this.#map) {
        this.#overlayStack.mount(this.#map, this.token);
      }
    });

    this.#watchThemeChanges();
  }

  destroy(): void {
    this.#themeObserver?.disconnect();
    this.#marker?.remove();
    this.#overlayStack.destroy();
    if (this.#map && this.#geocoder) this.#map.removeControl(this.#geocoder);
    if (this.#map && this.#geolocate) this.#map.removeControl(this.#geolocate);
    this.#map?.remove();
  }

  #isDarkMode(): boolean {
    return document.documentElement.classList.contains('dark');
  }

  #styleForTheme(isDark: boolean): string {
    return isDark
      ? 'mapbox://styles/mapbox/dark-v11'
      : 'mapbox://styles/mapbox/light-v11';
  }

  #watchThemeChanges(): void {
    this.#themeObserver?.disconnect();
    this.#themeObserver = new MutationObserver(() => {
      const map = this.#map;
      if (!map) return;

      const center = map.getCenter();
      const zoom = map.getZoom();
      map.setStyle(this.#styleForTheme(this.#isDarkMode()));
      map.once('styledata', () => {
        map.setCenter(center);
        map.setZoom(zoom);
        this.#overlayStack.onStyleChanged();
      });
    });

    this.#themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }
}

