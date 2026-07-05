import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CityDetailPanelComponent } from './components/city-detail-panel/city-detail-panel.component';
import { MapLegendComponent } from './components/map-legend/map-legend.component';
import { MapFilterPanelComponent } from './components/map-filter-panel/map-filter-panel.component';
import { PlotDetailPanelComponent } from './components/plot-detail-panel/plot-detail-panel.component';
import type { MapFilterId } from './models/map-filter.model';
import { PRICE_LEGEND } from './overlays/shared/price-colors';
import { DENSITY_LEGEND } from './overlays/shared/density-colors';
import { CRIMINALITY_LEGEND } from './overlays/shared/criminality-colors';
import { RENT_LEGEND } from './overlays/shared/rent-colors';
import { MapboxMapFacade, type PriceLegendScope } from './core/mapbox-map.facade';
import type { SelectedCity } from './models/selected-city.model';
import { CitiesGraphqlService } from './services/graphql/cities-graphql.service';
import {
  CityCrimeGraphqlService,
  type CityCrimeGql,
} from './services/graphql/city-crime-graphql.service';
import {
  CityInsightsGraphqlService,
  type CityInsightsGql,
} from './services/graphql/city-insights-graphql.service';
import {
  CityPopulationGraphqlService,
  type CityPopulationGql,
} from './services/graphql/city-population-graphql.service';
import {
  CityRentGraphqlService,
  type CityRentGql,
} from './services/graphql/city-rent-graphql.service';
import { DepartmentsGraphqlService } from './services/graphql/departments-graphql.service';
import {
  DevicesGraphqlService,
  type DeviceGql,
} from './services/graphql/devices-graphql.service';
import { MapGraphqlSmokeService } from './services/graphql/map-graphql-smoke.service';
import { PlotsGraphqlService, type PlotDetailsGql } from './services/graphql/plots-graphql.service';
import { PriceLegendGraphqlService } from './services/graphql/price-legend-graphql.service';
import { RegionsGraphqlService } from './services/graphql/regions-graphql.service';
import { SectionsGraphqlService } from './services/graphql/sections-graphql.service';

type PanelMode = 'city' | 'plot';
interface PriceLegendLabels {
  min: string;
  mid: string;
  max: string;
}

@Component({
  selector: 'map',
  standalone: true,
  imports: [
    CityDetailPanelComponent,
    MapFilterPanelComponent,
    MapLegendComponent,
    PlotDetailPanelComponent,
  ],
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
})
export class MapComponent implements AfterViewInit, OnDestroy {
  readonly tokenMissing = signal(false);
  readonly graphqlStatus = signal<'idle' | 'loading' | 'ok' | 'error'>('idle');
  readonly graphqlInfo = signal('');
  readonly graphqlHttpInfo = signal('');
  readonly isLoading = computed(
    () => this.graphqlStatus() === 'idle' || this.graphqlStatus() === 'loading',
  );
  readonly activeFilter = signal<MapFilterId>('prix_m2');
  readonly priceLegend = PRICE_LEGEND;
  readonly densityLegend = DENSITY_LEGEND;
  readonly criminalityLegend = CRIMINALITY_LEGEND;
  readonly rentLegend = RENT_LEGEND;
  readonly deviceLegend = [
    { label: 'Services', color: '#2563eb' },
    { label: 'Commerces', color: '#dc2626' },
    { label: 'Éducation', color: '#7c3aed' },
    { label: 'Santé', color: '#16a34a' },
    { label: 'Transports', color: '#0891b2' },
    { label: 'Sports', color: '#ea580c' },
    { label: 'Culture', color: '#be185d' },
  ];
  readonly legendScope = signal('France');
  readonly mapLegendVisible = signal(true);
  readonly priceLegendLabels = signal<PriceLegendLabels>({
    min: PRICE_LEGEND.min,
    mid: PRICE_LEGEND.mid,
    max: PRICE_LEGEND.max,
  });
  readonly priceLegendLabelValues = computed(() => {
    const labels = this.priceLegendLabels();
    return [labels.min, labels.mid, labels.max];
  });

