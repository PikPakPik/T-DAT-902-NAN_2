import { Module } from '@nestjs/common';
import { CityModule } from '../city/city.module';
import { DepartmentModule } from '../department/department.module';
import { PlotModule } from '../plot/plot.module';
import { RegionModule } from '../region/region.module';
import { SectionModule } from '../section/section.module';
import { GraphqlTestResolver } from './graphql-test.resolver';

@Module({
  imports: [
    RegionModule,
    DepartmentModule,
    CityModule,
    SectionModule,
    PlotModule,
  ],
  providers: [GraphqlTestResolver],
})
export class AppGraphqlModule {}
