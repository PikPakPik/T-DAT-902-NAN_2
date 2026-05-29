import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  Index,
} from 'typeorm';
import { Section } from '../section/section.entity';
import { Mutation } from '../mutation/mutation.entity';
import { Dpe } from '../dpe/dpe.entity';

@Index('idx_plots_geom', ['geom'], { spatial: true })
@Index('idx_plots_section_id', ['section'])
@Entity({ name: 'plots' })
export class Plot {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'geometry', spatialFeatureType: 'MultiPolygon', srid: 4326 })
  geom: object;

  @Column()
  number: string;

  @Column()
  capacity: string;

  @ManyToOne(() => Section, (section) => section.plots)
  section: Section;

  @OneToMany(() => Mutation, (mutation) => mutation.plot)
  mutations: Mutation[];

  @OneToMany(() => Dpe, (dpe) => dpe.plot)
  dpes: Dpe[];

  getIdentifier(): string {
    const sectionCode = this.section.code.padStart(2, '0');
    const number = this.number.padStart(4, '0');
    return `${this.section.city.code}${this.section.prefixe}${sectionCode}${number}`;
  }
}