  readonly panelVisible = signal(false);
  readonly panelMode = signal<PanelMode | null>(null);
  readonly selectedCity = signal<SelectedCity | null>(null);
  readonly cityInsights = signal<CityInsightsGql | null>(null);
  readonly cityPopulation = signal<CityPopulationGql | null>(null);
  readonly cityPopulationHistory = signal<CityPopulationGql[]>([]);
  readonly cityCrime = signal<CityCrimeGql | null>(null);
  readonly cityCrimeHistory = signal<CityCrimeGql[]>([]);
  readonly cityRent = signal<CityRentGql | null>(null);
  readonly cityRentHistory = signal<CityRentGql[]>([]);
  readonly insightsLoading = signal(false);
  readonly insightsError = signal<string | null>(null);
  readonly selectedPlot = signal<PlotDetailsGql | null>(null);
  readonly plotLoading = signal(false);
  readonly plotError = signal<string | null>(null);
  readonly devicesVisible = signal(false);
  readonly plotDevices = signal<DeviceGql[]>([]);
  readonly plotDevicesLoading = signal(false);

  mapElement = viewChild<ElementRef<HTMLDivElement>>('map');

  #mapFacade?: MapboxMapFacade;
  #insightsRequestSeq = 0;
  #plotRequestSeq = 0;
  #legendRequestSeq = 0;
  #graphqlSmoke = inject(MapGraphqlSmokeService);
  #regionsGraphql = inject(RegionsGraphqlService);
  #departmentsGraphql = inject(DepartmentsGraphqlService);
  #devicesGraphql = inject(DevicesGraphqlService);
  #citiesGraphql = inject(CitiesGraphqlService);
  #sectionsGraphql = inject(SectionsGraphqlService);
  #plotsGraphql = inject(PlotsGraphqlService);
  #priceLegendGraphql = inject(PriceLegendGraphqlService);
  #cityCrimeGraphql = inject(CityCrimeGraphqlService);
  #cityInsightsGraphql = inject(CityInsightsGraphqlService);
  #cityPopulationGraphql = inject(CityPopulationGraphqlService);
  #cityRentGraphql = inject(CityRentGraphqlService);
  #ngZone = inject(NgZone);

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

  onPanelClosed(): void {
    this.panelVisible.set(false);
    this.panelMode.set(null);
  }

  onFilterChanged(filterId: MapFilterId): void {
    this.activeFilter.set(filterId);
    this.#mapFacade?.setChoropleth(filterId);
  }

  toggleDevices(): void {
    const visible = !this.devicesVisible();
    this.devicesVisible.set(visible);
    this.#mapFacade?.setDevicesVisible(visible);
  }

