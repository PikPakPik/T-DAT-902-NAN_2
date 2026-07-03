import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigSectionStats1777900000000 implements MigrationInterface {
  name = 'MigSectionStats1777900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stats_sections" (
        "id" SERIAL NOT NULL,
        "annee" smallint NOT NULL,
        "type_local" character varying NOT NULL,
        "prix_median_m2" numeric(10, 2) NOT NULL,
        "prix_moyen_m2" numeric(10, 2) NOT NULL,
        "surface_mediane" numeric(10, 2) NOT NULL,
        "nb_transactions" integer NOT NULL,
        "evolution_prix_pct" numeric(10, 2) NOT NULL,
        "sectionId" integer,
        CONSTRAINT "PK_stats_sections" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_stats_sections_section_id"
      ON "stats_sections" ("sectionId")
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_stats_sections_section'
            AND conrelid = '"stats_sections"'::regclass
        ) THEN
          ALTER TABLE "stats_sections"
            ADD CONSTRAINT "FK_stats_sections_section" FOREIGN KEY ("sectionId")
            REFERENCES "sections"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "stats_sections"`);
  }
}

