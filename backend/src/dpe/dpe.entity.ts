import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Plot } from '../plot/plot.entity';

@Entity({ name: 'dpes' })
export class Dpe {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Plot, (plot) => plot.dpes)
  plot: Plot

  @Column({ type: 'varchar' })
  dpe_id: string;

  @Column({ type: 'smallint' })
  annee: number;

  @Column({ type: 'varchar' })
  classe_energie: string;

  @Column({ type: 'varchar' })
  classe_ges: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  surface_habitable: number;

  @Column({ type: 'varchar' })
  type_batiment: string;

  @Column({ type: 'smallint' })
  annee_construction: number;

  @Column({ type: 'varchar' })
  code_insee: string;

  @Column({ type: 'point' })
  longitude: number;

  @Column({ type: 'point' })
  latitude: number;
}