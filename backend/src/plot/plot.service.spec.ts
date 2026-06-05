import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { parisBounds } from '../test/map-bounds.fixture';
import { Plot } from './plot.entity';
import { PlotService } from './plot.service';

describe('PlotService', () => {
  let service: PlotService;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlotService,
        {
          provide: getRepositoryToken(Plot),
          useValue: { query },
        },
      ],
    }).compile();

    service = module.get(PlotService);
  });

  const sampleRow = {
    id: 100,
    number: '42',
    name: '7505600010042',
    geometry: '{"type":"MultiPolygon","coordinates":[]}',
    prixMedianM2: null,
  };

  it('findInBounds maps parcelles', async () => {
    query.mockResolvedValue([sampleRow]);

    const plots = await service.findInBounds(parisBounds);

    expect(query).toHaveBeenCalledWith(expect.stringContaining('plots p'), [
      parisBounds.topLeftLng,
      parisBounds.bottomRightLat,
      parisBounds.bottomRightLng,
      parisBounds.topLeftLat,
    ]);
    expect(plots).toEqual([
      {
        id: 100,
        number: '42',
        name: '7505600010042',
        geometry: '{"type":"MultiPolygon","coordinates":[]}',
        prixMedianM2: null,
      },
    ]);
  });

  it('findBySectionId filters by sectionId', async () => {
    query.mockResolvedValue([sampleRow]);

    const plots = await service.findBySectionId(10);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('p."sectionId" = $1'),
      [10],
    );
    expect(plots[0]?.number).toBe('42');
  });
});
