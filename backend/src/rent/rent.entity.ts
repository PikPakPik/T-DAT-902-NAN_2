import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
} from 'typeorm';
import { City } from '../city/city.entity';

@Index('idx_rents_city_id', ['city'])
@Entity({ name: 'rents' })
export class Rent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'smallint' })
  annee: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  loyer_median_apt: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  loyer_median_t1t2: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  loyer_median_t3plus: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  loyer_median_maison: number;

  @Column({ type: 'int', nullable: true })
  nb_observations: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  r2: number;

  @ManyToOne(() => City, (city) => city.rents)
  city: City;
}
