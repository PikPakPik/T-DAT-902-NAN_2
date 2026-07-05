export interface MapBounds {
  topLeftLng: number;
  topLeftLat: number;
  bottomRightLng: number;
  bottomRightLat: number;
}

/** Élargit les bounds visibles pour précharger les zones adjacentes. */
export function expandMapBounds(
  bounds: MapBounds,
  paddingRatio: number,
): MapBounds {
  const lngSpan = bounds.bottomRightLng - bounds.topLeftLng;
  const latSpan = bounds.topLeftLat - bounds.bottomRightLat;
  const lngPad = lngSpan * paddingRatio;
  const latPad = latSpan * paddingRatio;

  return {
    topLeftLng: bounds.topLeftLng - lngPad,
    topLeftLat: bounds.topLeftLat + latPad,
    bottomRightLng: bounds.bottomRightLng + lngPad,
    bottomRightLat: bounds.bottomRightLat - latPad,
  };
}

/** Fusionne deux emprises en une seule bbox englobante. */
export function unionMapBounds(a: MapBounds, b: MapBounds): MapBounds {
  return {
    topLeftLng: Math.min(a.topLeftLng, b.topLeftLng),
    topLeftLat: Math.max(a.topLeftLat, b.topLeftLat),
    bottomRightLng: Math.max(a.bottomRightLng, b.bottomRightLng),
    bottomRightLat: Math.min(a.bottomRightLat, b.bottomRightLat),
  };
}

/** Bounds envoyés au backend = viewport + marge de préchargement. */
export function buildFetchBounds(
  viewport: MapBounds,
  paddingRatio: number,
): MapBounds {
  return expandMapBounds(viewport, paddingRatio);
}

export interface GeoBbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

type NestedCoordinates = [number, number] | NestedCoordinates[];

export function isViewportCovered(
  viewport: MapBounds,
  loadedBounds: MapBounds[],
): boolean {
  return loadedBounds.some(
    (loaded) =>
      loaded.topLeftLng <= viewport.topLeftLng &&
      loaded.bottomRightLng >= viewport.bottomRightLng &&
      loaded.topLeftLat >= viewport.topLeftLat &&
      loaded.bottomRightLat <= viewport.bottomRightLat,
  );
}

export function bboxesIntersect(bbox: GeoBbox, viewport: MapBounds): boolean {
  return !(
    bbox.east < viewport.topLeftLng ||
    bbox.west > viewport.bottomRightLng ||
    bbox.north < viewport.bottomRightLat ||
    bbox.south > viewport.topLeftLat
  );
}

export function geometryBbox(
  geometry: GeoJSON.Point | GeoJSON.Polygon | GeoJSON.MultiPolygon,
): GeoBbox | null {
  if (geometry.type === 'Point') {
    const [lng, lat] = geometry.coordinates;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return { west: lng, south: lat, east: lng, north: lat };
  }

  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  const expand = (coords: NestedCoordinates): void => {
    for (const c of coords) {
      if (
        Array.isArray(c) &&
        c.length === 2 &&
        typeof c[0] === 'number' &&
        typeof c[1] === 'number'
      ) {
        west = Math.min(west, c[0]);
        east = Math.max(east, c[0]);
        south = Math.min(south, c[1]);
        north = Math.max(north, c[1]);
      } else if (Array.isArray(c)) {
        expand(c);
      }
    }
  };

  expand(geometry.coordinates as NestedCoordinates);

  if (!Number.isFinite(west)) return null;

  return { west, south, east, north };
}
