import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Dpe } from './dpe.entity';
import { DpeService } from './dpe.service';

describe('DpeService', () => {
  let service: DpeService;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DpeService,
        {
          provide: getRepositoryToken(Dpe),
          useValue: { query },
        },
      ],
    }).compile();

    service = module.get(DpeService);
  });

  it('returns null when the commune has no DPE', async () => {
    query.mockResolvedValueOnce([
      { total: 0, surface_moyenne: null, annee_moyenne: null },
    ]);

    const stats = await service.findStatsByCode('44109');

    expect(stats).toBeNull();
    // Distribution queries must be skipped when total is 0.
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('aggregates distributions and fills missing classes with zero', async () => {
    query
      .mockResolvedValueOnce([
        { total: 4, surface_moyenne: '82.50', annee_moyenne: '1975' },
      ])
      .mockResolvedValueOnce([
        { classe: 'D', count: 3 },
        { classe: 'C', count: 1 },
      ])
      .mockResolvedValueOnce([{ classe: 'D', count: 4 }]);

    const stats = await service.findStatsByCode('44109');

    expect(stats).not.toBeNull();
    expect(stats?.total).toBe(4);
    expect(stats?.surfaceHabitableMoyenne).toBe(82.5);
    expect(stats?.anneeConstructionMoyenne).toBe(1975);
    expect(stats?.classeEnergieMajoritaire).toBe('D');

    // Always A→G, in order, with percentages relative to the total.
    expect(stats?.classeEnergieDistribution.map((d) => d.classe)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'G',
    ]);
    const classeC = stats?.classeEnergieDistribution.find(
      (d) => d.classe === 'C',
    );
    expect(classeC).toEqual({ classe: 'C', count: 1, pourcentage: 25 });
    const classeA = stats?.classeEnergieDistribution.find(
      (d) => d.classe === 'A',
    );
    expect(classeA).toEqual({ classe: 'A', count: 0, pourcentage: 0 });
  });

  it('appends atypical classes after A→G', async () => {
    query
      .mockResolvedValueOnce([
        { total: 2, surface_moyenne: null, annee_moyenne: null },
      ])
      .mockResolvedValueOnce([
        { classe: 'E', count: 1 },
        { classe: null, count: 1 },
      ])
      .mockResolvedValueOnce([{ classe: 'E', count: 2 }]);

    const stats = await service.findStatsByCode('44109');

    expect(stats?.surfaceHabitableMoyenne).toBeNull();
    expect(stats?.anneeConstructionMoyenne).toBeNull();
    const classes = stats?.classeEnergieDistribution.map((d) => d.classe);
    expect(classes).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'N/A']);
  });
});
