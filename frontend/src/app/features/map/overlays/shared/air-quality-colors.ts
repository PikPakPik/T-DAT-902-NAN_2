import type { ExpressionSpecification } from 'mapbox-gl';
import { ADMIN_NO_DATA_COLOR } from './price-colors';

export const AIR_QUALITY_STOPS: readonly [number, string][] = [
  [1, '#50ccaa'],
  [2, '#50ccaa'],
  [3, '#f0e641'],
  [4, '#ff5050'],
  [5, '#960032'],
  [6, '#7d2181'],
];

export const AIR_QUALITY_LEGEND: readonly { label: string; color: string }[] = [
  { label: 'Bon', color: '#50ccaa' },
  { label: 'Moyen', color: '#50ccaa' },
  { label: 'Dégradé', color: '#f0e641' },
  { label: 'Mauvais', color: '#ff5050' },
  { label: 'Très mauvais', color: '#960032' },
  { label: 'Extrême', color: '#7d2181' },
];

export function airQualityFillColorExpression(): ExpressionSpecification {
  return [
    'case',
    ['<=', ['coalesce', ['get', 'indiceAtmoMedian'], -1], 0],
    ADMIN_NO_DATA_COLOR,
    [
      'interpolate',
      ['linear'],
      ['coalesce', ['get', 'indiceAtmoMedian'], 0],
      ...AIR_QUALITY_STOPS.flat(),
    ],
  ];
}

export function formatAirQuality(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return 'Données indisponibles';
  }

  const rounded = Math.round(value);
  const label =
    rounded <= 1
      ? 'Bon'
      : rounded === 2
        ? 'Moyen'
        : rounded === 3
          ? 'Dégradé'
          : rounded === 4
            ? 'Mauvais'
            : rounded === 5
              ? 'Très mauvais'
              : 'Extrêmement mauvais';

  return `Indice ATMO ${rounded} - ${label}`;
}
