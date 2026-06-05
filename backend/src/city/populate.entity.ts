import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
} from 'typeorm';
import { City } from './city.entity';

@Index('idx_populate_cities_city_id', ['city'])
@Entity({ name: 'populate_cities' })
export class Populate {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => City, (city) => city.populate)
  city: City;

  @Column({ type: 'integer' })
  population: number;

  @Column({ type: 'smallint' })
  annee: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
