import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CityDocument = HydratedDocument<City>;

@Schema()
export class City {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  code: string;

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
}

export const CitySchema = SchemaFactory.createForClass(City);
