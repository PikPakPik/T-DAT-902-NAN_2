import type * as mapboxgl from 'mapbox-gl';

/** Contexte commun passé à chaque overlay (extensible). */
export interface MapOverlayContext {
  map: mapboxgl.Map;
  accessToken: string;
}

/**
 * Overlay = une couche métier sur la carte (pays, régions, cadastre, parcelles…).
 * Implémentations : classes TS pures, sans décorateur Angular.
 */
export interface MapboxOverlay {
  /** Appelé une fois la map prête (souvent après `load`). */
  attach(ctx: MapOverlayContext): void;

  /** Appelé quand le style Mapbox change (les layers/sources sont recréées). */
  onStyleChanged(ctx: MapOverlayContext): void;

  /** Nettoyage (listeners, markers, etc.). */
  destroy(): void;
}
