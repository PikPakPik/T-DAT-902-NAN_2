import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Department } from '../department/department.entity';

@Entity({ name: 'regions' })
export class Region {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  code: string;

  @Column({ type: 'geometry', spatialFeatureType: 'MultiPolygon', srid: 4326 })
  geom: object;

  @OneToMany(() => Department, (department) => department.region)
  departments: Department[];
}
