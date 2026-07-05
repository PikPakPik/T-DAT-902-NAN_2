import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { MapBoundsInput } from '../department/bounds.input';
import { DeviceType } from './device.object-type';
import { DeviceService } from './device.service';

@Resolver(() => DeviceType)
export class DeviceResolver {
  constructor(private readonly deviceService: DeviceService) {}

  @Query(() => [DeviceType], {
    name: 'devicesInBounds',
    description: 'Equipements BPE geolocalises dans la zone visible',
  })
  devicesInBounds(
    @Args('bounds', { type: () => MapBoundsInput }) bounds: MapBoundsInput,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<DeviceType[]> {
    return this.deviceService.findInBounds(bounds, limit ?? 2500);
  }

  @Query(() => [DeviceType], {
    name: 'devicesNearPlot',
    description: 'Equipements BPE proches d une parcelle',
  })
  devicesNearPlot(
    @Args('plotId', { type: () => Int }) plotId: number,
    @Args('radiusMeters', { type: () => Int, nullable: true })
    radiusMeters?: number,
    @Args('limit', { type: () => Int, nullable: true }) limit?: number,
  ): Promise<DeviceType[]> {
    return this.deviceService.findNearPlot(plotId, radiusMeters ?? 500, limit ?? 30);
  }
}
