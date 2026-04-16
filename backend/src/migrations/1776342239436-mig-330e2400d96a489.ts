import { MigrationInterface, QueryRunner } from "typeorm";

export class Mig330e2400d96a4891776342239436 implements MigrationInterface {
    name = 'Mig330e2400d96a4891776342239436'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "regions" (
                "id" SERIAL NOT NULL,
                "name" character varying NOT NULL,
                "code" character varying NOT NULL,
                "wkb" text NOT NULL,
                CONSTRAINT "PK_4fcd12ed6a046276e2deb08801c" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "stats_departments" (
                "id" SERIAL NOT NULL,
                "annee" smallint NOT NULL,
                "type_local" character varying NOT NULL,
                "prix_median_m2" numeric(10, 2) NOT NULL,
                "prix_moyen_m2" numeric(10, 2) NOT NULL,
                "surface_mediane" numeric(10, 2) NOT NULL,
                "nb_transactions" integer NOT NULL,
                "evolution_prix_pct" numeric(10, 2) NOT NULL,
                "departmentId" integer,
                CONSTRAINT "PK_f018953ae79dc0f6b799efa4381" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "departments" (
                "id" SERIAL NOT NULL,
                "name" character varying NOT NULL,
                "code" character varying NOT NULL,
                "wkb" text NOT NULL,
                "regionId" integer,
                CONSTRAINT "PK_839517a681a86bb84cbcc6a1e9d" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "rents" (
                "id" SERIAL NOT NULL,
                "annee" smallint NOT NULL,
                "loyer_median_apt" numeric(10, 2),
                "loyer_median_t1t2" numeric(10, 2),
                "loyer_median_t3plus" numeric(10, 2),
                "loyer_median_maison" numeric(10, 2),
                "nb_observations" integer,
                "r2" numeric(10, 2),
                "cityId" integer,
                CONSTRAINT "PK_43a9961f1448a8d75f9b25156ea" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "stats_cities" (
                "id" SERIAL NOT NULL,
                "annee" smallint NOT NULL,
                "type_local" character varying NOT NULL,
                "prix_median_m2" numeric(10, 2) NOT NULL,
                "prix_moyen_m2" numeric(10, 2) NOT NULL,
                "surface_mediane" numeric(10, 2) NOT NULL,
                "nb_transactions" integer NOT NULL,
                "evolution_prix_pct" numeric(10, 2) NOT NULL,
                "cityId" integer,
                CONSTRAINT "PK_b3fd90a9961b5558e20b3a6bcde" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "populate_cities" (
                "id" SERIAL NOT NULL,
                "population" integer NOT NULL,
                "annee" smallint NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "cityId" integer,
                CONSTRAINT "PK_147f5cb90ac2fed55ca36447d13" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "income_cities" (
                "id" SERIAL NOT NULL,
                "annee" smallint NOT NULL,
                "mediane_salaire" numeric(10, 2) NOT NULL,
                "decile1_salaire" numeric(10, 2) NOT NULL,
                "decile9_salaire" numeric(10, 2) NOT NULL,
                "taux_pauvrete" numeric(10, 2) NOT NULL,
                "nb_menages" integer NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "cityId" integer,
                CONSTRAINT "PK_95c8050025d5f21d91416795ff6" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "crimes_cities" (
                "id" SERIAL NOT NULL,
                "annee" smallint NOT NULL,
                "taux_cambriolages" numeric(10, 2) NOT NULL,
                "taux_vols_armes" numeric(10, 2) NOT NULL,
                "taux_vols_sans_viol" numeric(10, 2) NOT NULL,
                "taux_violences_phys" numeric(10, 2) NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "cityId" integer,
                CONSTRAINT "PK_79a9b421063ad46c2d3ffd1f857" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "air_quality" (
                "id" SERIAL NOT NULL,
                "annee" smallint NOT NULL,
                "indice_atmo_median" smallint NOT NULL,
                "pm25_median" numeric(10, 2) NOT NULL,
                "pm10_median" numeric(10, 2) NOT NULL,
                "no2_median" numeric(10, 2) NOT NULL,
                "o3_median" numeric(10, 2) NOT NULL,
                "nb_jours_bon" integer NOT NULL,
                "nb_jours_moyen" integer NOT NULL,
                "nb_jours_mauvais" integer NOT NULL,
                "cityId" integer,
                CONSTRAINT "PK_a6610ad4c60b148aebb53530b37" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "transport_stops" (
                "id" SERIAL NOT NULL,
                "stop_id" character varying NOT NULL,
                "name" character varying NOT NULL,
                "mode" character varying NOT NULL,
                "longitude" point NOT NULL,
                "latitude" point NOT NULL,
                "cityId" integer,
                CONSTRAINT "PK_244d2d96ea285fc513134ad2728" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "devices" (
                "id" SERIAL NOT NULL,
                "typequ" character varying NOT NULL,
                "categorie" character varying NOT NULL,
                "nom" character varying NOT NULL,
                "longitude" point NOT NULL,
                "latitude" point NOT NULL,
                "cityId" integer,
                CONSTRAINT "PK_b1514758245c12daf43486dd1f0" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "cities" (
                "id" SERIAL NOT NULL,
                "name" character varying NOT NULL,
                "names" text NOT NULL,
                "code" character varying NOT NULL,
                "siren" character varying NOT NULL,
                "epci" character varying NOT NULL,
                "zipCodes" text NOT NULL,
                "wkb" text NOT NULL,
                "departmentId" integer,
                CONSTRAINT "PK_4762ffb6e5d198cfec5606bc11e" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "mutations" (
                "id" SERIAL NOT NULL,
                "plotId" integer,
                CONSTRAINT "PK_529c862266138c6e9cf315b53c0" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "dpes" (
                "id" SERIAL NOT NULL,
                "dpe_id" character varying NOT NULL,
                "annee" smallint NOT NULL,
                "classe_energie" character varying NOT NULL,
                "classe_ges" character varying NOT NULL,
                "surface_habitable" numeric(10, 2) NOT NULL,
                "type_batiment" character varying NOT NULL,
                "annee_construction" smallint NOT NULL,
                "code_insee" character varying NOT NULL,
                "longitude" point NOT NULL,
                "latitude" point NOT NULL,
                "plotId" integer,
                CONSTRAINT "PK_f922f5a9a819b9ce6be82c500b6" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "plots" (
                "id" SERIAL NOT NULL,
                "wkb" text NOT NULL,
                "number" character varying NOT NULL,
                "capacity" character varying NOT NULL,
                "sectionId" integer,
                CONSTRAINT "PK_ba7eaba496503e69206deae9363" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "sections" (
                "id" SERIAL NOT NULL,
                "prefixe" character varying NOT NULL,
                "code" character varying NOT NULL,
                "wkb" text NOT NULL,
                "cityId" integer,
                CONSTRAINT "PK_f9749dd3bffd880a497d007e450" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "stats_departments"
            ADD CONSTRAINT "FK_137664db0e9cfe7edb7f8313ad9" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "departments"
            ADD CONSTRAINT "FK_f73011ca48f9ebf33b25b0bfe3a" FOREIGN KEY ("regionId") REFERENCES "regions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "rents"
            ADD CONSTRAINT "FK_73255d373579bae03329cd17c2f" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "stats_cities"
            ADD CONSTRAINT "FK_f8f272a7e9f6b73e1199bf44dc8" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "populate_cities"
            ADD CONSTRAINT "FK_94905ee14fec65542f14c75c447" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "income_cities"
            ADD CONSTRAINT "FK_b38adc0a3546748e89f645e6b67" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "crimes_cities"
            ADD CONSTRAINT "FK_cbcafbef0616778c2e42f6b504d" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "air_quality"
            ADD CONSTRAINT "FK_d833c0624a3ed0621cec38b3616" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "transport_stops"
            ADD CONSTRAINT "FK_516a3077753febe793fb3370529" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "devices"
            ADD CONSTRAINT "FK_750e67f80d4f6809736b710f9a1" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "cities"
            ADD CONSTRAINT "FK_49cb607941062b15a336a18c887" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "mutations"
            ADD CONSTRAINT "FK_3449a621882881898ffeed85a98" FOREIGN KEY ("plotId") REFERENCES "plots"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "dpes"
            ADD CONSTRAINT "FK_1151a9deb9cf63a9ccb66c0c965" FOREIGN KEY ("plotId") REFERENCES "plots"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "plots"
            ADD CONSTRAINT "FK_fc4d7d9302a18c6a1e901b2d71a" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "sections"
            ADD CONSTRAINT "FK_a842ae5320ca056d25aa6d25bb1" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "sections" DROP CONSTRAINT "FK_a842ae5320ca056d25aa6d25bb1"
        `);
        await queryRunner.query(`
            ALTER TABLE "plots" DROP CONSTRAINT "FK_fc4d7d9302a18c6a1e901b2d71a"
        `);
        await queryRunner.query(`
            ALTER TABLE "dpes" DROP CONSTRAINT "FK_1151a9deb9cf63a9ccb66c0c965"
        `);
        await queryRunner.query(`
            ALTER TABLE "mutations" DROP CONSTRAINT "FK_3449a621882881898ffeed85a98"
        `);
        await queryRunner.query(`
            ALTER TABLE "cities" DROP CONSTRAINT "FK_49cb607941062b15a336a18c887"
        `);
        await queryRunner.query(`
            ALTER TABLE "devices" DROP CONSTRAINT "FK_750e67f80d4f6809736b710f9a1"
        `);
        await queryRunner.query(`
            ALTER TABLE "transport_stops" DROP CONSTRAINT "FK_516a3077753febe793fb3370529"
        `);
        await queryRunner.query(`
            ALTER TABLE "air_quality" DROP CONSTRAINT "FK_d833c0624a3ed0621cec38b3616"
        `);
        await queryRunner.query(`
            ALTER TABLE "crimes_cities" DROP CONSTRAINT "FK_cbcafbef0616778c2e42f6b504d"
        `);
        await queryRunner.query(`
            ALTER TABLE "income_cities" DROP CONSTRAINT "FK_b38adc0a3546748e89f645e6b67"
        `);
        await queryRunner.query(`
            ALTER TABLE "populate_cities" DROP CONSTRAINT "FK_94905ee14fec65542f14c75c447"
        `);
        await queryRunner.query(`
            ALTER TABLE "stats_cities" DROP CONSTRAINT "FK_f8f272a7e9f6b73e1199bf44dc8"
        `);
        await queryRunner.query(`
            ALTER TABLE "rents" DROP CONSTRAINT "FK_73255d373579bae03329cd17c2f"
        `);
        await queryRunner.query(`
            ALTER TABLE "departments" DROP CONSTRAINT "FK_f73011ca48f9ebf33b25b0bfe3a"
        `);
        await queryRunner.query(`
            ALTER TABLE "stats_departments" DROP CONSTRAINT "FK_137664db0e9cfe7edb7f8313ad9"
        `);
        await queryRunner.query(`
            DROP TABLE "sections"
        `);
        await queryRunner.query(`
            DROP TABLE "plots"
        `);
        await queryRunner.query(`
            DROP TABLE "dpes"
        `);
        await queryRunner.query(`
            DROP TABLE "mutations"
        `);
        await queryRunner.query(`
            DROP TABLE "cities"
        `);
        await queryRunner.query(`
            DROP TABLE "devices"
        `);
        await queryRunner.query(`
            DROP TABLE "transport_stops"
        `);
        await queryRunner.query(`
            DROP TABLE "air_quality"
        `);
        await queryRunner.query(`
            DROP TABLE "crimes_cities"
        `);
        await queryRunner.query(`
            DROP TABLE "income_cities"
        `);
        await queryRunner.query(`
            DROP TABLE "populate_cities"
        `);
        await queryRunner.query(`
            DROP TABLE "stats_cities"
        `);
        await queryRunner.query(`
            DROP TABLE "rents"
        `);
        await queryRunner.query(`
            DROP TABLE "departments"
        `);
        await queryRunner.query(`
            DROP TABLE "stats_departments"
        `);
        await queryRunner.query(`
            DROP TABLE "regions"
        `);
    }

}
