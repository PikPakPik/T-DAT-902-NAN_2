import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { City } from './city.entity';
import { Populate } from './populate.entity';
import { CityResolver } from './city.resolver';
import { CityService } from './city.service';

@Module({
  imports: [TypeOrmModule.forFeature([City, Populate])],
  providers: [CityService, CityResolver],
  exports: [CityService],
})
export class CityModule {}
