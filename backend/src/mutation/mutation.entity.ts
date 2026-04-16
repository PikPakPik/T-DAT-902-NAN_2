import { Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Plot } from '../plot/plot.entity';

@Entity({ name: 'mutations' })
export class Mutation {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Plot, (plot) => plot.mutations)
  plot: Plot
}