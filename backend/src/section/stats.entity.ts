import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Section } from './section.entity';

@Index('idx_stats_sections_section_id', ['section'])
@Entity({ name: 'stats_sections' })
export class Stats {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Section)
  section: Section;

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

