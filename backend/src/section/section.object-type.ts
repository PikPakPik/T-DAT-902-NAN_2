import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: 'Section cadastrale' })
export class SectionType {
  @Field(() => Int)
  id: number;

  @Field()
  code: string;

  @Field()
  prefixe: string;

  @Field({ description: 'Identifiant cadastral de la section' })
  name: string;

  @Field({ description: 'Geometrie GeoJSON (Polygon ou MultiPolygon)' })
  geometry: string;

  @Field(() => Float, {
    nullable: true,
    description: 'Prix median au m2 en euros (null si indisponible)',
  })
  prixMedianM2: number | null;
}
