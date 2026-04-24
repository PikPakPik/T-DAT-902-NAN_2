import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigPostgisGeometry1777000000000 implements MigrationInterface {
  name = 'MigPostgisGeometry1777000000000';

  private readonly tables = [
    'regions',
    'departments',
    'cities',
    'plots',
    'sections',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);

    for (const table of this.tables) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN "geom" geometry(MultiPolygon, 4326)`,
      );

      await queryRunner.query(`
        UPDATE "${table}"
        SET "geom" = ST_Multi(
          ST_SetSRID(
            ST_GeomFromWKB(decode(regexp_replace("wkb", '^\\\\x', ''), 'hex')),
            4326
          )
        )
        WHERE "wkb" IS NOT NULL AND "wkb" <> ''
      `);

      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "geom" SET NOT NULL`,
      );
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "wkb"`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN "wkb" text`);

      await queryRunner.query(`
        UPDATE "${table}"
        SET "wkb" = encode(ST_AsEWKB("geom"), 'hex')
        WHERE "geom" IS NOT NULL
      `);

      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "wkb" SET NOT NULL`,
      );
      await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "geom"`);
    }
  }
}
