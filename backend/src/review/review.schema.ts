import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument } from 'mongoose';

export type ReviewDocument = HydratedDocument<Review>;

@Schema()
export class Review {
    @Prop({ required: true })
    code: string;

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
            vie_pratique: { type: Number, min: 0, max: 5 }
        }
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