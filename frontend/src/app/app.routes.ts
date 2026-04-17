import { Route } from '@angular/router';
import { MAP_ROUTES } from './features/map/map.routes';

export const appRoutes: Route[] = [
  {
    path: '',
    children: MAP_ROUTES,
  },
  {
    path: '**',
    redirectTo: '',
  },
];
