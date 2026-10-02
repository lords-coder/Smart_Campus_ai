import crypto from "crypto";
import { queryOne, withTransaction } from "../../config/db";
import { ApiError } from "../../utils/ApiError";
import { hashPassword, verifyPassword } from "../../utils/password";
import { signToken } from "../../utils/jwt";
import { Role } from "../../utils/roles";
import { RegisterInput, LoginInput, PasswordHelpInput, ResetPasswordInput } from "./auth.schemas";
import { env } from "../../config/env";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt?: string;
}

export interface AuthResult {
  token: string;
  user: PublicUser;
}

export interface StudentProfile {
  studentNo: string;
  department: string;
  semester: number;
  section: string;
  batchYear: number;
}

export interface FacultyProfile {
  employeeNo: string;
  department: string;
  designation: string;
}

export interface ParentLinkedStudent {
  studentId: string;
  studentNo: string;
  name: string;
  department: string;
  semester: number;
  section: string;
  relationshipType: string;
}

export interface ParentProfile {
  linkedStudents: ParentLinkedStudent[];
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  password_hash: string;
  created_at: Date;
  status?: string;
}

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: row.created_at.toISOString(),
  };
}

function validateUniversityEmail(email: string): void {
  const domain = env.universityEmailDomain.toLowerCase();
  if (!email.toLowerCase().endsWith(`@${domain}`)) {
    throw ApiError.badRequest(`Email must be a university address (@${domain})`, "INVALID_EMAIL_DOMAIN");
  }
}

function validateAdminCode(code: string): void {
  if (code !== env.adminRegistrationCode) {
    throw ApiError.badRequest("Invalid admin verification code", "INVALID_REGISTRATION_CODE");
  }
}

function validateFacultyCode(code: string): void {
  if (code !== env.facultyRegistrationCode) {
    throw ApiError.badRequest("Invalid faculty verification code", "INVALID_REGISTRATION_CODE");
  }
}

export async function register(input: RegisterInput): Promise<{ status: string; message: string }> {
  validateUniversityEmail(input.email);

  // The verification code is checked on the server, before any row is written.
  if (input.role === "ADMIN") validateAdminCode(input.code);
  if (input.role === "FACULTY") validateFacultyCode(input.code);

  const existing = await queryOne("SELECT id FROM users WHERE lower(email) = lower($1)", [input.email]);
  if (existing) {
    throw ApiError.conflict("An account with this email already exists", "EMAIL_TAKEN");
  }

  const passwordHash = await hashPassword(input.password);
  const fullName = `${input.firstName.trim()} ${input.lastName.trim()}`;

  // Never persist the password, its confirmation or the verification code.
  const submission: Record<string, unknown> = {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    phone: input.phone.trim(),
  };

  if (input.role === "STUDENT") {
    submission.studentNo = input.studentNo.trim();
    submission.department = input.department.trim();
    submission.semester = input.semester;
    submission.section = input.section.trim();
    submission.batchYear = input.batchYear;
  } else if (input.role === "FACULTY") {
    submission.employeeNo = input.employeeNo.trim();
    submission.department = input.department.trim();
    submission.designation = input.designation.trim();
  } else {
    submission.department = input.department.trim();
    submission.jobTitle = input.jobTitle.trim();
  }

  await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, role, status, phone)
       VALUES ($1, $2, $3, $4, 'PENDING', $5)
       RETURNING id`,
      [fullName, input.email, passwordHash, input.role, input.phone],
    );
    const userId = rows[0].id;

    if (input.role === "STUDENT") {
      await client.query(
        `INSERT INTO students (user_id, student_no, department, semester, section, batch_year)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, submission.studentNo, submission.department, input.semester, submission.section, input.batchYear],
      );
    } else if (input.role === "FACULTY") {
      await client.query(
        `INSERT INTO faculties (user_id, employee_no, department, designation)
         VALUES ($1, $2, $3, $4)`,
        [userId, submission.employeeNo, submission.department, submission.designation],
      );
    }

    await client.query(
      `INSERT INTO registrations (user_id, requested_role, status, submission)
       VALUES ($1, $2, 'PENDING_APPROVAL', $3)`,
      [userId, input.role, JSON.stringify(submission)],
    );
  });

  return {
    status: "PENDING_APPROVAL",
    message: "Registration submitted. Your account is waiting for Super Admin approval.",
  };
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const row = await queryOne<UserRow>(
    `SELECT id, name, email, role, password_hash, created_at, status
     FROM users WHERE lower(email) = lower($1)`,
    [input.email],
  );

  const valid = row ? await verifyPassword(input.password, row.password_hash) : false;
  if (!row || !valid) {
    throw ApiError.unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
  }

  if (row.status === "PENDING") {
    throw ApiError.forbidden("Your registration is still pending approval.", "REGISTRATION_PENDING");
  }
  if (row.status === "REJECTED") {
    throw ApiError.forbidden("Your registration was not approved. Please contact the administration.", "REGISTRATION_REJECTED");
  }
  if (row.status === "SUSPENDED") {
    throw ApiError.forbidden("Your account has been disabled. Please contact the administration.", "ACCOUNT_SUSPENDED");
  }
  if (row.status !== "ACTIVE") {
    throw ApiError.forbidden("Your account is not active.", "ACCOUNT_DISABLED");
  }

  const token = signToken({ sub: row.id, role: row.role, email: row.email });
  return { token, user: toPublicUser(row) };
}

