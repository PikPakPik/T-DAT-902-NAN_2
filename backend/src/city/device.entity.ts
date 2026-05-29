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
  typequ: string;

  @Column({ type: 'varchar' })
  categorie: string;

  @Column({ type: 'varchar' })
  nom: string;

  @Column({ type: 'point' })
  longitude: number;

  @Column({ type: 'point' })
  latitude: number;
}
