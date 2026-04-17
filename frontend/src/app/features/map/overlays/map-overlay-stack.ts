import type * as mapboxgl from 'mapbox-gl';
import type { MapboxOverlay, MapOverlayContext } from './map-overlay.types';

/**
 * Registre d’overlays : la facade Mapbox n’empile plus la logique métier,
 * elle délègue à des classes dédiées (pays, régions, cadastre…).
 */
export class MapOverlayStack {
  readonly #factories: (() => MapboxOverlay)[] = [];
  #instances: MapboxOverlay[] = [];
  #ctx?: MapOverlayContext;

  register(factory: () => MapboxOverlay): void {
    this.#factories.push(factory);
  }

  mount(map: mapboxgl.Map, accessToken: string): void {
    this.destroy();
    this.#ctx = { map, accessToken };
    this.#instances = this.#factories.map((f) => f());
    for (const o of this.#instances) {
      o.attach(this.#ctx);
    }
  }

  /** À appeler après `map.setStyle(...)` une fois le nouveau style prêt. */
  onStyleChanged(): void {
    if (!this.#ctx) return;
    for (const o of this.#instances) {
      o.onStyleChanged(this.#ctx);
    }
  }

  destroy(): void {
    for (const o of this.#instances) {
      o.destroy();
    }
    this.#instances = [];
    this.#ctx = undefined;
  }
}
