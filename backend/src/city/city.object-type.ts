import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: 'Commune francaise' })
export class CityType {
  @Field(() => Int)
  id: number;

  @Field()
  name: string;

  @Field()
  code: string;

  @Field({ description: 'Geometrie GeoJSON (Polygon ou MultiPolygon)' })
  geometry: string;

  @Field(() => Float, {
    nullable: true,
    description: 'Prix median au m2 en euros (null si indisponible)',
  })
  prixMedianM2: number | null;
}
