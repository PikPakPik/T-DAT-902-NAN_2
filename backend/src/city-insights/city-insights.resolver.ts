import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { CityInsightsType } from './city-insights.object-type';
import { CityInsightsService } from './city-insights.service';

@Resolver(() => CityInsightsType)
export class CityInsightsResolver {
  constructor(private readonly cityInsightsService: CityInsightsService) {}

  @Query(() => CityInsightsType, {
    name: 'cityInsights',
    description:
      'Analyse textuelle commune : sentiment global, wordcloud et avis récents (MongoDB)',
  })
  cityInsights(
    @Args('code', { description: 'Code INSEE commune' }) code: string,
    @Args('limit', {
      type: () => Int,
      nullable: true,
      defaultValue: 10,
      description: 'Nombre max d’avis récents',
    })
    limit: number,
  ): Promise<CityInsightsType> {
    return this.cityInsightsService.findByCode(code, limit);
  }
}
