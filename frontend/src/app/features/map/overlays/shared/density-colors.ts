import type { ExpressionSpecification } from 'mapbox-gl';
import { ADMIN_NO_DATA_COLOR } from './price-colors';

/**
 * Stops on a log10 scale: [log10(hab/km²), color]
 * 0   → 1 hab/km²   (très rural)
 * 1   → 10 hab/km²
 * 2   → 100 hab/km²
 * 3   → 1 000 hab/km²
 * 4   → 10 000 hab/km² (centre Paris ~21 000)
 */
export const DENSITY_STOPS: readonly [number, string][] = [
  [0,   '#e8eaf6'],
  [1,   '#c5cae9'],
  [2,   '#7986cb'],
  [3,   '#3949ab'],
  [4,   '#1a237e'],
];

/** Légende lisible par l'utilisateur pour chaque palier. */
export const DENSITY_LEGEND: readonly { label: string; color: string }[] = [
  { label: '< 10 hab/km²',        color: '#e8eaf6' },
  { label: '10 – 100 hab/km²',    color: '#c5cae9' },
  { label: '100 – 1 000 hab/km²', color: '#7986cb' },
  { label: '1 000 – 10 000',      color: '#3949ab' },
  { label: '> 10 000 hab/km²',    color: '#1a237e' },
];

/** Expression Mapbox : gris sans données, sinon dégradé indigo sur échelle log. */
export function densityFillColorExpression(): ExpressionSpecification {
  return [
    'case',
    ['<=', ['coalesce', ['get', 'densite'], -1], 0],
    ADMIN_NO_DATA_COLOR,
    [
      'interpolate',
      ['linear'],
      ['log10', ['max', ['coalesce', ['get', 'densite'], 1], 1]],
      ...DENSITY_STOPS.flat(),
    ],
  ];
}
