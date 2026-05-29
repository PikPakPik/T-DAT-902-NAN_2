import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigPerformanceIndexes1777100000000 implements MigrationInterface {
  name = 'MigPerformanceIndexes1777100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_regions_geom"
      ON "regions" USING GIST ("geom")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_departments_geom"
      ON "departments" USING GIST ("geom")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cities_geom"
      ON "cities" USING GIST ("geom")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sections_geom"
      ON "sections" USING GIST ("geom")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_plots_geom"
      ON "plots" USING GIST ("geom")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_departments_region_id"
      ON "departments" ("regionId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_cities_department_id"
      ON "cities" ("departmentId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_sections_city_id"
      ON "sections" ("cityId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_plots_section_id"
      ON "plots" ("sectionId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_stats_departments_department_id"
      ON "stats_departments" ("departmentId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_stats_cities_city_id"
      ON "stats_cities" ("cityId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_rents_city_id"
      ON "rents" ("cityId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_populate_cities_city_id"
      ON "populate_cities" ("cityId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_income_cities_city_id"
      ON "income_cities" ("cityId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_crimes_cities_city_id"
      ON "crimes_cities" ("cityId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_air_quality_city_id"
      ON "air_quality" ("cityId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_transport_stops_city_id"
      ON "transport_stops" ("cityId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_devices_city_id"
      ON "devices" ("cityId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_mutations_plot_id"
      ON "mutations" ("plotId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_dpes_plot_id"
      ON "dpes" ("plotId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_dpes_plot_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_mutations_plot_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_devices_city_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_transport_stops_city_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_air_quality_city_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_crimes_cities_city_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_income_cities_city_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_populate_cities_city_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_rents_city_id"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_stats_cities_city_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_stats_departments_department_id"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_plots_section_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sections_city_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_cities_department_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_departments_region_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_plots_geom"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_sections_geom"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_cities_geom"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_departments_geom"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_regions_geom"`);
  }
}
