import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideApollo } from 'apollo-angular';
import { provideRouter } from '@angular/router';
import { publicGraphqlApolloOptionsFactory } from './config/graphql-public-api.config';
import { appRoutes } from './app.routes';
import { providePrimeNG } from 'primeng/config';
import { laraIndigoPreset } from './config/primeng-lara-indigo.preset';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    providePrimeNG({
      theme: {
        preset: laraIndigoPreset,
      },
      ripple: true,
    }),
    provideApollo(publicGraphqlApolloOptionsFactory),
    provideRouter(appRoutes),
  ],
};
