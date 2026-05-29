import { Entity, ManyToOne, PrimaryGeneratedColumn, Index } from 'typeorm';
import { Plot } from '../plot/plot.entity';

@Index('idx_mutations_plot_id', ['plot'])
@Entity({ name: 'mutations' })
export class Mutation {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Plot, (plot) => plot.mutations)
  plot: Plot;
}
