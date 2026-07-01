export type MapFilterId = 'densite';

export interface MapFilter {
  id: MapFilterId;
  label: string;
  description: string;
  active: boolean;
}

export const DEFAULT_MAP_FILTERS: MapFilter[] = [
  {
    id: 'densite',
    label: 'Densité de population',
    description: 'Habitants par km²',
    active: false,
  },
];
