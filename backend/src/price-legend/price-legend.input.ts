import { Field, InputType, Int } from '@nestjs/graphql';

export enum PriceLegendScopeLevel {
  FRANCE = 'france',
  REGION = 'region',
  DEPARTMENT = 'department',
  CITY = 'city',
}

@InputType()
export class PriceLegendScopeInput {
  @Field(() => String)
  level: PriceLegendScopeLevel;

  @Field(() => Int, { nullable: true })
  id?: number | null;

  @Field(() => String, { nullable: true })
  code?: string | null;
}
