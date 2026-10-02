import { pool } from "../config/db";
import { migrate } from "./migrate";

/**
 * Drops and recreates the public schema, then re-applies all migrations.
 * Requires the --yes flag to avoid accidental data loss.
 */
async function main() {
  if (!process.argv.includes("--yes")) {
    console.error("[db:reset] Refusing to run without --yes flag. Usage: npm run db:reset -- --yes");
    process.exit(1);
  }

  await pool.query("DROP SCHEMA public CASCADE");
  await pool.query("CREATE SCHEMA public");
  console.log("[db:reset] schema recreated");

  await migrate();
  await pool.end();
}

main().catch(async (error) => {
  console.error("[db:reset]", error instanceof Error ? error.message : error);
  await pool.end();
  process.exit(1);
});
