import type { ExpressionSpecification } from 'mapbox-gl';
import { ADMIN_NO_DATA_COLOR } from './price-colors';

export const RENT_STOPS: readonly [number, string][] = [
  [6, '#ecfdf5'],
  [9, '#86efac'],
  [12, '#22c55e'],
  [16, '#eab308'],
  [22, '#dc2626'],
];

export const RENT_LEGEND: readonly { label: string; color: string }[] = [
  { label: '< 9 €/m²', color: '#86efac' },
  { label: '9 - 12 €/m²', color: '#22c55e' },
  { label: '12 - 16 €/m²', color: '#eab308' },
  { label: '16 - 22 €/m²', color: '#f97316' },
  { label: '> 22 €/m²', color: '#dc2626' },
];

export function rentFillColorExpression(): ExpressionSpecification {
  return [
    'case',
    ['<=', ['coalesce', ['get', 'loyerMedianApt'], -1], 0],
    ADMIN_NO_DATA_COLOR,
    [
      'interpolate',
      ['linear'],
      ['coalesce', ['get', 'loyerMedianApt'], 0],
      ...RENT_STOPS.flat(),
    ],
  ];
}

export function formatRent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return 'Données indisponibles';
  }

  return `${value.toLocaleString('fr-FR', {
    maximumFractionDigits: 2,
  })} €/m²`;
}
