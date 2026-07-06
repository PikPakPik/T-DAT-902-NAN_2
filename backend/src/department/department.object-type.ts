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

  @Field(() => Float, {
    nullable: true,
    description:
      'Densité de population moyenne en hab/km² (null si indisponible)',
  })
  densite: number | null;

  @Field(() => Float, {
    nullable: true,
    description: 'Score de criminalité moyen (null si indisponible)',
  })
  criminaliteScore: number | null;

  @Field(() => Float, {
    nullable: true,
    description:
      'Loyer médian appartement moyen en euros (null si indisponible)',
  })
  loyerMedianApt: number | null;

  @Field(() => Float, {
    nullable: true,
    description: 'Indice ATMO médian moyen (null si indisponible)',
  })
  indiceAtmoMedian: number | null;
}
