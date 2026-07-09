import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { parisBounds } from '../test/map-bounds.fixture';
import { City } from './city.entity';
import { CityService } from './city.service';

describe('CityService', () => {
  let service: CityService;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CityService,
        {
          provide: getRepositoryToken(City),
          useValue: { query },
        },
      ],
    }).compile();

    service = module.get(CityService);
  });

  it('findInBounds maps communes with prixMedianM2', async () => {
    query.mockResolvedValue([
      {
        id: 75056,
        name: 'Paris',
        code: '75056',
        geometry: '{"type":"MultiPolygon","coordinates":[]}',
        prixMedianM2: '9800.25',
        criminaliteScore: '42.5',
        loyerMedianApt: '18.7',
      },
    ]);

    const cities = await service.findInBounds(parisBounds);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('stats_cities'),
      [
        parisBounds.topLeftLng,
        parisBounds.bottomRightLat,
        parisBounds.bottomRightLng,
        parisBounds.topLeftLat,
      ],
    );
    expect(cities).toEqual([
      {
        id: 75056,
        name: 'Paris',
        code: '75056',
        criminaliteScore: 42.5,
        densite: null,
        geometry: '{"type":"MultiPolygon","coordinates":[]}',
        loyerMedianApt: 18.7,
        prixMedianM2: 9800.25,
      },
    ]);
  });

  it('findInBounds returns an empty list when no communes match', async () => {
    query.mockResolvedValue([]);

    await expect(service.findInBounds(parisBounds)).resolves.toEqual([]);
  });
});
