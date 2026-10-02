import { migrate } from "./migrate";
import { bootstrapSuperAdmin } from "./bootstrap-super-admin";

/**
 * Bootstrap the database for production / clean deployments.
 * Creates schema and the initial SUPER_ADMIN account only.
 * NO demo users, NO demo data.
 * Run: npm run seed   (or npm run bootstrap)
 */

async function main() {
  await migrate();
  await bootstrapSuperAdmin();
  console.log("[seed] Bootstrap complete. Database ready for registrations.");
}

main().catch((err) => {
  console.error("[seed] Failed:", err);
  process.exit(1);
});