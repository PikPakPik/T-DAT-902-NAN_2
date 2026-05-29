import { Field, Float, InputType } from '@nestjs/graphql';

@InputType({ description: 'Emprise visible de la carte (coin haut-gauche + bas-droit)' })
export class MapBoundsInput {
  @Field(() => Float, { description: 'Longitude du coin haut-gauche (ouest)' })
  topLeftLng: number;

  @Field(() => Float, { description: 'Latitude du coin haut-gauche (nord)' })
  topLeftLat: number;

  @Field(() => Float, { description: 'Longitude du coin bas-droit (est)' })
  bottomRightLng: number;

  @Field(() => Float, { description: 'Latitude du coin bas-droit (sud)' })
  bottomRightLat: number;
}
