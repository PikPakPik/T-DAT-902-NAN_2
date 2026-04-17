import { DataSource } from 'typeorm';

const AppDataSource = new DataSource({
  type: 'postgres',
  url:
    process.env.POSTGRES_URL ||
    'postgresql://postgres:postgres@localhost:5432/homepedia',
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  migrationsRun: false,
});

export default AppDataSource;
