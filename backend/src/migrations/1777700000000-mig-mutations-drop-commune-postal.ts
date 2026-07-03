import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigMutationsDropCommunePostal1777700000000 implements MigrationInterface {
  name = 'MigMutationsDropCommunePostal1777700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // code_commune / nom_commune / code_departement / code_postal retires :
    // la localisation se remonte via
    // mutation_locals.plotId -> plots -> sections -> cities.
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_mutations_code_commune"`,
    );
    await queryRunner.query(`
      ALTER TABLE "mutations"
        DROP COLUMN IF EXISTS "code_commune",
        DROP COLUMN IF EXISTS "nom_commune",
        DROP COLUMN IF EXISTS "code_departement",
        DROP COLUMN IF EXISTS "code_postal"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "mutations"
        ADD COLUMN IF NOT EXISTS "code_commune" character varying NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "nom_commune" character varying NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "code_departement" character varying NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "code_postal" character varying
    `);
    await queryRunner.query(`
      ALTER TABLE "mutations"
        ALTER COLUMN "code_commune" DROP DEFAULT,
        ALTER COLUMN "nom_commune" DROP DEFAULT,
        ALTER COLUMN "code_departement" DROP DEFAULT
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_mutations_code_commune"
      ON "mutations" ("code_commune")
    `);
  }
}
