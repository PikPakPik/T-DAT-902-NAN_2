import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
} from 'typeorm';
import { City } from './city.entity';

@Index('idx_transport_stops_city_id', ['city'])
@Entity({ name: 'transport_stops' })
export class TransportStop {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => City, (city) => city.transportStops)
  city: City;

  @Column({ type: 'varchar' })
  stop_id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar' })
  mode: string;

  @Column({ type: 'point' })
  longitude: number;

  @Column({ type: 'point' })
  latitude: number;
}
