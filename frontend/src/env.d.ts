export {};

declare global {
  interface Window {
    __env?: {
      MAPBOX_TOKEN?: string;
    };
  }
}

