import { Args, Query, Resolver } from '@nestjs/graphql';
import { DpeStatsType } from './dpe.object-type';
import { DpeService } from './dpe.service';

@Resolver(() => DpeStatsType)
export class DpeResolver {
  constructor(private readonly dpeService: DpeService) {}

  @Query(() => DpeStatsType, {
    name: 'dpeStats',
    nullable: true,
    description:
      'Statistiques DPE agrégées pour une commune : répartition des classes énergie/GES, surface et année de construction moyennes (null si aucun diagnostic)',
  })
  dpeStats(
    @Args('code', { description: 'Code INSEE commune' }) code: string,
  ): Promise<DpeStatsType | null> {
    return this.dpeService.findStatsByCode(code);
  }
}
