import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: 'Département français' })
export class DepartmentType {
  @Field(() => Int)
  id: number;

  @Field()
  name: string;

  @Field()
  code: string;

  @Field({ description: 'Géométrie GeoJSON (Polygon ou MultiPolygon)' })
  geometry: string;

  @Field(() => Float, {
    nullable: true,
    description: 'Prix médian au m² en euros (null si indisponible)',
  })
  prixMedianM2: number | null;
}
