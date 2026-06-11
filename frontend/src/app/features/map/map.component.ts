import { AfterViewInit, Component, ElementRef, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { MapboxMapFacade } from './core/mapbox-map.facade';
import { CitiesGraphqlService } from './services/graphql/cities-graphql.service';
import { DepartmentsGraphqlService } from './services/graphql/departments-graphql.service';
import { MapGraphqlSmokeService } from './services/graphql/map-graphql-smoke.service';
import { PlotsGraphqlService } from './services/graphql/plots-graphql.service';
import { RegionsGraphqlService } from './services/graphql/regions-graphql.service';
import { SectionsGraphqlService } from './services/graphql/sections-graphql.service';

@Component({
  selector: 'map',
  standalone: true,
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
})
export class MapComponent implements AfterViewInit, OnDestroy {
  readonly tokenMissing = signal(false);
  readonly graphqlStatus = signal<'idle' | 'loading' | 'ok' | 'error'>('idle');
  readonly graphqlInfo = signal('');
  readonly graphqlHttpInfo = signal('');
  readonly isLoading = computed(() => this.graphqlStatus() === 'idle' || this.graphqlStatus() === 'loading');

  mapElement = viewChild<ElementRef<HTMLDivElement>>('map');

  #mapFacade?: MapboxMapFacade;
  #graphqlSmoke = inject(MapGraphqlSmokeService);
  #regionsGraphql = inject(RegionsGraphqlService);
  #departmentsGraphql = inject(DepartmentsGraphqlService);
  #citiesGraphql = inject(CitiesGraphqlService);
  #sectionsGraphql = inject(SectionsGraphqlService);
  #plotsGraphql = inject(PlotsGraphqlService);

  ngAfterViewInit(): void {
    void this.#bootstrapMap();

    const el = this.mapElement()?.nativeElement;
    if (!el) return;

    const token = window.__env?.MAPBOX_TOKEN ?? '';
    if (!token) {
      this.tokenMissing.set(true);
      return;
    }
    this.tokenMissing.set(false);
  }

  ngOnDestroy(): void {
    this.#mapFacade?.destroy();
  }

  async #bootstrapMap(): Promise<void> {
    this.graphqlStatus.set('loading');

    const el = this.mapElement()?.nativeElement;
    const token = window.__env?.MAPBOX_TOKEN ?? '';

    const [apolloResult, rawResult, regionsGeoJson] = await Promise.all([
      this.#graphqlSmoke.check(),
      this.#graphqlSmoke.checkRawHttp(),
      this.#regionsGraphql.fetchFeatureCollection().catch(() => ({
        type: 'FeatureCollection' as const,
        features: [],
      })),
    ]);

    this.graphqlHttpInfo.set(rawResult.info);

    if (apolloResult.ok) {
      const regionCount = regionsGeoJson.features.length;
      this.graphqlStatus.set('ok');
      this.graphqlInfo.set(
        `Apollo OK (ping=${apolloResult.pingValue ?? 'pong'}, régions=${regionCount})`,
      );
    } else {
      this.graphqlStatus.set('error');
      this.graphqlInfo.set(`Apollo KO: ${apolloResult.error ?? 'unknown error'}`);
    }

    if (!el || !token) return;

    this.#mapFacade?.destroy();
    this.#mapFacade = new MapboxMapFacade(
      token,
      regionsGeoJson,
      (bounds) => this.#departmentsGraphql.fetchFeatureCollection(bounds),
      (bounds) => this.#citiesGraphql.fetchFeatureCollection(bounds),
      (bounds) => this.#sectionsGraphql.fetchFeatureCollection(bounds),
      (bounds) => this.#plotsGraphql.fetchFeatureCollection(bounds),
    );
    this.#mapFacade.init(el);
  }
}
