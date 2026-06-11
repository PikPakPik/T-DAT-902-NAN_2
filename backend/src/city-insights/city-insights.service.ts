import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { City as MongoCity, CityDocument } from '../city/city.schema';
import { Review, ReviewDocument } from '../review/review.schema';
import {
  CityInsightsType,
  ReviewInsightType,
  SentimentGlobalType,
  WordcloudDataType,
} from './city-insights.object-type';

@Injectable()
export class CityInsightsService {
  constructor(
    @InjectModel(MongoCity.name)
    private readonly cityModel: Model<CityDocument>,
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
  ) {}

  async findByCode(code: string, limit = 10): Promise<CityInsightsType> {
    const [mongoCity, reviews] = await Promise.all([
      this.cityModel
        .findOne({ code, quartier: null })
        .lean()
        .exec(),
      this.reviewModel
        .find({
          code,
          quartier: null,
          comment: { $exists: true, $ne: '' },
        })
        .sort({ date: -1 })
        .limit(limit)
        .lean()
        .exec(),
    ]);

    return {
      code,
      name: mongoCity?.name ?? null,
      sentimentGlobal: this.toSentimentGlobal(mongoCity?.sentiment_global),
      wordcloudData: this.toWordcloudData(mongoCity?.wordcloud_data),
      recentReviews: reviews.map((review) => this.toReviewInsight(review)),
    };
  }

  private toSentimentGlobal(
    raw: MongoCity['sentiment_global'] | null | undefined,
  ): SentimentGlobalType | null {
    if (!raw) return null;
    return {
      averageScore: raw.average_score,
      label: raw.label,
      reviewCount: raw.review_count,
      positiveCount: raw.positive_count,
      neutralCount: raw.neutral_count,
      negativeCount: raw.negative_count,
      analyzedAt: raw.analyzed_at ?? null,
    };
  }

  private toWordcloudData(
    raw: MongoCity['wordcloud_data'] | null | undefined,
  ): WordcloudDataType | null {
    if (!raw?.words?.length) return null;
    return {
      method: raw.method,
      words: raw.words.map((entry) => ({
        word: entry.word,
        weight: Number(entry.weight),
      })),
      generatedAt: raw.generated_at ?? null,
    };
  }

  private toReviewInsight(review: Review): ReviewInsightType {
    return {
      date: review.date,
      comment: review.comment,
      overallRating: review.overall_rating,
      sentimentScore: review.sentiment_score ?? null,
      sentimentLabel: review.sentiment_label ?? null,
    };
  }
}
