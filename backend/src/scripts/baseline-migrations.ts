import AppDataSource from '../datasource';

/** Migrations déjà reflétées par le schéma actuel (tables + geom PostGIS). */
const BASELINE_MIGRATIONS = [
  { timestamp: 1776342239436, name: 'Mig330e2400d96a4891776342239436' },
  { timestamp: 1777000000000, name: 'MigPostgisGeometry1777000000000' },
] as const;

async function tableExists(table: string): Promise<boolean> {
  const rows = await AppDataSource.query<{ exists: boolean }[]>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    ) AS exists
    `,
    [table],
  );
  return rows[0]?.exists === true;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await AppDataSource.query<{ exists: boolean }[]>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
    ) AS exists
    `,
    [table, column],
  );
  return rows[0]?.exists === true;
}

async function migrationRecorded(name: string): Promise<boolean> {
  const rows = await AppDataSource.query<{ exists: boolean }[]>(
    `
    SELECT EXISTS (
      SELECT 1 FROM migrations WHERE name = $1
    ) AS exists
    `,
    [name],
  );
  return rows[0]?.exists === true;
}

async function recordMigration(
  timestamp: number,
  name: string,
): Promise<void> {
  await AppDataSource.query(
    `INSERT INTO migrations (timestamp, name) VALUES ($1, $2)`,
    [timestamp, name],
  );
}

async function main(): Promise<void> {
  await AppDataSource.initialize();

  try {
    const hasRegions = await tableExists('regions');
    if (!hasRegions) {
      console.log(
        'Aucune table "regions" : rien à baseliner. Lance les migrations normalement.',
      );
      return;
    }

    const hasGeom = await columnExists('regions', 'geom');

    for (const migration of BASELINE_MIGRATIONS) {
      if (
        migration.name === 'MigPostgisGeometry1777000000000' &&
        !hasGeom
      ) {
        console.log(
          `Skip ${migration.name} : colonne geom absente (migration PostGIS requise).`,
        );
        continue;
      }

      if (await migrationRecorded(migration.name)) {
        console.log(`Déjà enregistrée : ${migration.name}`);
        continue;
      }

      await recordMigration(migration.timestamp, migration.name);
      console.log(`Baselined : ${migration.name}`);
    }

    console.log(
      '\nHistorique aligné. Lance : npm run typeorm:migration:run',
    );
  } finally {
    await AppDataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
