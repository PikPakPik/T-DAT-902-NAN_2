import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { MapBoundsInput } from '../department/bounds.input';
import { SectionType } from './section.object-type';
import { SectionService } from './section.service';

@Resolver(() => SectionType)
export class SectionResolver {
  constructor(private readonly sectionService: SectionService) {}

  @Query(() => [SectionType], {
    name: 'sectionsInBounds',
    description: 'Sections cadastrales intersectant la zone visible',
  })
  sectionsInBounds(
    @Args('bounds', { type: () => MapBoundsInput }) bounds: MapBoundsInput,
  ): Promise<SectionType[]> {
    return this.sectionService.findInBounds(bounds);
  }

  @Query(() => [SectionType], {
    name: 'sectionsByCity',
    description: 'Sections cadastrales d une commune',
  })
  sectionsByCity(
    @Args('cityId', { type: () => Int }) cityId: number,
  ): Promise<SectionType[]> {
    return this.sectionService.findByCityId(cityId);
  }
}
