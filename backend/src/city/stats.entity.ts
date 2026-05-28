import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { City } from './city.entity';

@Entity({ name: 'stats_cities' })
export class Stats {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => City, (city) => city.stats)
  city: City;

  @Column({ type: 'smallint' })
  annee: number;

  @Column({ type: 'varchar' })
  type_local: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  prix_median_m2: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  prix_moyen_m2: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  surface_mediane: number;

  @Column({ type: 'integer' })
  nb_transactions: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  evolution_prix_pct: number;
}
