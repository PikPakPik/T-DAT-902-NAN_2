import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Department } from './department.entity';

@Entity({ name: 'stats_departments' })
export class Stats {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Department, (department) => department.id)
  department: Department;

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
