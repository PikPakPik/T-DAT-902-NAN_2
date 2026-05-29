import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Region } from './region.entity';
import { RegionService } from './region.service';

describe('RegionService', () => {
  let service: RegionService;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegionService,
        {
          provide: getRepositoryToken(Region),
          useValue: { query },
        },
      ],
    }).compile();

    service = module.get(RegionService);
  });

  it('findAll maps database rows to GraphQL types', async () => {
    query.mockResolvedValue([
      {
        id: 1,
        name: 'Bretagne',
        code: '53',
        geometry: '{"type":"MultiPolygon","coordinates":[]}',
        prixMedianM2: '2450.50',
      },
      {
        id: 2,
        name: 'Normandie',
        code: '28',
        geometry: '{"type":"MultiPolygon","coordinates":[]}',
        prixMedianM2: null,
      },
    ]);

    const regions = await service.findAll();

    expect(regions).toEqual([
      {
        id: 1,
        name: 'Bretagne',
        code: '53',
        geometry: '{"type":"MultiPolygon","coordinates":[]}',
        prixMedianM2: 2450.5,
      },
      {
        id: 2,
        name: 'Normandie',
        code: '28',
        geometry: '{"type":"MultiPolygon","coordinates":[]}',
        prixMedianM2: null,
      },
    ]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('findAll returns an empty list when no regions exist', async () => {
    query.mockResolvedValue([]);

    await expect(service.findAll()).resolves.toEqual([]);
  });
});
