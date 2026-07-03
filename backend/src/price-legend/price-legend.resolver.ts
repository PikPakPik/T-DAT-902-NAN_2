import { Args, Query, Resolver } from '@nestjs/graphql';
import { PriceLegendScopeInput } from './price-legend.input';
import { PriceLegendType } from './price-legend.object-type';
import { PriceLegendService } from './price-legend.service';

@Resolver(() => PriceLegendType)
export class PriceLegendResolver {
  constructor(private readonly priceLegendService: PriceLegendService) {}

  @Query(() => PriceLegendType, {
    name: 'priceLegend',
    description: 'Min, mediane et max du prix au m2 pour un territoire',
  })
  priceLegend(
    @Args('scope') scope: PriceLegendScopeInput,
  ): Promise<PriceLegendType> {
    return this.priceLegendService.getLegend(scope);
  }
}
