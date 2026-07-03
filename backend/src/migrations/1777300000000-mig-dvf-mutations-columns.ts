import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigDvfMutationsColumns1777300000000 implements MigrationInterface {
  name = 'MigDvfMutationsColumns1777300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "mutations"
        ADD COLUMN IF NOT EXISTS "id_mutation" character varying NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "date_mutation" date NOT NULL DEFAULT '1970-01-01',
        ADD COLUMN IF NOT EXISTS "annee" smallint NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "nature_mutation" character varying NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "valeur_fonciere" numeric(14, 2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "code_commune" character varying NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "nom_commune" character varying NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "code_departement" character varying NOT NULL DEFAULT '',
        ADD COLUMN IF NOT EXISTS "code_postal" character varying,
        ADD COLUMN IF NOT EXISTS "type_local" character varying,
        ADD COLUMN IF NOT EXISTS "surface_reelle_bati" numeric(10, 2),
        ADD COLUMN IF NOT EXISTS "nombre_pieces_principales" integer,
        ADD COLUMN IF NOT EXISTS "surface_terrain" numeric(12, 2),
        ADD COLUMN IF NOT EXISTS "prix_m2" numeric(12, 2),
        ADD COLUMN IF NOT EXISTS "longitude" double precision,
        ADD COLUMN IF NOT EXISTS "latitude" double precision
    `);

    // Les valeurs par défaut ne servent qu'à la migration de lignes existantes ;
    // les nouvelles écritures DVF fournissent toujours ces colonnes.
    await queryRunner.query(`
      ALTER TABLE "mutations"
        ALTER COLUMN "id_mutation" DROP DEFAULT,
        ALTER COLUMN "date_mutation" DROP DEFAULT,
        ALTER COLUMN "annee" DROP DEFAULT,
        ALTER COLUMN "nature_mutation" DROP DEFAULT,
        ALTER COLUMN "valeur_fonciere" DROP DEFAULT,
        ALTER COLUMN "code_commune" DROP DEFAULT,
        ALTER COLUMN "nom_commune" DROP DEFAULT,
        ALTER COLUMN "code_departement" DROP DEFAULT
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_mutations_id_mutation" ON "mutations" ("id_mutation")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_mutations_code_commune" ON "mutations" ("code_commune")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_mutations_annee" ON "mutations" ("annee")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_mutations_annee"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_mutations_code_commune"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_mutations_id_mutation"
    `);
    await queryRunner.query(`
      ALTER TABLE "mutations"
        DROP COLUMN IF EXISTS "latitude",
        DROP COLUMN IF EXISTS "longitude",
        DROP COLUMN IF EXISTS "prix_m2",
        DROP COLUMN IF EXISTS "surface_terrain",
        DROP COLUMN IF EXISTS "nombre_pieces_principales",
        DROP COLUMN IF EXISTS "surface_reelle_bati",
        DROP COLUMN IF EXISTS "type_local",
        DROP COLUMN IF EXISTS "code_postal",
        DROP COLUMN IF EXISTS "code_departement",
        DROP COLUMN IF EXISTS "nom_commune",
        DROP COLUMN IF EXISTS "code_commune",
        DROP COLUMN IF EXISTS "valeur_fonciere",
        DROP COLUMN IF EXISTS "nature_mutation",
        DROP COLUMN IF EXISTS "annee",
        DROP COLUMN IF EXISTS "date_mutation",
        DROP COLUMN IF EXISTS "id_mutation"
    `);
  }
}
