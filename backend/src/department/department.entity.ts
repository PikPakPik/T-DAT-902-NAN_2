import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
} from 'typeorm';
import { City } from '../city/city.entity';
import { Region } from '../region/region.entity';
import { Stats } from './stats.entity';

@Entity({ name: 'departments' })
export class Department {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  code: string;

  @Column({ type: 'text' })
  wkb: string;

  @ManyToOne(() => Region, (region) => region.departments)
  region: Region;

  @OneToMany(() => City, (city) => city.department)
  cities: City[];

  @OneToMany(() => Stats, (stat) => stat.department)
  stats: Stats[];
}
