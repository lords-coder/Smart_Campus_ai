import { migrate } from "./migrate";
import { bootstrapSuperAdmin } from "./bootstrap-super-admin";

/**
 * Prepare a clean database for real use:
 *   1. apply every pending migration
 *   2. create the single SUPER_ADMIN account from configuration
 *
 * No demo users and no demo campus data are created. Everyone else arrives
 * through the registration + Super Admin approval flow.
 */
async function main() {
  await migrate();
  await bootstrapSuperAdmin();
  console.log("[bootstrap] Ready. Only the SUPER_ADMIN account exists; all other users must register.");
}

main().catch((error) => {
  console.error("[bootstrap] Failed:", error);
  process.exit(1);
});