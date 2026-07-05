import type { MapBounds } from './map-bounds.utils';
import {
  bboxesIntersect,
  buildFetchBounds,
  geometryBbox,
  isViewportCovered,
  unionMapBounds,
} from './map-bounds.utils';

type CacheableGeometry = GeoJSON.Point | GeoJSON.Polygon | GeoJSON.MultiPolygon;

type GeoJsonFeature<TGeometry extends CacheableGeometry> = GeoJSON.Feature<
  TGeometry,
  { id: number }
>;

type GeoJsonFeatureCollection<
  TGeometry extends CacheableGeometry,
  TProperties,
> = GeoJSON.FeatureCollection<TGeometry, TProperties>;

export class BoundsFeatureCache<
  TGeometry extends CacheableGeometry,
  TFeature extends GeoJsonFeature<TGeometry>,
> {
  readonly #featuresById = new Map<number, TFeature>();
  #loadedUnion?: MapBounds;

  isCovered(viewport: MapBounds): boolean {
    if (!this.#loadedUnion) return false;
    return isViewportCovered(viewport, [this.#loadedUnion]);
  }

  merge(fetchBounds: MapBounds, features: TFeature[]): void {
    for (const feature of features) {
      this.#featuresById.set(feature.properties.id, feature);
    }

    this.#loadedUnion = this.#loadedUnion
      ? unionMapBounds(this.#loadedUnion, fetchBounds)
      : fetchBounds;
  }

  /** Affiche tout ce qui intersecte la zone visible + marge (comme avant le cache). */
  collectionForDisplay(
    viewport: MapBounds,
    paddingRatio: number,
  ): GeoJsonFeatureCollection<TGeometry, TFeature['properties']> {
    return this.collectionForBounds(
      buildFetchBounds(viewport, paddingRatio),
    );
  }

  collectionForBounds(
    bounds: MapBounds,
  ): GeoJsonFeatureCollection<TGeometry, TFeature['properties']> {
    const features: TFeature[] = [];

    for (const feature of this.#featuresById.values()) {
      const bbox = geometryBbox(feature.geometry);
      if (bbox && bboxesIntersect(bbox, bounds)) {
        features.push(feature);
      }
    }

    return {
      type: 'FeatureCollection',
      features,
    };
  }
}
