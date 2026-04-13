import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import { Apollo, gql } from 'apollo-angular';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    InputTextModule,
    ButtonModule,
    MessageModule,
    FormsModule,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class AppComponent implements AfterViewInit, OnDestroy, OnInit {
  #apollo = inject(Apollo);
  #cdr = inject(ChangeDetectorRef);
  #leafletMap?: L.Map;
  text = '';
  msg = '';
  apolloStatus = 'Loading...';
  apolloResult = '';

  /** Synced with `<html class="dark">` via `darkModeSelector: '.dark'` in `providePrimeNG`. */
  readonly isDark = signal(
    typeof localStorage !== 'undefined' &&
      localStorage.getItem('homepedia-ui-theme') === 'dark',
  );

  ngAfterViewInit(): void {
      const mapElement = document.getElementById('leaflet-map');
      if (!mapElement) return;
  
      // OSM public tiles are only published up to zoom 19; higher z returns invalid tiles.
      this.#leafletMap = L.map(mapElement, { maxZoom: 20 }).setView(
        [47.2184, -1.5536],
        13,
      );
  
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 20,
        maxNativeZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(this.#leafletMap);
    }
  
    ngOnInit(): void {
      this.#syncThemeToDocument();

      this.apolloStatus = 'Loading...';
  
      this.#apollo
        .query<{ __typename: string }>({
          query: gql`
            query ApolloConnectionTest {
              __typename
            }
          `,
          fetchPolicy: 'network-only',
          errorPolicy: 'none',
        })
        .subscribe({
          next: ({ data }) => {
            this.apolloStatus = 'Connected';
            this.apolloResult = data?.__typename ?? 'No data';
            this.#cdr.detectChanges();
          },
          error: (error) => {
            this.apolloStatus = 'Error';
            this.apolloResult = error?.message ?? 'Request failed';
            this.#cdr.detectChanges();
          },
        });
    }
  
    ngOnDestroy(): void {
      this.#leafletMap?.remove();
    }

  onClick() {
    this.msg = 'Welcome ' + this.text;
  }

  toggleDarkMode(): void {
    this.isDark.update((v) => !v);
    this.#syncThemeToDocument();
  }

  #syncThemeToDocument(): void {
    const dark = this.isDark();
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('homepedia-ui-theme', dark ? 'dark' : 'light');
    }
  }
}