  async updatePriceLegend(scope: PriceLegendScope): Promise<void> {
    this.mapLegendVisible.set(scope.showLegend !== false);
    this.legendScope.set(scope.scope);
    if (scope.showLegend === false) return;

    const seq = ++this.#legendRequestSeq;

    try {
      const legend = await this.#priceLegendGraphql.fetch(scope);
      if (seq !== this.#legendRequestSeq) return;
      this.legendScope.set(legend.label || scope.scope);
      if (legend.count <= 0) {
        this.priceLegendLabels.set({
          min: PRICE_LEGEND.min,
          mid: PRICE_LEGEND.mid,
          max: PRICE_LEGEND.max,
        });
        return;
      }
      this.priceLegendLabels.set({
        min: this.#formatLegendPrice(legend.min),
        mid: this.#formatLegendPrice(legend.median),
        max: this.#formatLegendPrice(legend.max),
      });
    } catch {
      if (seq !== this.#legendRequestSeq) return;
      this.priceLegendLabels.set({
        min: PRICE_LEGEND.min,
        mid: PRICE_LEGEND.mid,
        max: PRICE_LEGEND.max,
      });
    }
  }

  async #handleCitySelect(city: SelectedCity): Promise<void> {
    this.selectedCity.set(city);
    this.panelVisible.set(true);
    this.panelMode.set('city');
    this.cityInsights.set(null);
    this.cityPopulation.set(null);
    this.cityPopulationHistory.set([]);
    this.cityCrime.set(null);
    this.cityCrimeHistory.set([]);
    this.cityRent.set(null);
    this.cityRentHistory.set([]);
    this.insightsError.set(null);
    this.insightsLoading.set(true);

    const seq = ++this.#insightsRequestSeq;

    try {
      const [insights, population, history, crime, crimeHistory, rent, rentHistory] =
        await Promise.all([
          this.#cityInsightsGraphql.fetchByCode(city.code),
          this.#cityPopulationGraphql.fetchByCode(city.code),
          this.#cityPopulationGraphql.fetchHistoryByCode(city.code),
          this.#cityCrimeGraphql.fetchByCode(city.code),
          this.#cityCrimeGraphql.fetchHistoryByCode(city.code),
          this.#cityRentGraphql.fetchByCode(city.code),
          this.#cityRentGraphql.fetchHistoryByCode(city.code),
        ]);
      if (seq !== this.#insightsRequestSeq) return;
      this.cityInsights.set(insights);
      this.cityPopulation.set(population);
      this.cityPopulationHistory.set(history);
      this.cityCrime.set(crime);
      this.cityCrimeHistory.set(crimeHistory);
      this.cityRent.set(rent);
      this.cityRentHistory.set(rentHistory);
    } catch (error) {
      if (seq !== this.#insightsRequestSeq) return;
      const message =
        error instanceof Error ? error.message : 'Impossible de charger l’analyse textuelle.';
      this.insightsError.set(message);
    } finally {
      if (seq === this.#insightsRequestSeq) {
        this.insightsLoading.set(false);
      }
    }
  }

  async #handlePlotSelect(plotId: number): Promise<void> {
    this.panelVisible.set(true);
    this.panelMode.set('plot');
    this.selectedPlot.set(null);
    this.plotDevices.set([]);
    this.plotError.set(null);
    this.plotLoading.set(true);
    this.plotDevicesLoading.set(true);

    const seq = ++this.#plotRequestSeq;

    try {
      const [plot, devices] = await Promise.all([
        this.#plotsGraphql.fetchDetails(plotId),
        this.#devicesGraphql.fetchNearPlot(plotId, 500, 30),
      ]);
      if (seq !== this.#plotRequestSeq) return;
      if (!plot) {
        this.plotError.set('Parcelle introuvable.');
        return;
      }
      this.selectedPlot.set(plot);
      this.plotDevices.set(devices);
    } catch (error) {
      if (seq !== this.#plotRequestSeq) return;
      const message =
        error instanceof Error ? error.message : 'Impossible de charger les ventes de la parcelle.';
      this.plotError.set(message);
    } finally {
      if (seq === this.#plotRequestSeq) {
        this.plotLoading.set(false);
        this.plotDevicesLoading.set(false);
      }
    }
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
      (bounds) => this.#devicesGraphql.fetchFeatureCollection(bounds),
      (city) => {
        this.#ngZone.run(() => {
          void this.#handleCitySelect(city);
        });
      },
      (plotId) => {
        this.#ngZone.run(() => {
          void this.#handlePlotSelect(plotId);
        });
      },
      (legendState) => {
        this.#ngZone.run(() => {
          void this.updatePriceLegend(legendState);
        });
      },
    );
    this.#mapFacade.init(el);
  }

  #formatLegendPrice(value: number | null): string {
    if (value == null || !Number.isFinite(value) || value <= 0) {
      return '-';
    }

    const amount = Math.round(value).toLocaleString('fr-FR');
    return `${amount} €`;
  }
}
