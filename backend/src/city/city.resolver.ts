import { Args, Query, Resolver } from '@nestjs/graphql';
import { MapBoundsInput } from '../department/bounds.input';
import {
  AirQualityStatsType,
  CityType,
  CrimeStatsType,
  PopulationStatsType,
  RentStatsType,
} from './city.object-type';
import { CityService } from './city.service';

@Resolver(() => CityType)
export class CityResolver {
  constructor(private readonly cityService: CityService) {}

  @Query(() => [CityType], {
    name: 'citiesInBounds',
    description:
      'Communes intersectant la zone visible (bounds carte) avec GeoJSON et prix au m2',
  })
  citiesInBounds(
    @Args('bounds', { type: () => MapBoundsInput }) bounds: MapBoundsInput,
  ): Promise<CityType[]> {
    return this.cityService.findInBounds(bounds);
  }

  @Query(() => PopulationStatsType, {
    name: 'cityPopulation',
    nullable: true,
    description:
      'Population légale la plus récente (recensement INSEE) pour une commune',
  })
  cityPopulation(
    @Args('code', { description: 'Code INSEE commune' }) code: string,
  ): Promise<PopulationStatsType | null> {
    return this.cityService.findLatestPopulationByCode(code);
  }

  @Query(() => [PopulationStatsType], {
    name: 'cityPopulationHistory',
    description:
      'Historique de la population légale (recensement INSEE) pour une commune, toutes années disponibles',
  })
  cityPopulationHistory(
    @Args('code', { description: 'Code INSEE commune' }) code: string,
  ): Promise<PopulationStatsType[]> {
    return this.cityService.findPopulationHistoryByCode(code);
  }

  @Query(() => CrimeStatsType, {
    name: 'cityCrime',
    nullable: true,
    description:
      'Statistiques de criminalite les plus recentes pour une commune',
  })
  cityCrime(
    @Args('code', { description: 'Code INSEE commune' }) code: string,
  ): Promise<CrimeStatsType | null> {
    return this.cityService.findLatestCrimeByCode(code);
  }

  @Query(() => [CrimeStatsType], {
    name: 'cityCrimeHistory',
    description:
      'Historique des statistiques de criminalite pour une commune, toutes annees disponibles',
  })
  cityCrimeHistory(
    @Args('code', { description: 'Code INSEE commune' }) code: string,
  ): Promise<CrimeStatsType[]> {
    return this.cityService.findCrimeHistoryByCode(code);
  }

  @Query(() => RentStatsType, {
    name: 'cityRent',
    nullable: true,
    description: 'Statistiques de loyers les plus recentes pour une commune',
  })
  cityRent(
    @Args('code', { description: 'Code INSEE commune' }) code: string,
  ): Promise<RentStatsType | null> {
    return this.cityService.findLatestRentByCode(code);
  }

  @Query(() => [RentStatsType], {
    name: 'cityRentHistory',
    description:
      'Historique des statistiques de loyers pour une commune, toutes annees disponibles',
  })
  cityRentHistory(
    @Args('code', { description: 'Code INSEE commune' }) code: string,
  ): Promise<RentStatsType[]> {
    return this.cityService.findRentHistoryByCode(code);
  }

  @Query(() => AirQualityStatsType, {
    name: 'cityAirQuality',
    nullable: true,
    description: "Statistiques de qualite de l'air les plus recentes pour une commune",
  })
  cityAirQuality(
    @Args('code', { description: 'Code INSEE commune' }) code: string,
  ): Promise<AirQualityStatsType | null> {
    return this.cityService.findLatestAirQualityByCode(code);
  }

  @Query(() => [AirQualityStatsType], {
    name: 'cityAirQualityHistory',
    description:
      "Historique des statistiques de qualite de l'air pour une commune, toutes annees disponibles",
  })
  cityAirQualityHistory(
    @Args('code', { description: 'Code INSEE commune' }) code: string,
  ): Promise<AirQualityStatsType[]> {
    return this.cityService.findAirQualityHistoryByCode(code);
  }
}
