import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: 'Equipement BPE geolocalise' })
export class DeviceType {
  @Field(() => Int)
  id: number;

  @Field()
  nom: string;

  @Field()
  address: string;

  @Field()
  typequ: string;

  @Field()
  categorie: string;

  @Field()
  dom: string;

  @Field()
  sdom: string;

  @Field()
  libcom: string;

  @Field()
  family: string;

  @Field()
  familyLabel: string;

  @Field()
  typeLabel: string;

  @Field(() => Float)
  longitude: number;

  @Field(() => Float)
  latitude: number;

  @Field(() => Int)
  cityId: number;

  @Field(() => Float, { nullable: true })
  distanceMeters: number | null;
}
