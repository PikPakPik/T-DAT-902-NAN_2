import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { MapBoundsInput } from '../department/bounds.input';
import { PlotType } from './plot.object-type';
import { PlotService } from './plot.service';

@Resolver(() => PlotType)
export class PlotResolver {
  constructor(private readonly plotService: PlotService) {}

  @Query(() => [PlotType], {
    name: 'plotsInBounds',
    description: 'Parcelles cadastrales intersectant la zone visible',
  })
  plotsInBounds(
    @Args('bounds', { type: () => MapBoundsInput }) bounds: MapBoundsInput,
  ): Promise<PlotType[]> {
    return this.plotService.findInBounds(bounds);
  }

  @Query(() => [PlotType], {
    name: 'plotsBySection',
    description: 'Parcelles cadastrales d une section',
  })
  plotsBySection(
    @Args('sectionId', { type: () => Int }) sectionId: number,
  ): Promise<PlotType[]> {
    return this.plotService.findBySectionId(sectionId);
  }

  @Query(() => PlotType, {
    name: 'plotDetails',
    nullable: true,
    description: 'Detail DVF d une parcelle cadastrale',
  })
  plotDetails(
    @Args('plotId', { type: () => Int }) plotId: number,
  ): Promise<PlotType | null> {
    return this.plotService.findDetailsById(plotId);
  }
}
