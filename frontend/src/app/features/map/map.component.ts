import { AfterViewInit, Component, ElementRef, OnDestroy, computed, inject, signal, viewChild } from '@angular/core';
import { MapboxMapFacade } from './mapbox-map.facade';
import { MapGraphqlSmokeService } from './map-graphql-smoke.service';

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

  ngAfterViewInit(): void {
    void this.#runGraphqlSmokeCheck();

    const el = this.mapElement()?.nativeElement;
    if (!el) return;

    const token = window.__env?.MAPBOX_TOKEN ?? '';
    if (!token) {
      this.tokenMissing.set(true);
      return;
    }
    this.tokenMissing.set(false);

    this.#mapFacade = new MapboxMapFacade(token);
    this.#mapFacade.init(el);
  }

  ngOnDestroy(): void {
    this.#mapFacade?.destroy();
  }

  async #runGraphqlSmokeCheck(): Promise<void> {
    this.graphqlStatus.set('loading');
    const [apolloResult, rawResult] = await Promise.all([
      this.#graphqlSmoke.check(),
      this.#graphqlSmoke.checkRawHttp(),
    ]);

    this.graphqlHttpInfo.set(rawResult.info);

    const result = apolloResult;
    if (result.ok) {
      this.graphqlStatus.set('ok');
      this.graphqlInfo.set(`Apollo OK (ping=${result.pingValue ?? 'pong'})`);
      return;
    }

    this.graphqlStatus.set('error');
    this.graphqlInfo.set(`Apollo KO: ${result.error ?? 'unknown error'}`);
  }
}
