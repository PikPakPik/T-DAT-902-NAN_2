import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigDvfMutationsParcelle1777400000000 implements MigrationInterface {
  name = 'MigDvfMutationsParcelle1777400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "mutations"
        ADD COLUMN IF NOT EXISTS "id_parcelle" character varying
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_mutations_id_parcelle" ON "mutations" ("id_parcelle")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_mutations_id_parcelle"
    `);
    await queryRunner.query(`
      ALTER TABLE "mutations" DROP COLUMN IF EXISTS "id_parcelle"
    `);
  }
}
