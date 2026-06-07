import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CityDocument = HydratedDocument<City>;

@Schema()
export class City {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  code: string;

  /** Slug quartier (ex. quartier-plaine-et-forge) ; null = fiche commune entière */
  @Prop({ type: String, default: null })
  quartier: string | null;

  @Prop({ required: true, min: 0, max: 5 })
  average_rating: number;

  @Prop({
    required: true,
    type: {
      securite: { type: Number, min: 0, max: 5, required: true },
      education: { type: Number, min: 0, max: 5, required: true },
      sport_loisir: { type: Number, min: 0, max: 5, required: true },
      environnement: { type: Number, min: 0, max: 5, required: true },
      vie_pratique: { type: Number, min: 0, max: 5, required: true },
    },
  })
  criteria_notes: {
    securite: number;
    education: number;
    sport_loisir: number;
    environnement: number;
    vie_pratique: number;
  };

  /** Agrégat sentiment NLP par commune (pipeline_avis_nlp) */
  @Prop({ type: Object, default: null })
  sentiment_global: {
    average_score: number;
    label: 'positive' | 'negative' | 'neutral';
    review_count: number;
    positive_count: number;
    neutral_count: number;
    negative_count: number;
    analyzed_at: Date;
  } | null;

  /** Top mots pour wordcloud ({ words: [{ word, weight }], method, generated_at }) */
  @Prop({ type: Object, default: null })
  wordcloud_data: {
    method: string;
    words: { word: string; weight: number }[];
    generated_at: Date;
  } | null;
}

export const CitySchema = SchemaFactory.createForClass(City);
CitySchema.index({ code: 1, quartier: 1 }, { unique: true });
