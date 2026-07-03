import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface MapLegendEntry {
  label: string;
  color: string;
}

@Component({
  selector: 'map-legend',
  standalone: true,
  templateUrl: './map-legend.component.html',
  styleUrl: './map-legend.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapLegendComponent {
  readonly visible = input(false);
  readonly title = input('');
  readonly scope = input<string | null>(null);
  readonly gradient = input<'price' | null>(null);
  readonly labels = input<string[]>([]);
  readonly entries = input<readonly MapLegendEntry[]>([]);
}
