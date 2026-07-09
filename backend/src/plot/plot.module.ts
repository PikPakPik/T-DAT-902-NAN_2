import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plot } from './plot.entity';
import { PlotResolver } from './plot.resolver';
import { PlotService } from './plot.service';

@Module({
  imports: [TypeOrmModule.forFeature([Plot])],
  providers: [PlotService, PlotResolver],
  exports: [PlotService],
})
export class PlotModule {}
