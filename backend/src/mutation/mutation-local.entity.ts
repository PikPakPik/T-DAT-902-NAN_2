import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
} from 'typeorm';
import { Mutation } from './mutation.entity';
import { Plot } from '../plot/plot.entity';

@Index('idx_mutation_locals_mutation_id', ['mutation'])
@Index('idx_mutation_locals_plot_id', ['plot'])
@Index('idx_mutation_locals_id_parcelle', ['id_parcelle'])
@Entity({ name: 'mutation_locals' })
export class MutationLocal {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Mutation, (mutation) => mutation.locals, {
    onDelete: 'CASCADE',
  })
  mutation: Mutation;

  @Column({ type: 'varchar', nullable: true })
  type_local: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  surface_reelle_bati: number | null;

  @Column({ type: 'integer', nullable: true })
  nombre_pieces_principales: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  surface_terrain: number | null;

  @Column({ type: 'varchar', nullable: true })
  id_parcelle: string | null;

  @ManyToOne(() => Plot, (plot) => plot.mutationLocals, { nullable: true })
  plot: Plot | null;
}
