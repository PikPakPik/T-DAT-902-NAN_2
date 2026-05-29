import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
} from 'typeorm';
import { City } from './city.entity';

@Index('idx_income_cities_city_id', ['city'])
@Entity({ name: 'income_cities' })
export class Income {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => City, (city) => city.income)
  city: City;

  @Column({ type: 'smallint' })
  annee: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  mediane_salaire: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  decile1_salaire: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  decile9_salaire: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  taux_pauvrete: number;

  @Column({ type: 'integer' })
  nb_menages: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
