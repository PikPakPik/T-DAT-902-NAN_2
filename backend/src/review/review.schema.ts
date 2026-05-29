import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ReviewDocument = HydratedDocument<Review>;

@Schema()
export class Review {
  @Prop({ required: true })
  code: string;

  /** Slug quartier ; null = avis au niveau commune */
  @Prop({ type: String, default: null })
  quartier: string | null;

  /** Identifiant source (attribut data-pouce du site) */
  @Prop({ type: String, default: null })
  source_id: string | null;

  @Prop({ required: true, type: Date })
  date: Date;

  @Prop({ required: true, min: 0, max: 5 })
  overall_rating: number;

  @Prop({
    required: true,
    type: {
      securite: { type: Number, min: 0, max: 5 },
      education: { type: Number, min: 0, max: 5 },
      sport_loisir: { type: Number, min: 0, max: 5 },
      environnement: { type: Number, min: 0, max: 5 },
      vie_pratique: { type: Number, min: 0, max: 5 },
    },
  })
  criteria_notes: {
    securite?: number;
    education?: number;
    sport_loisir?: number;
    environnement?: number;
    vie_pratique?: number;
  };

  @Prop({ required: true })
  comment: string;

  @Prop({ type: Number, minimum: 0, default: 0 })
  thumbs_up: number;

  @Prop({ type: Number, minimum: 0, default: 0 })
  thumbs_down: number;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);
ReviewSchema.index({ source_id: 1 }, { unique: true, sparse: true });
ReviewSchema.index({ code: 1, quartier: 1 });
