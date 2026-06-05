import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
  Index,
} from 'typeorm';
import { City } from '../city/city.entity';
import { Region } from '../region/region.entity';
import { Stats } from './stats.entity';

@Index('idx_departments_geom', ['geom'], { spatial: true })
@Index('idx_departments_region_id', ['region'])
@Entity({ name: 'departments' })
export class Department {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  code: string;

  @Column({ type: 'geometry', spatialFeatureType: 'MultiPolygon', srid: 4326 })
  geom: object;

  @ManyToOne(() => Region, (region) => region.departments)
  region: Region;

  @OneToMany(() => City, (city) => city.department)
  cities: City[];

  @OneToMany(() => Stats, (stat) => stat.department)
  stats: Stats[];
}
