import { Component, output, signal } from '@angular/core';
import { DENSITY_LEGEND } from '../../overlays/shared/density-colors';
import {
  DEFAULT_MAP_FILTERS,
  type MapFilter,
  type MapFilterId,
} from '../../models/map-filter.model';

@Component({
  selector: 'map-filter-panel',
  standalone: true,
  templateUrl: './map-filter-panel.component.html',
  styleUrl: './map-filter-panel.component.scss',
})
export class MapFilterPanelComponent {
  readonly filterChanged = output<MapFilterId>();

  readonly #open = signal(false);
  readonly open = this.#open.asReadonly();

  readonly filters = signal<MapFilter[]>(structuredClone(DEFAULT_MAP_FILTERS));

  readonly densityLegend = DENSITY_LEGEND;

  get activeFilter(): MapFilter | undefined {
    return this.filters().find((f) => f.active);
  }

  togglePanel(): void {
    this.#open.update((v) => !v);
  }

  toggleFilter(id: MapFilterId): void {
    this.filters.update((filters) =>
      filters.map((f) => ({
        ...f,
        active: f.id === id,
      })),
    );
    this.filterChanged.emit(id);
  }
}