export async function getCurrentUser(userId: string) {
  const user = await queryOne<UserRow>(
    `SELECT id, name, email, role, password_hash, created_at FROM users WHERE id = $1`,
    [userId],
  );
  if (!user) {
    throw ApiError.unauthorized("Account no longer exists", "INVALID_TOKEN");
  }

  let profile: StudentProfile | FacultyProfile | ParentProfile | null = null;
  if (user.role === "STUDENT") {
    const student = await queryOne<{
      student_no: string;
      department: string;
      semester: number;
      section: string;
      batch_year: number;
    }>(
      `SELECT student_no, department, semester, section, batch_year
       FROM students WHERE user_id = $1`,
      [userId],
    );
    if (student) {
      profile = {
        studentNo: student.student_no,
        department: student.department,
        semester: student.semester,
        section: student.section,
        batchYear: student.batch_year,
      };
    }
  } else if (user.role === "PARENT") {
    const { getLinkedStudents } = await import("../parent/parent.service");
    const linked = await getLinkedStudents(userId);
    profile = {
      linkedStudents: linked.map((s) => ({
        studentId: s.studentId,
        studentNo: s.studentNo,
        name: s.name,
        department: s.department,
        semester: s.semester,
        section: s.section,
        relationshipType: s.relationshipType,
      })),
    };
  } else if (user.role === "FACULTY") {
    const faculty = await queryOne<{ employee_no: string; department: string; designation: string }>(
      `SELECT employee_no, department, designation FROM faculties WHERE user_id = $1`,
      [userId],
    );
    if (faculty) {
      profile = {
        employeeNo: faculty.employee_no,
        department: faculty.department,
        designation: faculty.designation,
      };
    }
  }

  return { user: toPublicUser(user), profile };
}

export async function requestPasswordHelp(input: PasswordHelpInput): Promise<{ message: string }> {
  let userId: string | null = null;
  let requesterRole: string | null = null;

  const user = await queryOne<{ id: string; role: Role }>(
    `SELECT id, role FROM users WHERE lower(email) = lower($1)`,
    [input.email],
  );

  if (user) {
    userId = user.id;
    requesterRole = user.role;
  }

  const roleToStore = input.role ?? requesterRole;

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO password_help_requests (user_id, email, requester_role, contact, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, input.email, roleToStore, input.contact, input.message],
    );
  });

  return { message: "Your request has been submitted. An administrator will contact you shortly." };
}

export async function resetPassword(input: ResetPasswordInput): Promise<{ message: string }> {
  const tokenHash = crypto.createHash("sha256").update(input.token).digest("hex");

  const tokenRow = await queryOne<{
    id: string;
    user_id: string;
    expires_at: Date;
    used_at: Date | null;
  }>(
    `SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1`,
    [tokenHash],
  );

  if (!tokenRow) {
    throw ApiError.badRequest("Invalid or expired reset token", "INVALID_RESET_TOKEN");
  }
  if (tokenRow.used_at) {
    throw ApiError.badRequest("This reset link has already been used", "TOKEN_ALREADY_USED");
  }
  if (new Date(tokenRow.expires_at).getTime() < Date.now()) {
    throw ApiError.badRequest("This reset link has expired", "TOKEN_EXPIRED");
  }

  const newHash = await hashPassword(input.password);

  await withTransaction(async (client) => {
    // Claim the token first: a concurrent second use updates zero rows and is rejected.
    const { rowCount } = await client.query(
      `UPDATE password_reset_tokens SET used_at = now()
        WHERE id = $1 AND used_at IS NULL`,
      [tokenRow.id],
    );
    if (!rowCount) {
      throw ApiError.badRequest("This reset link has already been used", "TOKEN_ALREADY_USED");
    }
    // Replacing the hash invalidates the old password immediately.
    await client.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newHash, tokenRow.user_id]);
  });

  return { message: "Your password has been reset successfully. You can now sign in." };
}