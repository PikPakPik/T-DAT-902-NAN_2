import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: 'Bornes dynamiques de la legende prix au m2' })
export class PriceLegendType {
  @Field()
  label: string;

  @Field(() => Float, { nullable: true })
  min: number | null;

  @Field(() => Float, { nullable: true })
  median: number | null;

  @Field(() => Float, { nullable: true })
  max: number | null;

  @Field(() => Int)
  count: number;
}
