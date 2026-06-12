import {
  Field,
  Float,
  GraphQLISODateTime,
  Int,
  ObjectType,
} from '@nestjs/graphql';

@ObjectType({ description: 'Agrégat sentiment NLP par commune' })
export class SentimentGlobalType {
  @Field(() => Float)
  averageScore: number;

  @Field(() => String, { description: 'positive | neutral | negative' })
  label: string;

  @Field(() => Int)
  reviewCount: number;

  @Field(() => Int)
  positiveCount: number;

  @Field(() => Int)
  neutralCount: number;

  @Field(() => Int)
  negativeCount: number;

  @Field(() => GraphQLISODateTime, { nullable: true })
  analyzedAt: Date | null;
}

@ObjectType({ description: 'Mot pondéré pour le nuage de mots' })
export class WordcloudWordType {
  @Field(() => String)
  word: string;

  @Field(() => Float)
  weight: number;
}

@ObjectType({ description: 'Données wordcloud par commune' })
export class WordcloudDataType {
  @Field(() => String)
  method: string;

  @Field(() => [WordcloudWordType])
  words: WordcloudWordType[];

  @Field(() => GraphQLISODateTime, { nullable: true })
  generatedAt: Date | null;
}

@ObjectType({ description: 'Avis utilisateur avec sentiment NLP' })
export class ReviewInsightType {
  @Field(() => GraphQLISODateTime)
  date: Date;

  @Field(() => String)
  comment: string;

  @Field(() => Float)
  overallRating: number;

  @Field(() => Float, { nullable: true })
  sentimentScore: number | null;

  @Field(() => String, {
    nullable: true,
    description: 'positive | neutral | negative',
  })
  sentimentLabel: string | null;
}

@ObjectType({
  description: 'Résultats analyse textuelle (sentiment + wordcloud + avis)',
})
export class CityInsightsType {
  @Field(() => String, { description: 'Code INSEE commune' })
  code: string;

  @Field(() => String, {
    nullable: true,
    description: 'Nom commune (MongoDB ou PostGIS)',
  })
  name: string | null;

  @Field(() => SentimentGlobalType, { nullable: true })
  sentimentGlobal: SentimentGlobalType | null;

  @Field(() => WordcloudDataType, { nullable: true })
  wordcloudData: WordcloudDataType | null;

  @Field(() => [ReviewInsightType])
  recentReviews: ReviewInsightType[];
}
