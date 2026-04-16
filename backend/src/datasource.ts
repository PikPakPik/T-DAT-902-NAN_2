import { DataSource } from 'typeorm';

const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.POSTGRES_URL || 'postgresql://postgres:postgres@localhost:5432/homepedia',
  synchronize: false,
  entities: ['src/../**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  migrationsRun: false,
  logging: true,
});

export default AppDataSource;