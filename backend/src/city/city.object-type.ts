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

@ObjectType({ description: 'Statistiques de criminalite communales' })
export class CrimeStatsType {
  @Field(() => Int)
  annee: number;

  @Field(() => Float, { description: 'Taux de cambriolages' })
  tauxCambriolages: number;

  @Field(() => Float, { description: 'Taux de vols avec armes' })
  tauxVolsArmes: number;

  @Field(() => Float, { description: 'Taux de vols sans violence' })
  tauxVolsSansViol: number;

  @Field(() => Float, { description: 'Taux de violences physiques' })
  tauxViolencesPhys: number;

  @Field(() => Float, { description: 'Somme des taux disponibles' })
  score: number;

  @Field(() => Float, {
    nullable: true,
    description: 'Evolution vs annee precedente en %',
  })
  evolutionPct: number | null;
}

@ObjectType({ description: 'Statistiques de loyers communales' })
export class RentStatsType {
  @Field(() => Int)
  annee: number;

  @Field(() => Float, {
    nullable: true,
    description: 'Loyer median appartement en euros par m2',
  })
  loyerMedianApt: number | null;

  @Field(() => Float, {
    nullable: true,
    description: 'Loyer median T1/T2 en euros par m2',
  })
  loyerMedianT1T2: number | null;

  @Field(() => Float, {
    nullable: true,
    description: 'Loyer median T3+ en euros par m2',
  })
  loyerMedianT3Plus: number | null;

  @Field(() => Float, {
    nullable: true,
    description: 'Loyer median maison en euros par m2',
  })
  loyerMedianMaison: number | null;

  @Field(() => Int, {
    nullable: true,
    description: 'Nombre d observations',
  })
  nbObservations: number | null;

  @Field(() => Float, {
    nullable: true,
    description: 'Evolution du loyer appartement vs annee precedente en %',
  })
  evolutionPct: number | null;
}

@ObjectType({ description: "Statistiques de qualite de l'air communales" })
export class AirQualityStatsType {
  @Field(() => Int)
  annee: number;

  @Field(() => Int, { description: 'Indice ATMO median annuel' })
  indiceAtmoMedian: number;

  @Field(() => Float, { description: 'Sous-indice PM2.5 median annuel' })
  pm25Median: number;

  @Field(() => Float, { description: 'Sous-indice PM10 median annuel' })
  pm10Median: number;

  @Field(() => Float, { description: 'Sous-indice NO2 median annuel' })
  no2Median: number;

  @Field(() => Float, { description: 'Sous-indice O3 median annuel' })
  o3Median: number;

  @Field(() => Int)
  nbJoursBon: number;

  @Field(() => Int)
  nbJoursMoyen: number;

  @Field(() => Int)
  nbJoursMauvais: number;

  @Field(() => Float, {
    nullable: true,
    description: 'Evolution vs annee precedente en %',
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

  @Field(() => Float, {
    nullable: true,
    description:
      'Score criminalite (somme des taux de la derniere annee disponible)',
  })
  criminaliteScore: number | null;

  @Field(() => Float, {
    nullable: true,
    description:
      'Loyer median appartement en euros par m2 (derniere annee disponible)',
  })
  loyerMedianApt: number | null;

  @Field(() => Int, {
    nullable: true,
    description: 'Indice ATMO median de la derniere annee disponible',
  })
  indiceAtmoMedian: number | null;
}
