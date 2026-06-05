import { Query, Resolver } from '@nestjs/graphql';
import { RegionType } from './region.object-type';
import { RegionService } from './region.service';

@Resolver(() => RegionType)
export class RegionResolver {
  constructor(private readonly regionService: RegionService) {}

  @Query(() => [RegionType], {
    name: 'regions',
    description: 'Liste des régions françaises avec leur contour GeoJSON',
  })
  regions(): Promise<RegionType[]> {
    return this.regionService.findAll();
  }
}
