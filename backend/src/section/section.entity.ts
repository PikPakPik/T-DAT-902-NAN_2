import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  Index,
} from 'typeorm';
import { City } from '../city/city.entity';
import { Plot } from '../plot/plot.entity';

@Index('idx_sections_geom', ['geom'], { spatial: true })
@Index('idx_sections_city_id', ['city'])
@Index('idx_sections_section_key', ['section_key'])
@Entity({ name: 'sections' })
export class Section {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  prefixe: string;

  @Column()
  code: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  section_key: string | null;

  @Column({ type: 'geometry', spatialFeatureType: 'MultiPolygon', srid: 4326 })
  geom: object;

  @ManyToOne(() => City, (city) => city.sections)
  city: City;

  @OneToMany(() => Plot, (plot) => plot.section)
  plots: Plot[];

  getIdentifier(): string {
    const code = this.code.padStart(2, '0');
    return `${this.city.code}${this.prefixe}${code}`;
  }
}
