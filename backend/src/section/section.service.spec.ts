import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { parisBounds } from '../test/map-bounds.fixture';
import { Section } from './section.entity';
import { SectionService } from './section.service';

describe('SectionService', () => {
  let service: SectionService;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SectionService,
        {
          provide: getRepositoryToken(Section),
          useValue: { query },
        },
      ],
    }).compile();

    service = module.get(SectionService);
  });

  const sampleRow = {
    id: 10,
    code: '1',
    prefixe: '0',
    name: '750560001',
    geometry: '{"type":"MultiPolygon","coordinates":[]}',
    prixMedianM2: '9200.00',
  };

  it('findInBounds maps sections cadastrales', async () => {
    query.mockResolvedValue([sampleRow]);

    const sections = await service.findInBounds(parisBounds);

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('sections s');
    expect(sql).toContain('s.geom && ST_MakeEnvelope');
    expect(sql).toContain('ST_Intersects(s.geom, ST_MakeEnvelope');
    expect(sql).toContain('stats_sections');
    expect(sql).not.toContain('mutation_locals');
    expect(params).toEqual([
      parisBounds.topLeftLng,
      parisBounds.bottomRightLat,
      parisBounds.bottomRightLng,
      parisBounds.topLeftLat,
    ]);
    expect(sections).toEqual([
      {
        id: 10,
        code: '1',
        prefixe: '0',
        name: '750560001',
        geometry: '{"type":"MultiPolygon","coordinates":[]}',
        prixMedianM2: 9200,
      },
    ]);
  });

  it('findByCityId filters by cityId', async () => {
    query.mockResolvedValue([sampleRow]);

    const sections = await service.findByCityId(75056);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('s."cityId" = $1'),
      [75056],
    );
    expect(query.mock.calls[0][0]).toContain('stats_sections');
    expect(sections).toHaveLength(1);
    expect(sections[0]?.name).toBe('750560001');
  });
});
