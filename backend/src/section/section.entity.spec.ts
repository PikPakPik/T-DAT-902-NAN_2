import { City } from '../city/city.entity';
import { Section } from './section.entity';

describe('Section', () => {
  it('getIdentifier pads section code and concatenates city code', () => {
    const section = new Section();
    section.code = '1';
    section.prefixe = '0';
    section.city = { code: '75056' } as City;

    expect(section.getIdentifier()).toBe('75056001');
  });

  it('getIdentifier pads single-digit section codes', () => {
    const section = new Section();
    section.code = '5';
    section.prefixe = 'A';
    section.city = { code: '44109' } as City;

    expect(section.getIdentifier()).toBe('44109A05');
  });
});
