import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ProgressBar } from 'primeng/progressbar';
import { Tag } from 'primeng/tag';
import type { CityInsightsGql } from '../../services/graphql/city-insights-graphql.service';
import type { SelectedCity } from '../../models/selected-city.model';

type SentimentSeverity = 'success' | 'warn' | 'danger' | 'secondary';

/** ~4 lignes de texte avant affichage du bouton « Afficher plus » */
const REVIEW_COMMENT_COLLAPSE_THRESHOLD = 180;

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

  readonly #wordcloudVisible = signal(false);
  readonly wordcloudVisible = this.#wordcloudVisible.asReadonly();

  readonly #expandedReviewKeys = signal<ReadonlySet<string>>(new Set());

  readonly #panelResetKey = computed(
    () => `${this.city()?.code ?? ''}|${this.insights()?.code ?? ''}`,
  );

  constructor() {
    effect(() => {
      this.#panelResetKey();
      this.#wordcloudVisible.set(false);
      this.#expandedReviewKeys.set(new Set());
    });
  }

  readonly displayName = computed(
    () => this.city()?.name ?? this.insights()?.name ?? 'Commune',
  );

  readonly sentiment = computed(() => this.insights()?.sentimentGlobal ?? null);

  readonly recentReviews = computed(
    () => this.insights()?.recentReviews ?? [],
  );

  readonly wordcloudWords = computed(
    () => this.insights()?.wordcloudData?.words ?? [],
  );

  readonly hasWordcloud = computed(() => this.wordcloudWords().length > 0);

  readonly hasTabContent = computed(
    () =>
      this.globalScore() != null ||
      this.hasWordcloud() ||
      this.recentReviews().length > 0,
  );

  readonly globalScore = computed(() => {
    const nlpScore = this.sentiment()?.averageScore;
    if (nlpScore != null && Number.isFinite(nlpScore)) return nlpScore;
    return this.averageOverallRating();
  });

  readonly globalScorePercent = computed(() => {
    const score = this.globalScore();
    return score == null ? 0 : Math.round((score / 5) * 100);
  });

  readonly globalReviewCount = computed(() => {
    const count = this.sentiment()?.reviewCount;
    if (count != null && count > 0) return count;
    return this.recentReviews().length;
  });

  readonly maxWordWeight = computed(() => {
    const words = this.wordcloudWords();
    if (!words.length) return 1;
    return Math.max(...words.map((w) => w.weight));
  });

  readonly nlpPending = computed(
    () =>
      this.recentReviews().length > 0 &&
      !this.sentiment() &&
      !(this.insights()?.wordcloudData?.words?.length ?? 0),
  );

  readonly headerSentimentPill = computed((): {
    label: string;
    severity: SentimentSeverity;
  } | null => {
    const label = this.sentiment()?.label;
    if (label) {
      return {
        label: this.sentimentLabelFr(label),
        severity: this.sentimentSeverity(label),
      };
    }

    const avg = this.averageOverallRating();
    if (avg == null) return null;

    return {
      label: this.sentimentLabelFromRating(avg),
      severity: this.sentimentSeverityFromRating(avg),
    };
  });

  readonly averageOverallRating = computed(() => {
    const ratings = this.recentReviews()
      .map((review) => review.overallRating)
      .filter((rating) => Number.isFinite(rating));
    if (!ratings.length) return null;
    const sum = ratings.reduce((acc, rating) => acc + rating, 0);
    return sum / ratings.length;
  });

  reviewTagLabel(review: {
    sentimentLabel: string | null;
    overallRating: number;
  }): string {
    if (review.sentimentLabel) {
      return this.sentimentLabelFr(review.sentimentLabel);
    }
    return this.sentimentLabelFromRating(review.overallRating);
  }

  reviewTagSeverity(review: {
    sentimentLabel: string | null;
    overallRating: number;
  }): SentimentSeverity {
    if (review.sentimentLabel) {
      return this.sentimentSeverity(review.sentimentLabel);
    }
    return this.sentimentSeverityFromRating(review.overallRating);
  }

  toggleWordcloud(): void {
    this.#wordcloudVisible.update((visible) => !visible);
  }

  reviewKey(review: { date: string; comment: string }): string {
    return `${review.date}|${review.comment}`;
  }

  isReviewExpandable(comment: string): boolean {
    return comment.length > REVIEW_COMMENT_COLLAPSE_THRESHOLD;
  }

  isReviewExpanded(review: { date: string; comment: string }): boolean {
    return this.#expandedReviewKeys().has(this.reviewKey(review));
  }

  toggleReviewExpand(review: { date: string; comment: string }): void {
    const key = this.reviewKey(review);
    this.#expandedReviewKeys.update((keys) => {
      const next = new Set(keys);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

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

  close(): void {
    this.#wordcloudVisible.set(false);
    this.closed.emit();
  }

  private sentimentLabelFr(label: string): string {
    if (label === 'positive') return 'Avis bien';
    if (label === 'negative') return 'Avis mauvais';
    if (label === 'neutral') return 'Avis neutre';
    return 'Avis non analysé';
  }

  private sentimentLabelFromRating(rating: number): string {
    if (rating <= 2.5) return 'Avis mauvais';
    if (rating <= 3.5) return 'Avis neutre';
    return 'Avis bien';
  }

  private sentimentSeverity(label: string): SentimentSeverity {
    if (label === 'positive') return 'success';
    if (label === 'negative') return 'danger';
    if (label === 'neutral') return 'warn';
    return 'secondary';
  }

  private sentimentSeverityFromRating(rating: number): SentimentSeverity {
    if (rating <= 2.5) return 'danger';
    if (rating <= 3.5) return 'warn';
    return 'success';
  }
}
