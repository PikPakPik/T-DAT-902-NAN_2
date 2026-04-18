import * as mapboxgl from 'mapbox-gl';
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';
import { CountriesMapOverlay } from './overlays/countries/countries.map-overlay';
import { MapOverlayStack } from './overlays/map-overlay-stack';

const MAP_STYLE = 'mapbox://styles/mapbox/streets-v12';

export class MapboxMapFacade {
  #map?: mapboxgl.Map;
  #marker?: mapboxgl.Marker;
  #geolocate?: mapboxgl.GeolocateControl;
  #geocoder?: MapboxGeocoder;
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
      style: MAP_STYLE,
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
  }

  destroy(): void {
    this.#marker?.remove();
    this.#overlayStack.destroy();
    if (this.#map && this.#geocoder) this.#map.removeControl(this.#geocoder);
    if (this.#map && this.#geolocate) this.#map.removeControl(this.#geolocate);
    this.#map?.remove();
  }
}
