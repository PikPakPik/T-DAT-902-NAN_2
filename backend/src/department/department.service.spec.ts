import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { franceBounds } from '../test/map-bounds.fixture';
import { Department } from './department.entity';
import { DepartmentService } from './department.service';

describe('DepartmentService', () => {
  let service: DepartmentService;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepartmentService,
        {
          provide: getRepositoryToken(Department),
          useValue: { query },
        },
      ],
    }).compile();

    service = module.get(DepartmentService);
  });

  it('findInBounds queries PostGIS with envelope coordinates', async () => {
    query.mockResolvedValue([
      {
        id: 75,
        name: 'Paris',
        code: '75',
        geometry: '{"type":"MultiPolygon","coordinates":[]}',
        prixMedianM2: '10500.00',
      },
    ]);

    const departments = await service.findInBounds(franceBounds);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ST_Intersects'),
      [
        franceBounds.topLeftLng,
        franceBounds.bottomRightLat,
        franceBounds.bottomRightLng,
        franceBounds.topLeftLat,
      ],
    );
    expect(departments).toEqual([
      {
        id: 75,
        name: 'Paris',
        code: '75',
        geometry: '{"type":"MultiPolygon","coordinates":[]}',
        prixMedianM2: 10500,
      },
    ]);
  });

  it('findInBounds returns null prixMedianM2 when absent', async () => {
    query.mockResolvedValue([
      {
        id: 23,
        name: 'Creuse',
        code: '23',
        geometry: '{"type":"MultiPolygon","coordinates":[]}',
        prixMedianM2: null,
      },
    ]);

    const departments = await service.findInBounds(franceBounds);

    expect(departments[0]?.prixMedianM2).toBeNull();
  });
});
