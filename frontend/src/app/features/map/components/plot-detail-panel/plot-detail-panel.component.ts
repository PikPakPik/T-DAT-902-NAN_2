import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import type {
  PlotDpeGql,
  PlotDetailsGql,
  PlotSaleGql,
  PlotSaleLotGql,
} from '../../services/graphql/plots-graphql.service';

@Component({
  selector: 'plot-detail-panel',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './plot-detail-panel.component.html',
  styleUrl: './plot-detail-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlotDetailPanelComponent {
  readonly visible = input(false);
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly plot = input<PlotDetailsGql | null>(null);

  readonly closed = output<void>();

  readonly salesCount = computed(() => this.plot()?.sales.length ?? 0);
  readonly dpesCount = computed(() => this.plot()?.dpes.length ?? 0);

  formatCurrency(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '-';
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(value);
  }

  formatPriceM2(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value) || value <= 0) return '-';
    return `${Math.round(value).toLocaleString('fr-FR')} €/m²`;
  }

  formatSurface(value: number | null | undefined): string {
    if (value == null || !Number.isFinite(value)) return '-';
    return `${new Intl.NumberFormat('fr-FR', {
      maximumFractionDigits: 0,
    }).format(value)} m²`;
  }

  lotCountLabel(sale: PlotSaleGql): string {
    const count = sale.lots.length;
    if (count <= 1) return `${count} lot`;
    return `${count} lots`;
  }

  lotTypeLabel(lot: PlotSaleLotGql): string {
    return lot.typeLocal?.trim() || 'Lot';
  }

  piecesLabel(lot: PlotSaleLotGql): string {
    const pieces = lot.nombrePiecesPrincipales;
    if (pieces == null || !Number.isFinite(pieces) || pieces <= 0) return '-';
    return `${pieces} pièce${pieces > 1 ? 's' : ''}`;
  }

  lotSurfaceLabel(lot: PlotSaleLotGql): string {
    return this.formatSurface(lot.surfaceReelleBati ?? lot.surfaceTerrain);
  }

  dpeClassLabel(value: string | null | undefined): string {
    return value?.trim().toUpperCase() || '-';
  }

  dpeClassModifier(value: string | null | undefined): string {
    const classe = this.dpeClassLabel(value);
    return /^[A-G]$/.test(classe) ? `dpe-badge--${classe.toLowerCase()}` : '';
  }

  dpeTypeLabel(dpe: PlotDpeGql): string {
    return dpe.typeBatiment?.trim() || 'Bâtiment';
  }

  dpeConstructionLabel(dpe: PlotDpeGql): string {
    const year = dpe.anneeConstruction;
    if (!Number.isFinite(year) || year <= 0) return '-';
    return String(year);
  }

  close(): void {
    this.closed.emit();
  }
}
