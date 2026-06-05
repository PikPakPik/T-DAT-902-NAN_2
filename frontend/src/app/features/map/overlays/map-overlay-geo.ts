import * as mapboxgl from 'mapbox-gl';

/** Coordonnées imbriquées Polygon / MultiPolygon GeoJSON */
export type NestedCoordinates = [number, number] | NestedCoordinates[];

/** Bbox englobant un Polygon / MultiPolygon GeoJSON. */
export function getPolygonFeatureBounds(
  feature: mapboxgl.GeoJSONFeature,
): mapboxgl.LngLatBounds | null {
  const geometry = feature.geometry;

  const expandBounds = (
    coords: NestedCoordinates,
    bounds: mapboxgl.LngLatBounds,
  ): void => {
    for (const c of coords) {
      if (
        Array.isArray(c) &&
        c.length === 2 &&
        typeof c[0] === 'number' &&
        typeof c[1] === 'number'
      ) {
        bounds.extend([c[0], c[1]]);
      } else if (Array.isArray(c)) {
        expandBounds(c, bounds);
      }
    }
  };

  const bounds = new mapboxgl.LngLatBounds();

  if (geometry.type === 'Polygon') {
    expandBounds(geometry.coordinates as NestedCoordinates, bounds);
  } else if (geometry.type === 'MultiPolygon') {
    expandBounds(geometry.coordinates as NestedCoordinates, bounds);
  } else {
    return null;
  }

  return bounds.isEmpty() ? null : bounds;
}

/** Centre du bbox englobant un Polygon / MultiPolygon (popup, etc.). */
export function getPolygonFeatureCenter(
  feature: mapboxgl.GeoJSONFeature,
): mapboxgl.LngLatLike | null {
  return getPolygonFeatureBounds(feature)?.getCenter() ?? null;
}
