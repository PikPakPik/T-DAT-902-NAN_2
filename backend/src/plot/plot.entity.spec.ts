import { City } from '../city/city.entity';
import { Section } from '../section/section.entity';
import { Plot } from './plot.entity';

describe('Plot', () => {
  it('getIdentifier builds cadastral parcel code', () => {
    const plot = new Plot();
    plot.number = '42';
    plot.section = {
      code: '1',
      prefixe: '0',
      city: { code: '75056' } as City,
    } as Section;

    expect(plot.getIdentifier()).toBe('750560010042');
  });
});
