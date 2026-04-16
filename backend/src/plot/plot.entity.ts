import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { Section } from '../section/section.entity';
import { Mutation } from '../mutation/mutation.entity';
import { Dpe } from '../dpe/dpe.entity';

@Entity({ name: 'plots' })
export class Plot {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  wkb: string;

  @Column()
  number: string;

  @Column()
  capacity: string

  @ManyToOne(() => Section, (section) => section.plots)
  section: Section

  @OneToMany(() => Mutation, (mutation) => mutation.plot)
  mutations: Mutation[]

  @OneToMany(() => Dpe, (dpe) => dpe.plot)
  dpes: Dpe[]

  getIdentifier(): string {
    const sectionCode = this.section.code.padStart(2, '0');
    const number = this.number.padStart(4, '0');
    return `${this.section.city.code}${this.section.prefixe}${sectionCode}${number}`;
  }
}
