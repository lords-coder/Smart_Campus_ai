import { queryOne, withTransaction, query } from "../../config/db";
import { ApiError } from "../../utils/ApiError";
import { hashPassword } from "../../utils/password";
import crypto from "crypto";
import {
  RejectRegistrationInput,
  UpdateUserStatusInput,
  UpdatePasswordHelpInput,
} from "./super-admin.schemas";
import type { RegistrationRecord, UserRecord, PasswordHelpRecord, ResetTokenResult } from "./super-admin.types";

function toRegistrationRecord(row: any): RegistrationRecord {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    requestedRole: row.requested_role,
    status: row.status,
    submission: row.submission,
    rejectionReason: row.rejection_reason,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toUserRecord(row: any): UserRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    phone: row.phone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPasswordHelpRecord(row: any): PasswordHelpRecord {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.email,
    requesterRole: row.requester_role,
    contact: row.contact,
    message: row.message,
    status: row.status,
    adminNotes: row.admin_notes,
    handledBy: row.handled_by,
    handledAt: row.handled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listRegistrations(
  status: string,
  role: string,
  q: string,
  limit: number,
  offset: number
): Promise<{ items: RegistrationRecord[]; total: number }> {
  let where = "1=1";
  const params: unknown[] = [];
  let paramIndex = 1;

  if (status && status !== "ALL") {
    where += ` AND r.status = $${paramIndex++}`;
    params.push(status);
  }
  if (role) {
    where += ` AND r.requested_role = $${paramIndex++}`;
    params.push(role);
  }
  if (q) {
    where += ` AND (u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`;
    params.push(`%${q}%`);
    paramIndex++;
  }

  const totalResult = await queryOne<{ total: string }>(
    `SELECT count(*)::int AS total FROM registrations r JOIN users u ON u.id = r.user_id WHERE ${where}`,
    params,
  );
  const total = Number(totalResult?.total ?? 0);

  const rows = await query(
    `SELECT r.id, r.user_id, r.requested_role, r.status, r.submission, r.rejection_reason,
            r.reviewed_by, r.reviewed_at, r.created_at, r.updated_at,
            u.name AS user_name, u.email AS user_email
       FROM registrations r
       JOIN users u ON u.id = r.user_id
       WHERE ${where}
       ORDER BY r.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset],
  );

  return { items: rows.map(toRegistrationRecord), total };
}

export async function getRegistrationById(id: string): Promise<RegistrationRecord | null> {
  const row = await queryOne(
    `SELECT r.id, r.user_id, r.requested_role, r.status, r.submission, r.rejection_reason,
            r.reviewed_by, r.reviewed_at, r.created_at, r.updated_at,
            u.name AS user_name, u.email AS user_email
       FROM registrations r
       JOIN users u ON u.id = r.user_id
       WHERE r.id = $1`,
    [id],
  );
  return row ? toRegistrationRecord(row) : null;
}

export async function approveRegistration(id: string, reviewerId: string): Promise<RegistrationRecord> {
  const result = await withTransaction(async (client) => {
    const reg = await client.query(
      `SELECT r.*, u.status AS user_status FROM registrations r JOIN users u ON u.id = r.user_id WHERE r.id = $1 FOR UPDATE`,
      [id],
    );
    if (reg.rows.length === 0) {
      throw ApiError.notFound("Registration not found");
    }
    const regRow = reg.rows[0];
    if (regRow.status !== "PENDING_APPROVAL") {
      throw ApiError.conflict("Only pending registrations can be approved", "INVALID_TRANSITION");
    }
    if (regRow.user_status !== "PENDING") {
      throw ApiError.conflict("User is not in pending status", "INVALID_TRANSITION");
    }

    await client.query(
      `UPDATE users SET status = 'ACTIVE' WHERE id = $1`,
      [regRow.user_id],
    );

    const updated = await client.query(
      `UPDATE registrations SET status = 'APPROVED', reviewed_by = $1, reviewed_at = now()
       WHERE id = $2
       RETURNING *`,
      [reviewerId, id],
    );
    return updated.rows[0];
  });
  return toRegistrationRecord(result);
}

export async function rejectRegistration(id: string, reviewerId: string, input: RejectRegistrationInput): Promise<RegistrationRecord> {
  const result = await withTransaction(async (client) => {
    const reg = await client.query(
      `SELECT r.*, u.status AS user_status FROM registrations r JOIN users u ON u.id = r.user_id WHERE r.id = $1 FOR UPDATE`,
      [id],
    );
    if (reg.rows.length === 0) {
      throw ApiError.notFound("Registration not found");
    }
    const regRow = reg.rows[0];
    if (regRow.status !== "PENDING_APPROVAL") {
      throw ApiError.conflict("Only pending registrations can be rejected", "INVALID_TRANSITION");
    }

    await client.query(
      `UPDATE users SET status = 'REJECTED' WHERE id = $1`,
      [regRow.user_id],
    );

    const updated = await client.query(
      `UPDATE registrations SET status = 'REJECTED', reviewed_by = $1, reviewed_at = now(), rejection_reason = $2
       WHERE id = $3
       RETURNING *`,
      [reviewerId, input.reason ?? null, id],
    );
    return updated.rows[0];
  });
  return toRegistrationRecord(result);
}

export async function listUsers(
  status: string,
  role: string,
  q: string,
  limit: number,
  offset: number
): Promise<{ items: UserRecord[]; total: number }> {
  let where = "1=1";
  const params: unknown[] = [];
  let paramIndex = 1;

  if (status && status !== "ALL") {
    where += ` AND status = $${paramIndex++}`;
    params.push(status);
  }
  if (role) {
    where += ` AND role = $${paramIndex++}`;
    params.push(role);
  }
  if (q) {
    where += ` AND (name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
    params.push(`%${q}%`);
    paramIndex++;
  }

  const totalResult = await queryOne<{ total: string }>(
    `SELECT count(*)::int AS total FROM users WHERE ${where}`,
    params,
  );
  const total = Number(totalResult?.total ?? 0);

  const rows = await query(
    `SELECT id, name, email, role, status, phone, created_at, updated_at
       FROM users
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset],
  );

  return { items: rows.map(toUserRecord), total };
}

export async function updateUserStatus(id: string, input: UpdateUserStatusInput): Promise<UserRecord> {
  if (input.status === "REJECTED") {
    throw ApiError.badRequest("Cannot reject via user management; use registration rejection", "INVALID_TRANSITION");
  }

  const existing = await queryOne("SELECT id FROM users WHERE id = $1", [id]);
  if (!existing) {
    throw ApiError.notFound("User not found");
  }

  await queryOne(
    `UPDATE users SET status = $1 WHERE id = $2`,
    [input.status, id],
  );

  const row = await queryOne(
    `SELECT id, name, email, role, status, phone, created_at, updated_at FROM users WHERE id = $1`,
    [id],
  );
  return toUserRecord(row!);
}

export async function listPasswordHelp(
  status: string,
  limit: number,
  offset: number
): Promise<{ items: PasswordHelpRecord[]; total: number }> {
  let where = "1=1";
  const params: unknown[] = [];
  let paramIndex = 1;

  if (status && status !== "ALL") {
    where += ` AND phr.status = $${paramIndex++}`;
    params.push(status);
  }

  const totalResult = await queryOne<{ total: string }>(
    `SELECT count(*)::int AS total FROM password_help_requests phr WHERE ${where}`,
    params,
  );
  const total = Number(totalResult?.total ?? 0);

  const rows = await query(
    `SELECT phr.id, phr.user_id, phr.email, phr.requester_role, phr.contact, phr.message,
            phr.status, phr.admin_notes, phr.handled_by, phr.handled_at, phr.created_at, phr.updated_at,
            u.name AS user_name
       FROM password_help_requests phr
       LEFT JOIN users u ON u.id = phr.user_id
       WHERE ${where}
       ORDER BY phr.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset],
  );

  return { items: rows.map(toPasswordHelpRecord), total };
}

export async function updatePasswordHelp(id: string, handlerId: string, input: UpdatePasswordHelpInput): Promise<PasswordHelpRecord> {
  const existing = await queryOne("SELECT id FROM password_help_requests WHERE id = $1", [id]);
  if (!existing) {
    throw ApiError.notFound("Password help request not found");
  }

  await query(
    `UPDATE password_help_requests
       SET status = $1, admin_notes = $2, handled_by = $3, handled_at = now()
     WHERE id = $4`,
    [input.status, input.adminNotes ?? null, handlerId, id],
  );

  const row = await queryOne(
    `SELECT phr.id, phr.user_id, phr.email, phr.requester_role, phr.contact, phr.message,
            phr.status, phr.admin_notes, phr.handled_by, phr.handled_at, phr.created_at, phr.updated_at,
            u.name AS user_name
       FROM password_help_requests phr
       LEFT JOIN users u ON u.id = phr.user_id
       WHERE phr.id = $1`,
    [id],
  );
  return toPasswordHelpRecord(row!);
}

export async function issueResetToken(requestId: string, issuerId: string, frontendUrl: string): Promise<ResetTokenResult> {
  const request = await queryOne(
    `SELECT phr.id, phr.user_id, phr.email, u.name AS user_name
       FROM password_help_requests phr
       LEFT JOIN users u ON u.id = phr.user_id
       WHERE phr.id = $1`,
    [requestId],
  );
  if (!request) {
    throw ApiError.notFound("Password help request not found");
  }
  if (!request.user_id) {
    throw ApiError.conflict("Cannot issue reset token: no linked user account", "NO_USER_LINKED");
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO password_reset_tokens (user_id, request_id, token_hash, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [request.user_id, request.id, tokenHash, expiresAt, issuerId],
    );
    await client.query(
      `UPDATE password_help_requests SET status = 'IN_PROGRESS', handled_by = $1, handled_at = now() WHERE id = $2`,
      [issuerId, requestId],
    );
  });

  const baseUrl = frontendUrl;
  return {
    token: rawToken,
    resetUrl: `${baseUrl}/reset-password?token=${rawToken}`,
    expiresAt: expiresAt.toISOString(),
  };
}