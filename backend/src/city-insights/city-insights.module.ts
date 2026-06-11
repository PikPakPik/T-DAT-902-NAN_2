import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { City as MongoCity, CitySchema } from '../city/city.schema';
import { Review, ReviewSchema } from '../review/review.schema';
import { CityInsightsResolver } from './city-insights.resolver';
import { CityInsightsService } from './city-insights.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MongoCity.name, schema: CitySchema },
      { name: Review.name, schema: ReviewSchema },
    ]),
  ],
  providers: [CityInsightsService, CityInsightsResolver],
  exports: [CityInsightsService],
})
export class CityInsightsModule {}
