import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigPlotsParcelleKey1777600000000 implements MigrationInterface {
  name = 'MigPlotsParcelleKey1777600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Clé de section pré-calculée (commune5 + prefixe3 + section2 = 10 car.),
    // pour lier mutation_locals -> plots sans jointures sur substr() coûteuses.
    // On indexe sections (461k lignes) plutôt que plots (94M) : backfill léger.
    // Le remplissage est réalisé par prepare_sections_key.py (batché + logs).
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_plots_parcelle_key"`);
    await queryRunner.query(`
      ALTER TABLE "plots" DROP COLUMN IF EXISTS "parcelle_key"
    `);
    await queryRunner.query(`
      ALTER TABLE "sections"
        ADD COLUMN IF NOT EXISTS "section_key" character varying(10)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sections_section_key"
      ON "sections" ("section_key")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sections_section_key"`);
    await queryRunner.query(`
      ALTER TABLE "sections" DROP COLUMN IF EXISTS "section_key"
    `);
    await queryRunner.query(`
      ALTER TABLE "plots"
        ADD COLUMN IF NOT EXISTS "parcelle_key" character varying(14)
    `);
  }
}
