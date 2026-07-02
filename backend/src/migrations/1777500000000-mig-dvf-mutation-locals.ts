import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigDvfMutationLocals1777500000000 implements MigrationInterface {
  name = 'MigDvfMutationLocals1777500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // mutations passe au niveau "vente" : les champs par lot migrent vers
    // mutation_locals. plotId & id_parcelle sont désormais portés par le lot.
    await queryRunner.query(`
      ALTER TABLE "mutations" DROP CONSTRAINT IF EXISTS "FK_3449a621882881898ffeed85a98"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_mutations_plot_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_mutations_id_parcelle"`);

    await queryRunner.query(`
      ALTER TABLE "mutations"
        DROP COLUMN IF EXISTS "plotId",
        DROP COLUMN IF EXISTS "id_parcelle",
        DROP COLUMN IF EXISTS "type_local",
        DROP COLUMN IF EXISTS "surface_reelle_bati",
        DROP COLUMN IF EXISTS "nombre_pieces_principales",
        DROP COLUMN IF EXISTS "surface_terrain"
    `);
    await queryRunner.query(`
      ALTER TABLE "mutations"
        ADD COLUMN IF NOT EXISTS "nb_lots" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "surface_habitable" numeric(10, 2)
    `);
    await queryRunner.query(`
      ALTER TABLE "mutations" ALTER COLUMN "nb_lots" DROP DEFAULT
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mutation_locals" (
        "id" SERIAL NOT NULL,
        "type_local" character varying,
        "surface_reelle_bati" numeric(10, 2),
        "nombre_pieces_principales" integer,
        "surface_terrain" numeric(12, 2),
        "id_parcelle" character varying,
        "mutationId" integer,
        "plotId" integer,
        CONSTRAINT "PK_mutation_locals" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_mutation_locals_mutation_id" ON "mutation_locals" ("mutationId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_mutation_locals_plot_id" ON "mutation_locals" ("plotId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_mutation_locals_id_parcelle" ON "mutation_locals" ("id_parcelle")
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_mutation_locals_mutation'
            AND conrelid = '"mutation_locals"'::regclass
        ) THEN
          ALTER TABLE "mutation_locals"
            ADD CONSTRAINT "FK_mutation_locals_mutation" FOREIGN KEY ("mutationId")
            REFERENCES "mutations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_mutation_locals_plot'
            AND conrelid = '"mutation_locals"'::regclass
        ) THEN
          ALTER TABLE "mutation_locals"
            ADD CONSTRAINT "FK_mutation_locals_plot" FOREIGN KEY ("plotId")
            REFERENCES "plots"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "mutation_locals"`);

    await queryRunner.query(`
      ALTER TABLE "mutations"
        DROP COLUMN IF EXISTS "surface_habitable",
        DROP COLUMN IF EXISTS "nb_lots"
    `);
    await queryRunner.query(`
      ALTER TABLE "mutations"
        ADD COLUMN IF NOT EXISTS "plotId" integer,
        ADD COLUMN IF NOT EXISTS "id_parcelle" character varying,
        ADD COLUMN IF NOT EXISTS "type_local" character varying,
        ADD COLUMN IF NOT EXISTS "surface_reelle_bati" numeric(10, 2),
        ADD COLUMN IF NOT EXISTS "nombre_pieces_principales" integer,
        ADD COLUMN IF NOT EXISTS "surface_terrain" numeric(12, 2)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_mutations_id_parcelle" ON "mutations" ("id_parcelle")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_mutations_plot_id" ON "mutations" ("plotId")
    `);
    await queryRunner.query(`
      ALTER TABLE "mutations"
        ADD CONSTRAINT "FK_3449a621882881898ffeed85a98" FOREIGN KEY ("plotId")
        REFERENCES "plots"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
    `);
  }
}
