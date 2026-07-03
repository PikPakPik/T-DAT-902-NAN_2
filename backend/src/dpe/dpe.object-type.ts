import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType({
  description: 'Répartition des diagnostics pour une classe donnée (A à G)',
})
export class DpeClasseCountType {
  @Field({ description: 'Classe DPE (A, B, C, D, E, F, G)' })
  classe: string;

  @Field(() => Int, { description: 'Nombre de diagnostics pour cette classe' })
  count: number;

  @Field(() => Float, {
    description: 'Pourcentage du total de la commune (0-100)',
  })
  pourcentage: number;
}

@ObjectType({ description: 'Statistiques DPE agrégées pour une commune' })
export class DpeStatsType {
  @Field({ description: 'Code INSEE de la commune' })
  code: string;

  @Field(() => Int, { description: 'Nombre total de diagnostics DPE' })
  total: number;

  @Field(() => [DpeClasseCountType], {
    description: 'Répartition par classe énergie (A à G)',
  })
  classeEnergieDistribution: DpeClasseCountType[];

  @Field(() => [DpeClasseCountType], {
    description: 'Répartition par classe GES (A à G)',
  })
  classeGesDistribution: DpeClasseCountType[];

  @Field(() => Float, {
    nullable: true,
    description: 'Surface habitable moyenne en m² (null si indisponible)',
  })
  surfaceHabitableMoyenne: number | null;

  @Field(() => Int, {
    nullable: true,
    description: 'Année de construction moyenne (null si indisponible)',
  })
  anneeConstructionMoyenne: number | null;

  @Field(() => String, {
    nullable: true,
    description: 'Classe énergie la plus représentée (null si indisponible)',
  })
  classeEnergieMajoritaire: string | null;
}
