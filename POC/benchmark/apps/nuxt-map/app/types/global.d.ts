export {};

declare global {
  interface Window {
    __MAP_READY?: boolean;
    __MAP_STATS?: Record<string, number | string>;
    __MAP_INSTANCE?: import('maplibre-gl').Map;
  }
}
