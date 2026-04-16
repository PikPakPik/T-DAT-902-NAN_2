import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
import { City } from '../city/city.entity';
import { Plot } from '../plot/plot.entity';

@Entity({ name: 'sections' })
export class Section {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  prefixe: string;

  @Column()
  code: string;

  @Column({ type: 'text' })
  wkb: string;

  @ManyToOne(() => City, (city) => city.sections)
  city: City

  @OneToMany(() => Plot, (plot) => plot.section)
  plots: Plot[]

  getIdentifier(): string {
    const code = this.code.padStart(2, '0');
    return `${this.city.code}${this.prefixe}${code}`;
  }
}
