import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Department } from '../department/department.entity';
import { Section } from '../section/section.entity';
import { Rent } from '../rent/rent.entity';
import { Stats } from './stats.entity';
import { Populate } from './populate.entity';
import { Income } from './income.entity';
import { Crime } from './crime.entity';
import { AirQuality } from './airQuality.entity';
import { TransportStop } from './transportStop.entity';
import { Device } from './device.entity';

@Entity({ name: 'cities' })
export class City {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'simple-array' })
  names: string[];

  @Column()
  code: string;

  @Column()
  siren: string;

  @Column()
  epci: string;

  @Column({ type: 'simple-array' })
  zipCodes: string[];

  @Column({ type: 'geometry', spatialFeatureType: 'MultiPolygon', srid: 4326 })
  geom: object;

  @ManyToOne(() => Department, (department) => department.cities)
  department: Department;

  @OneToMany(() => Section, (section) => section.city)
  sections: Section[];

  @OneToMany(() => Rent, (rent) => rent.city)
  rents: Rent[];

  @OneToMany(() => Stats, (stat) => stat.city)
  stats: Stats[];

  @OneToMany(() => Populate, (populate) => populate.city)
  populate: Populate[];

  @OneToMany(() => Income, (income) => income.city)
  income: Income[];

  @OneToMany(() => Crime, (crime) => crime.city)
  crimes: Crime[];

  @OneToMany(() => AirQuality, (airQuality) => airQuality.city)
  airQualities: AirQuality[];

  @OneToMany(() => TransportStop, (transportStop) => transportStop.city)
  transportStops: TransportStop[];

  @OneToMany(() => Device, (device) => device.city)
  devices: Device[];
}
