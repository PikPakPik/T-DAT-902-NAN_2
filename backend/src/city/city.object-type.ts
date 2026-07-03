import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: 'Population légale communale (recensement INSEE)' })
export class PopulationStatsType {
  @Field(() => Int)
  population: number;

  @Field(() => Int)
  annee: number;

  @Field(() => Float, {
    nullable: true,
    description: 'Superficie de la commune en km²',
  })
  superficie: number | null;

  @Field(() => Float, {
    nullable: true,
    description: 'Densité de population en hab/km²',
  })
  densite: number | null;

  @Field(() => Float, {
    nullable: true,
    description: 'Évolution vs année précédente en %',
  })
  evolutionPct: number | null;
}

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

  @Field(() => Float, {
    nullable: true,
    description: 'Densité de population en hab/km² (dernière année disponible)',
  })
  densite: number | null;
}
