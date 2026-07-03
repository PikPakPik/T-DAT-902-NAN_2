import { Module } from '@nestjs/common';
import { PriceLegendResolver } from './price-legend.resolver';
import { PriceLegendService } from './price-legend.service';

@Module({
  providers: [PriceLegendResolver, PriceLegendService],
})
export class PriceLegendModule {}
