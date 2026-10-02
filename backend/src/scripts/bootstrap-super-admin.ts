import crypto from "crypto";
import bcrypt from "bcryptjs";
import { pool } from "../config/db";
import { env } from "../config/env";

/**
 * Creates the initial SUPER_ADMIN account. Idempotent: a second run is a no-op.
 *
 * The credentials come from configuration (SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD),
 * never from source or from a SQL migration, and only the bcrypt hash is stored.
 */
export async function bootstrapSuperAdmin(): Promise<void> {
  const email = env.superAdminEmail;
  const password = env.superAdminPassword;

  const existing = await pool.query("SELECT id FROM users WHERE lower(email) = lower($1)", [email]);
  if (existing.rows.length > 0) {
    console.log(`[bootstrap] SUPER_ADMIN already exists: ${email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptRounds);
  await pool.query(
    `INSERT INTO users (id, name, email, password_hash, role, status, phone)
     VALUES ($1, $2, $3, $4, 'SUPER_ADMIN', 'ACTIVE', NULL)`,
    [crypto.randomUUID(), "Super Administrator", email, passwordHash],
  );

  console.log(`[bootstrap] Created SUPER_ADMIN: ${email}`);
}