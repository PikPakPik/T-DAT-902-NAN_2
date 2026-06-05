import { Args, Query, Resolver } from '@nestjs/graphql';
import { MapBoundsInput } from '../department/bounds.input';
import { CityType } from './city.object-type';
import { CityService } from './city.service';

@Resolver(() => CityType)
export class CityResolver {
  constructor(private readonly cityService: CityService) {}

  @Query(() => [CityType], {
    name: 'citiesInBounds',
    description:
      'Communes intersectant la zone visible (bounds carte) avec GeoJSON et prix au m2',
  })
  citiesInBounds(
    @Args('bounds', { type: () => MapBoundsInput }) bounds: MapBoundsInput,
  ): Promise<CityType[]> {
    return this.cityService.findInBounds(bounds);
  }
}
