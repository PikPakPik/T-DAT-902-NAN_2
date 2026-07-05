import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigDevicesCoordinatesDouble1778000000000
  implements MigrationInterface
{
  name = 'MigDevicesCoordinatesDouble1778000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "devices"
      ADD COLUMN IF NOT EXISTS "typequ" character varying NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "devices"
      ADD COLUMN IF NOT EXISTS "categorie" character varying NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "devices"
      ADD COLUMN IF NOT EXISTS "dom" character varying NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "devices"
      ADD COLUMN IF NOT EXISTS "sdom" character varying NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "devices"
      ADD COLUMN IF NOT EXISTS "libcom" character varying NOT NULL DEFAULT ''
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'devices'
            AND column_name = 'longitude'
            AND data_type = 'point'
        ) THEN
          ALTER TABLE "devices"
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
          WHERE table_name = 'devices'
            AND column_name = 'latitude'
            AND data_type = 'point'
        ) THEN
          ALTER TABLE "devices"
          ALTER COLUMN "latitude" TYPE double precision
          USING "latitude"[0];
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_devices_city_typequ"
      ON "devices" ("cityId", "typequ")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_devices_lon_lat"
      ON "devices" ("longitude", "latitude")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_devices_lon_lat"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_devices_city_typequ"`);
    await queryRunner.query(`
      ALTER TABLE "devices"
      ALTER COLUMN "latitude" TYPE point
      USING point("latitude", 0)
    `);
    await queryRunner.query(`
      ALTER TABLE "devices"
      ALTER COLUMN "longitude" TYPE point
      USING point("longitude", 0)
    `);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "libcom"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "sdom"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "dom"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "categorie"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "typequ"`);
  }
}
