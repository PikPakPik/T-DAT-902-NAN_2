export type MapFilterId = 'prix_m2' | 'densite';

export interface MapFilter {
  id: MapFilterId;
  label: string;
  description: string;
  active: boolean;
}

export const DEFAULT_MAP_FILTERS: MapFilter[] = [
  {
    id: 'prix_m2',
    label: 'Prix au m²',
    description: 'Ventes DVF',
    active: true,
  },
  {
    id: 'densite',
    label: 'Densité de population',
    description: 'Habitants par km²',
    active: false,
  },
];
