import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ProgressBar } from 'primeng/progressbar';
import { Tag } from 'primeng/tag';
import type { CityInsightsGql } from '../../services/graphql/city-insights-graphql.service';
import type { SelectedCity } from '../../models/selected-city.model';

@Component({
  selector: 'city-detail-panel',
  standalone: true,
  imports: [DatePipe, DecimalPipe, ProgressBar, Tag],
  templateUrl: './city-detail-panel.component.html',
  styleUrl: './city-detail-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CityDetailPanelComponent {
  readonly visible = input(false);
  readonly loading = input(false);
  readonly error = input<string | null>(null);
  readonly city = input<SelectedCity | null>(null);
  readonly insights = input<CityInsightsGql | null>(null);

  readonly closed = output<void>();

  readonly displayName = computed(
    () => this.city()?.name ?? this.insights()?.name ?? 'Commune',
  );

  readonly sentiment = computed(() => this.insights()?.sentimentGlobal ?? null);

  readonly sentimentPercent = computed(() => {
    const score = this.sentiment()?.averageScore ?? 0;
    return Math.round((score / 5) * 100);
  });

  readonly sentimentSeverity = computed(() => {
    const label = this.sentiment()?.label;
    if (label === 'positive') return 'success';
    if (label === 'negative') return 'danger';
    return 'warn';
  });

  readonly sentimentLabelFr = computed(() => {
    const label = this.sentiment()?.label;
    if (label === 'positive') return 'Positif';
    if (label === 'negative') return 'Négatif';
    return 'Neutre';
  });

  readonly wordcloudWords = computed(
    () => this.insights()?.wordcloudData?.words ?? [],
  );

  readonly maxWordWeight = computed(() => {
    const words = this.wordcloudWords();
    if (!words.length) return 1;
    return Math.max(...words.map((w) => w.weight));
  });

  readonly recentReviews = computed(
    () => this.insights()?.recentReviews ?? [],
  );

  readonly hasInsights = computed(
    () =>
      !!this.sentiment() ||
      this.wordcloudWords().length > 0 ||
      this.recentReviews().length > 0,
  );

  readonly nlpPending = computed(
    () =>
      this.recentReviews().length > 0 &&
      !this.sentiment() &&
      this.wordcloudWords().length === 0,
  );

  readonly averageOverallRating = computed(() => {
    const ratings = this.recentReviews()
      .map((review) => review.overallRating)
      .filter((rating) => Number.isFinite(rating));
    if (!ratings.length) return null;
    const sum = ratings.reduce((acc, rating) => acc + rating, 0);
    return sum / ratings.length;
  });

  readonly averageOverallPercent = computed(() => {
    const score = this.averageOverallRating();
    return score == null ? 0 : Math.round((score / 5) * 100);
  });

  wordFontSize(weight: number): string {
    const max = this.maxWordWeight();
    const ratio = max > 0 ? weight / max : 0;
    return `${0.75 + ratio * 1.75}rem`;
  }

  wordOpacity(weight: number): number {
    const max = this.maxWordWeight();
    if (max <= 0) return 0.65;
    return 0.45 + (weight / max) * 0.55;
  }

  reviewSeverity(label: string | null): 'success' | 'warn' | 'danger' | 'secondary' {
    if (label === 'positive') return 'success';
    if (label === 'negative') return 'danger';
    if (label === 'neutral') return 'warn';
    return 'secondary';
  }

  reviewSeverityFromRating(rating: number): 'success' | 'warn' | 'danger' | 'secondary' {
    if (rating <= 2.5) return 'danger';
    if (rating <= 3.5) return 'warn';
    return 'success';
  }

  reviewLabelFr(label: string | null): string {
    if (label === 'positive') return 'Positif';
    if (label === 'negative') return 'Négatif';
    if (label === 'neutral') return 'Neutre';
    return 'Non analysé';
  }

  reviewLabelFromRating(rating: number): string {
    if (rating <= 2.5) return 'Plutôt négatif';
    if (rating <= 3.5) return 'Mitigé';
    return 'Plutôt positif';
  }

  reviewTagLabel(review: {
    sentimentLabel: string | null;
    overallRating: number;
  }): string {
    if (review.sentimentLabel) {
      return this.reviewLabelFr(review.sentimentLabel);
    }
    return this.reviewLabelFromRating(review.overallRating);
  }

  reviewTagSeverity(review: {
    sentimentLabel: string | null;
    overallRating: number;
  }): 'success' | 'warn' | 'danger' | 'secondary' {
    if (review.sentimentLabel) {
      return this.reviewSeverity(review.sentimentLabel);
    }
    return this.reviewSeverityFromRating(review.overallRating);
  }

  close(): void {
    this.closed.emit();
  }
}
