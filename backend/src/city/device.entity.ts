import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
} from 'typeorm';
import { City } from './city.entity';

@Index('idx_devices_city_id', ['city'])
@Entity({ name: 'devices' })
export class Device {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => City, (city) => city.devices)
  city: City;

  @Column({ type: 'varchar' })
  nom: string;

  @Column({ type: 'varchar', default: '' })
  address: string;

  @Column({ type: 'varchar', default: '' })
  typequ: string;

  @Column({ type: 'varchar', default: '' })
  categorie: string;

  @Column({ type: 'varchar', default: '' })
  dom: string;

  @Column({ type: 'varchar', default: '' })
  sdom: string;

  @Column({ type: 'varchar', default: '' })
  libcom: string;

  @Column({ type: 'double precision' })
  longitude: number;

  @Column({ type: 'double precision' })
  latitude: number;
}
