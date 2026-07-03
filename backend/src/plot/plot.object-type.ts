import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: 'Lot DVF rattache a une vente de parcelle' })
export class PlotSaleLotType {
  @Field(() => Int)
  id: number;

  @Field(() => String, { nullable: true })
  typeLocal: string | null;

  @Field(() => Float, { nullable: true })
  surfaceReelleBati: number | null;

  @Field(() => Int, { nullable: true })
  nombrePiecesPrincipales: number | null;

  @Field(() => Float, { nullable: true })
  surfaceTerrain: number | null;
}

@ObjectType({ description: 'Vente DVF rattachee a une parcelle' })
export class PlotSaleType {
  @Field(() => Int)
  id: number;

  @Field(() => String)
  dateMutation: string;

  @Field(() => String)
  natureMutation: string;

  @Field(() => Float)
  valeurFonciere: number;

  @Field(() => Float, { nullable: true })
  prixM2: number | null;

  @Field(() => [PlotSaleLotType])
  lots: PlotSaleLotType[];
}

@ObjectType({ description: 'Diagnostic DPE rattache a une parcelle' })
export class PlotDpeType {
  @Field(() => Int)
  id: number;

  @Field(() => String)
  dpeId: string;

  @Field(() => Int)
  annee: number;

  @Field(() => String)
  classeEnergie: string;

  @Field(() => String)
  classeGes: string;

  @Field(() => Float)
  surfaceHabitable: number;

  @Field(() => String)
  typeBatiment: string;

  @Field(() => Int)
  anneeConstruction: number;
}

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

  @Field(() => Float, {
    nullable: true,
    description: 'Prix moyen au m2 observe sur les ventes DVF de la parcelle',
  })
  prixMoyenM2: number | null;

  @Field(() => Float, {
    nullable: true,
    description: 'Surface cadastrale de la parcelle en m2',
  })
  surfaceM2: number | null;

  @Field(() => Float, {
    nullable: true,
    description: 'Surface disponible estimee en m2',
  })
  surfaceDisponibleM2: number | null;

  @Field()
  hasSale: boolean;

  @Field(() => Float, {
    nullable: true,
    description: 'Montant de la plus grosse vente DVF rattachee a la parcelle',
  })
  maxSaleAmount: number | null;

  @Field(() => [PlotSaleType])
  sales: PlotSaleType[];

  @Field(() => [PlotDpeType])
  dpes: PlotDpeType[];
}
