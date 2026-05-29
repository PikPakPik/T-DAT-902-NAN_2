import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
} from 'typeorm';
import { City } from './city.entity';

@Index('idx_crimes_cities_city_id', ['city'])
@Entity({ name: 'crimes_cities' })
export class Crime {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => City, (city) => city.id)
  city: City;

  @Column({ type: 'smallint' })
  annee: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  taux_cambriolages: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  taux_vols_armes: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  taux_vols_sans_viol: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  taux_violences_phys: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
