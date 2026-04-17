import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { City } from './city.entity';

@Entity({ name: 'air_quality' })
export class AirQuality {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => City, (city) => city.id)
  city: City;

  @Column({ type: 'smallint' })
  annee: number;

  @Column({ type: 'smallint' })
  indice_atmo_median: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  pm25_median: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  pm10_median: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  no2_median: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  o3_median: number;

  @Column({ type: 'integer' })
  nb_jours_bon: number;

  @Column({ type: 'integer' })
  nb_jours_moyen: number;

  @Column({ type: 'integer' })
  nb_jours_mauvais: number;
}
