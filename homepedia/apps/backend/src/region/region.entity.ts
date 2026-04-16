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

    @Column({ type: 'text' })
    wkb: string;

    @OneToMany(() => Department, (department) => department.region)
    departments: Department[]
}