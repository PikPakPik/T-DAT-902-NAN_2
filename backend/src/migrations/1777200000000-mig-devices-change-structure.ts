import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigDevicesChangeStructure1777200000000 implements MigrationInterface {
  name = 'MigDevicesChangeStructure1777200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "devices" DROP COLUMN IF EXISTS "typequ"
    `);
    await queryRunner.query(`
      ALTER TABLE "devices" DROP COLUMN IF EXISTS "categorie"
    `);
    await queryRunner.query(`
      ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "address" character varying NOT NULL DEFAULT ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "devices"
      ADD COLUMN IF NOT EXISTS "typequ" character varying NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "devices"
      ADD COLUMN IF NOT EXISTS "categorie" character varying NOT NULL DEFAULT ''
    `);
    await queryRunner.query(`
      ALTER TABLE "devices" DROP COLUMN IF EXISTS "address"
    `);
  }
}
