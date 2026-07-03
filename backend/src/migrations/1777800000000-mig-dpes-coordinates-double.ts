import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigDpesCoordinatesDouble1777800000000
  implements MigrationInterface
{
  name = 'MigDpesCoordinatesDouble1777800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'dpes'
            AND column_name = 'longitude'
            AND udt_name = 'point'
        ) THEN
          ALTER TABLE "dpes"
          ALTER COLUMN "longitude" TYPE double precision
          USING "longitude"[0];
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'dpes'
            AND column_name = 'latitude'
            AND udt_name = 'point'
        ) THEN
          ALTER TABLE "dpes"
          ALTER COLUMN "latitude" TYPE double precision
          USING "latitude"[1];
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_dpes_code_insee"
      ON "dpes" ("code_insee")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_dpes_dpe_id"
      ON "dpes" ("dpe_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_dpes_dpe_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_dpes_code_insee"`);
    await queryRunner.query(`
      ALTER TABLE "dpes"
      ALTER COLUMN "latitude" TYPE point
      USING point("longitude", "latitude")
    `);
    await queryRunner.query(`
      ALTER TABLE "dpes"
      ALTER COLUMN "longitude" TYPE point
      USING point("longitude", "latitude"[1])
    `);
  }
}
