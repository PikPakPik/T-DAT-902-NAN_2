import { Args, Query, Resolver } from '@nestjs/graphql';
import { MapBoundsInput } from '../department/bounds.input';
import { CityType, PopulationStatsType } from './city.object-type';
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

  @Query(() => PopulationStatsType, {
    name: 'cityPopulation',
    nullable: true,
    description:
      'Population légale la plus récente (recensement INSEE) pour une commune',
  })
  cityPopulation(
    @Args('code', { description: 'Code INSEE commune' }) code: string,
  ): Promise<PopulationStatsType | null> {
    return this.cityService.findLatestPopulationByCode(code);
  }

  @Query(() => [PopulationStatsType], {
    name: 'cityPopulationHistory',
    description:
      'Historique de la population légale (recensement INSEE) pour une commune, toutes années disponibles',
  })
  cityPopulationHistory(
    @Args('code', { description: 'Code INSEE commune' }) code: string,
  ): Promise<PopulationStatsType[]> {
    return this.cityService.findPopulationHistoryByCode(code);
  }
}
