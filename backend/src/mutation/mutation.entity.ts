import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  Index,
} from 'typeorm';
import { MutationLocal } from './mutation-local.entity';

@Index('idx_mutations_id_mutation', ['id_mutation'])
@Index('idx_mutations_annee', ['annee'])
@Entity({ name: 'mutations' })
export class Mutation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  id_mutation: string;

  @Column({ type: 'date' })
  date_mutation: string;

  @Column({ type: 'smallint' })
  annee: number;

  @Column({ type: 'varchar' })
  nature_mutation: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  valeur_fonciere: number;

  @Column({ type: 'integer' })
  nb_lots: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  surface_habitable: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  prix_m2: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude: number | null;

  @Column({ type: 'double precision', nullable: true })
  latitude: number | null;

  @OneToMany(() => MutationLocal, (local) => local.mutation)
  locals: MutationLocal[];
}
