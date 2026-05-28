import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { City } from './city.entity';

@Entity({ name: 'devices' })
export class Device {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => City, (city) => city.devices)
  city: City;

  @Column({ type: 'varchar' })
  typequ: string;

  @Column({ type: 'varchar' })
  categorie: string;

  @Column({ type: 'varchar' })
  nom: string;

  @Column({ type: 'point' })
  longitude: number;

  @Column({ type: 'point' })
  latitude: number;
}
