import type { ExpressionSpecification } from 'mapbox-gl';
import { ADMIN_NO_DATA_COLOR } from './price-colors';

export const CRIMINALITY_STOPS: readonly [number, string][] = [
  [0, '#fff7ed'],
  [25, '#fed7aa'],
  [50, '#fb923c'],
  [90, '#dc2626'],
  [140, '#7f1d1d'],
];

export const CRIMINALITY_LEGEND: readonly { label: string; color: string }[] = [
  { label: '< 25', color: '#fed7aa' },
  { label: '25 - 50', color: '#fb923c' },
  { label: '50 - 90', color: '#f97316' },
  { label: '90 - 140', color: '#dc2626' },
  { label: '> 140', color: '#7f1d1d' },
];

export function criminalityFillColorExpression(): ExpressionSpecification {
  return [
    'case',
    ['<=', ['coalesce', ['get', 'criminaliteScore'], -1], 0],
    ADMIN_NO_DATA_COLOR,
    [
      'interpolate',
      ['linear'],
      ['coalesce', ['get', 'criminaliteScore'], 0],
      ...CRIMINALITY_STOPS.flat(),
    ],
  ];
}
