import { Args, Query, Resolver } from '@nestjs/graphql';
import { MapBoundsInput } from './bounds.input';
import { DepartmentType } from './department.object-type';
import { DepartmentService } from './department.service';

@Resolver(() => DepartmentType)
export class DepartmentResolver {
  constructor(private readonly departmentService: DepartmentService) {}

  @Query(() => [DepartmentType], {
    name: 'departmentsInBounds',
    description:
      'Departements intersectant la zone visible (bounds carte) avec GeoJSON et prix au m2',
  })
  departmentsInBounds(
    @Args('bounds', { type: () => MapBoundsInput }) bounds: MapBoundsInput,
  ): Promise<DepartmentType[]> {
    return this.departmentService.findInBounds(bounds);
  }
}
