import { Route } from '@angular/router';

export const MAP_ROUTES: Route[] = [
  {
    path: '',
    loadComponent: () => import('./map.component').then(m => m.MapComponent),
    title: 'Carte',
  },
];