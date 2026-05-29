import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Region } from './region.entity';
import { RegionResolver } from './region.resolver';
import { RegionService } from './region.service';

@Module({
  imports: [TypeOrmModule.forFeature([Region])],
  providers: [RegionService, RegionResolver],
  exports: [RegionService],
})
export class RegionModule {}
