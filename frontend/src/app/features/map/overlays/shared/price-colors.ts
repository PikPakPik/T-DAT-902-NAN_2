import type { ExpressionSpecification } from 'mapbox-gl';

/** Propriétés communes aux features admin (région, département, commune). */
export interface AdminPriceProperties {
  id: number;
  name: string;
  code: string;
  prixMedianM2: number | null;
}

/** Couleur affichée lorsqu'aucun prix au m² n'est disponible. */
export const ADMIN_NO_DATA_COLOR = 'rgba(148, 163, 184, 0.55)';

/** Seuils €/m² pour l'échelle vert → jaune → orange → rouge. */
export const ADMIN_PRICE_STOPS: readonly [number, string][] = [
  [594, '#38d96f'],
  [2500, '#c8f23a'],
  [3740, '#facc15'],
  [5200, '#f97316'],
  [6886, '#dc2626'],
];

export const PRICE_LEGEND = {
  title: 'Prix au m²',
  min: '< 594 €',
  mid: '3740 €',
  max: '> 6886 €',
} as const;

/** Expression Mapbox : gris sans données, sinon dégradé selon prixMedianM2. */
export function adminFillColorExpression(): ExpressionSpecification {
  return [
    'case',
    ['<=', ['coalesce', ['get', 'prixMedianM2'], -1], 0],
    ADMIN_NO_DATA_COLOR,
    [
      'interpolate',
      ['linear'],
      ['get', 'prixMedianM2'],
      ...ADMIN_PRICE_STOPS.flat(),
    ],
  ];
}

export function formatPriceM2(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return 'Données indisponibles';
  }
  return `${Math.round(value).toLocaleString('fr-FR')} €/m²`;
}
