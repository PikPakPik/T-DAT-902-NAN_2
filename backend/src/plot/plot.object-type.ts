import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: 'Parcelle cadastrale' })
export class PlotType {
  @Field(() => Int)
  id: number;

  @Field()
  number: string;

  @Field({ description: 'Identifiant cadastral de la parcelle' })
  name: string;

  @Field({ description: 'Geometrie GeoJSON (Polygon ou MultiPolygon)' })
  geometry: string;

  @Field(() => Float, {
    nullable: true,
    description: 'Prix median au m2 en euros (null si indisponible)',
  })
  prixMedianM2: number | null;
}
