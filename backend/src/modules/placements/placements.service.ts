import type { PoolClient } from "pg";
import { query, queryOne, withTransaction } from "../../config/db";
import { ApiError } from "../../utils/ApiError";
import { toLocalDateString } from "../../utils/date";
import {
  APPLICATION_TRANSITIONS,
  type AcademicStanding,
  type ApplicationStatus,
  type DriveListItem,
  type EligibilityResult,
  type EligibilityRule,
} from "./placements.types";
import type { CreateDriveInput } from "./placements.schemas";

type TxClient = PoolClient;

async function requireStudentProfile(userId: string): Promise<string> {
  const row = await queryOne<{ id: string }>("SELECT id FROM students WHERE user_id = $1", [userId]);
  if (!row) throw ApiError.notFound("No student profile is linked to this account");
  return row.id;
}

/**
 * Academic standing derived from live ERP data (no separate academic store):
 * - CGPA ≈ mean assessment percentage / 9.5 on a 10 scale (0 when no data).
 * - Backlogs = enrolled courses whose assessment average is below 40%.
 * - Attendance = present+late share across all recorded classes.
 * - Graduation year = batch year + 4 (four-year programmes).
 */
export async function getAcademicStanding(profileId: string): Promise<AcademicStanding> {
  const student = await queryOne<{
    department: string;
    semester: number;
    batch_year: number;
  }>(`SELECT department, semester, batch_year FROM students WHERE id = $1`, [profileId]);
  if (!student) throw ApiError.notFound("Student not found");

  const [assess, attend] = await Promise.all([
    query(
      `SELECT AVG((a.marks_obtained / NULLIF(a.max_marks, 0)) * 100) AS overall,
              COUNT(DISTINCT CASE WHEN per_course.avg_pct < 40 THEN per_course.course_id END)::int AS backlogs
       FROM assessments a
       JOIN (SELECT course_id, AVG((marks_obtained / NULLIF(max_marks, 0)) * 100) AS avg_pct
             FROM assessments WHERE student_id = $1 GROUP BY course_id) per_course
         ON per_course.course_id = a.course_id
       WHERE a.student_id = $1`,
      [profileId],
    ),
    query(
      `SELECT CASE WHEN COUNT(*) = 0 THEN 0
              ELSE AVG(CASE WHEN status IN ('PRESENT', 'LATE') THEN 100.0 ELSE 0 END) END AS pct
       FROM attendance WHERE student_id = $1`,
      [profileId],
    ),
  ]);

  const overall = Number(assess[0]?.overall ?? 0);
  return {
    cgpa: Math.min(10, Math.round((overall / 9.5) * 100) / 100),
    backlogs: Number(assess[0]?.backlogs ?? 0),
    attendancePercentage: Math.round(Number(attend[0]?.pct ?? 0) * 10) / 10,
    department: student.department,
    semester: Number(student.semester),
    graduationYear: Number(student.batch_year) + 4,
  };
}

/**
 * Deterministic eligibility evaluation. Never AI — every reason cites a
 * real number from the student's standing next to the drive's rule.
 */
export function evaluateEligibility(standing: AcademicStanding, rules: EligibilityRule): EligibilityResult {
  const reasons: string[] = [];
  if (rules.minCgpa !== null && standing.cgpa < rules.minCgpa) {
    reasons.push(`CGPA below required minimum (yours: ${standing.cgpa}, required: ${rules.minCgpa})`);
  }
  if (rules.maxBacklogs !== null && standing.backlogs > rules.maxBacklogs) {
    reasons.push(`Backlog limit exceeded (yours: ${standing.backlogs}, allowed: ${rules.maxBacklogs})`);
  }
  if (rules.minAttendance !== null && standing.attendancePercentage < rules.minAttendance) {
    reasons.push(
      `Attendance below requirement (yours: ${standing.attendancePercentage}%, required: ${rules.minAttendance}%)`,
    );
  }
  if (rules.departments.length > 0 && !rules.departments.includes(standing.department)) {
    reasons.push(`Drive restricted to ${rules.departments.join(", ")} (yours: ${standing.department})`);
  }
  if (rules.semesters.length > 0 && !rules.semesters.includes(standing.semester)) {
    reasons.push(`Drive restricted to semesters ${rules.semesters.join(", ")} (yours: ${standing.semester})`);
  }
  if (rules.graduationYear !== null && standing.graduationYear !== rules.graduationYear) {
    reasons.push(`Drive targets the ${rules.graduationYear} graduating batch (yours: ${standing.graduationYear})`);
  }
  return { eligible: reasons.length === 0, reasons, standing };
}

function toRules(row: Record<string, unknown>): EligibilityRule {
  return {
    minCgpa: row.min_cgpa === null ? null : Number(row.min_cgpa),
    maxBacklogs: row.max_backlogs === null ? null : Number(row.max_backlogs),
    minAttendance: row.min_attendance === null ? null : Number(row.min_attendance),
    departments: (row.eligible_departments as string[]) ?? [],
    semesters: ((row.eligible_semesters as number[]) ?? []).map(Number),
    graduationYear: row.graduation_year === null ? null : Number(row.graduation_year),
  };
}

// ----------------------------------------------------------------- companies

export async function listCompanies(activeOnly = false) {
  const rows = await query(
    `SELECT c.*, (SELECT count(*)::int FROM placement_drives d WHERE d.company_id = c.id) AS drive_count
     FROM companies c ${activeOnly ? `WHERE c.active = true` : ""} ORDER BY c.name ASC LIMIT 200`,
  );
  return rows;
}

export async function createCompany(input: {
  name: string;
  industry?: string;
  companyType?: string;
  website?: string;
  location?: string;
  description?: string;
  contactName?: string;
  contactEmail?: string;
}) {
  const existing = await queryOne<{ id: string }>(`SELECT id FROM companies WHERE lower(name) = lower($1)`, [
    input.name.trim(),
  ]);
  if (existing) throw ApiError.conflict("A company with this name already exists", "DUPLICATE_RESOURCE");
  const rows = await query(
    `INSERT INTO companies (name, industry, company_type, website, location, description, contact_name, contact_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      input.name.trim(),
      input.industry?.trim() ?? "",
      input.companyType ?? "OTHER",
      input.website?.trim() ?? "",
      input.location?.trim() ?? "",
      input.description?.trim() ?? "",
      input.contactName?.trim() ?? "",
      (input.contactEmail?.trim() ?? "").toLowerCase(),
    ],
  );
  return rows[0];
}

export async function updateCompany(id: string, updates: Record<string, unknown>) {
  const allowed = ["name", "industry", "company_type", "website", "location", "description", "contact_name", "contact_email", "active"] as const;
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      sets.push(`${key} = $${params.length + 1}`);
      params.push(typeof updates[key] === "string" ? (updates[key] as string).trim() : updates[key]);
    }
  }
  if (sets.length === 0) throw ApiError.badRequest("No fields to update", "VALIDATION_ERROR");
  params.push(id);
  try {
    const rows = await query(`UPDATE companies SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`, params);
    if (rows.length === 0) throw ApiError.notFound("Company not found");
    return rows[0];
  } catch (error) {
    if ((error as { code?: string })?.code === "23505" || (error instanceof Error && /already exists/i.test(error.message))) {
      throw ApiError.conflict("A company with this name already exists", "DUPLICATE_RESOURCE");
    }
    throw error;
  }
}

// ------------------------------------------------------------------- drives

const DRIVE_SELECT = `
  SELECT d.*, c.name AS company_name, c.industry,
         (SELECT count(*)::int FROM placement_applications a WHERE a.drive_id = d.id) AS application_count
  FROM placement_drives d JOIN companies c ON c.id = d.company_id
`;

export async function listDrives(filter: { status?: string; companyId?: string; q?: string; page?: number; limit?: number } = {}) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    conditions.push(`d.status = $${params.length + 1}`);
    params.push(filter.status);
  }
  if (filter.companyId) {
    conditions.push(`d.company_id = $${params.length + 1}`);
    params.push(filter.companyId);
  }
  if (filter.q) {
    conditions.push(`(d.title ILIKE $${params.length + 1} OR d.job_role ILIKE $${params.length + 1} OR c.name ILIKE $${params.length + 1})`);
    params.push(`%${filter.q}%`);
  }
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const rows = await query(
    `${DRIVE_SELECT} ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY d.application_deadline ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit],
  );
  const countRows = await query(
    `SELECT count(*)::int AS n FROM placement_drives d JOIN companies c ON c.id = d.company_id
     ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}`,
    params,
  );
  return { items: rows.map(mapDrive), total: Number(countRows[0]?.n ?? 0), page, limit };
}

function mapDrive(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    companyId: row.company_id as string,
    companyName: row.company_name as string,
    industry: (row.industry as string) ?? "",
    title: row.title as string,
    jobRole: row.job_role as string,
    description: (row.description as string) ?? "",
    packageMin: Number(row.package_min),
    packageMax: Number(row.package_max),
    currency: (row.currency as string) ?? "INR",
    employmentType: row.employment_type as string,
    workMode: row.work_mode as string,
    location: (row.location as string) ?? "",
    openings: Number(row.openings),
    applicationDeadline: toLocalDateString(row.application_deadline as string),
    driveDate: row.drive_date ? toLocalDateString(row.drive_date as string) : null,
    status: row.status as DriveListItem["status"],
    minCgpa: row.min_cgpa === null ? null : Number(row.min_cgpa),
    maxBacklogs: row.max_backlogs === null ? null : Number(row.max_backlogs),
    minAttendance: row.min_attendance === null ? null : Number(row.min_attendance),
    eligibleDepartments: (row.eligible_departments as string[]) ?? [],
    eligibleSemesters: ((row.eligible_semesters as number[]) ?? []).map(Number),
    graduationYear: row.graduation_year === null ? null : Number(row.graduation_year),
    applicationCount: Number(row.application_count ?? 0),
  };
}

export async function getDrive(id: string) {
  const rows = await query(`${DRIVE_SELECT} WHERE d.id = $1`, [id]);
  if (rows.length === 0) throw ApiError.notFound("Drive not found");
  return mapDrive(rows[0]);
}

export async function createDrive(creatorId: string, input: CreateDriveInput) {
  const company = await queryOne<{ id: string }>(`SELECT id FROM companies WHERE id = $1`, [input.companyId]);
  if (!company) throw ApiError.notFound("Company not found");
  if (input.packageMax < input.packageMin) throw ApiError.badRequest("packageMax must be >= packageMin", "VALIDATION_ERROR");
  const rows = await query(
    `INSERT INTO placement_drives
     (company_id, title, job_role, description, package_min, package_max, currency,
      employment_type, work_mode, location, openings, application_deadline, drive_date,
      min_cgpa, max_backlogs, min_attendance, eligible_departments, eligible_semesters,
      graduation_year, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'DRAFT',$20)
     RETURNING id`,
    [
      input.companyId, input.title.trim(), input.jobRole.trim(), input.description?.trim() ?? "",
      input.packageMin, input.packageMax, input.currency, input.employmentType, input.workMode,
      input.location?.trim() ?? "", input.openings, input.applicationDeadline, input.driveDate ?? null,
      input.minCgpa ?? null, input.maxBacklogs ?? null, input.minAttendance ?? null,
      input.eligibleDepartments ?? [], input.eligibleSemesters ?? [], input.graduationYear ?? null,
      creatorId,
    ],
  );
  return getDrive(rows[0].id as string);
}

export async function updateDrive(id: string, updates: Record<string, unknown>) {
  const allowed = [
    "title", "job_role", "description", "package_min", "package_max", "location", "openings",
    "application_deadline", "drive_date", "min_cgpa", "max_backlogs", "min_attendance",
    "eligible_departments", "eligible_semesters", "graduation_year", "status",
  ] as const;
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      sets.push(`${key} = $${params.length + 1}`);
      params.push(typeof updates[key] === "string" ? (updates[key] as string).trim() : updates[key]);
    }
  }
  if (sets.length === 0) throw ApiError.badRequest("No fields to update", "VALIDATION_ERROR");
  params.push(id);
  const rows = await query(`UPDATE placement_drives SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING id`, params);
  if (rows.length === 0) throw ApiError.notFound("Drive not found");
  return getDrive(id);
}

/** Student-facing drive list: OPEN drives annotated with live eligibility + own application state. */
export async function listDrivesForStudent(userId: string): Promise<{ drives: DriveListItem[] }> {
  const profileId = await requireStudentProfile(userId);
  const standing = await getAcademicStanding(profileId);
  const rows = await query(
    `${DRIVE_SELECT} WHERE d.status = 'OPEN' ORDER BY d.application_deadline ASC LIMIT 100`,
  );
  const myApps = await query(
    `SELECT drive_id, status FROM placement_applications WHERE student_id = $1 AND status <> 'WITHDRAWN'`,
    [profileId],
  );
  const appByDrive = new Map<string, string>(myApps.map((r) => [r.drive_id as string, r.status as string]));
  return {
    drives: rows.map((row) => {
      const drive = mapDrive(row);
      const myStatus = (appByDrive.get(drive.id) as ApplicationStatus | undefined) ?? null;
      return {
        ...drive,
        myApplicationStatus: myStatus,
        eligibility: evaluateEligibility(standing, toRules(row)),
      };
    }),
  };
}

export async function driveEligibilityForStudent(userId: string, driveId: string) {
  const profileId = await requireStudentProfile(userId);
  const rows = await query(`${DRIVE_SELECT} WHERE d.id = $1`, [driveId]);
  if (rows.length === 0) throw ApiError.notFound("Drive not found");
  const standing = await getAcademicStanding(profileId);
  return { drive: mapDrive(rows[0]), eligibility: evaluateEligibility(standing, toRules(rows[0])) };
}

// --------------------------------------------------------------- applications

function mapApplication(row: Record<string, unknown>, interviews: unknown[] = [], offers: unknown[] = []) {
  return {
    id: row.id as string,
    driveId: row.drive_id as string,
    driveTitle: (row.drive_title as string) ?? "",
    companyName: (row.company_name as string) ?? "",
    jobRole: (row.job_role as string) ?? "",
    packageMin: row.package_min === undefined ? undefined : Number(row.package_min),
    packageMax: row.package_max === undefined ? undefined : Number(row.package_max),
    studentId: row.student_id as string,
    studentNo: row.student_no as string | undefined,
    studentName: row.student_name as string | undefined,
    status: row.status as ApplicationStatus,
    appliedAt: new Date(row.applied_at as string).toISOString(),
    interviews: interviews as Array<Record<string, unknown>>,
    offers: offers as Array<Record<string, unknown>>,
  };
}

async function interviewsFor(appIds: string[], includeFeedback: boolean) {
  if (appIds.length === 0) return new Map<string, unknown[]>();
  const rows = await query(
    `SELECT * FROM placement_interviews WHERE application_id = ANY($1::uuid[]) ORDER BY round_number ASC`,
    [appIds],
  );
  const byApp = new Map<string, unknown[]>();
  for (const row of rows) {
    const list = byApp.get(row.application_id as string) ?? [];
    list.push({
      id: row.id,
      roundName: row.round_name,
      roundNumber: Number(row.round_number),
      scheduledAt: new Date(row.scheduled_at as string).toISOString(),
      location: row.location,
      status: row.status,
      ...(includeFeedback ? { feedback: row.feedback } : {}),
    });
    byApp.set(row.application_id as string, list);
  }
  return byApp;
}

async function offersFor(appIds: string[]) {
  if (appIds.length === 0) return new Map<string, unknown[]>();
  const rows = await query(
    `SELECT * FROM placement_offers WHERE application_id = ANY($1::uuid[]) ORDER BY issued_at DESC`,
    [appIds],
  );
  const byApp = new Map<string, unknown[]>();
  for (const row of rows) {
    const list = byApp.get(row.application_id as string) ?? [];
    list.push({
      id: row.id,
      packageAmount: Number(row.package_amount),
      currency: row.currency,
      employmentType: row.employment_type,
      joiningDate: row.joining_date ? toLocalDateString(row.joining_date as string) : null,
      offerStatus: row.offer_status,
      issuedAt: new Date(row.issued_at as string).toISOString(),
    });
    byApp.set(row.application_id as string, list);
  }
  return byApp;
}

const APP_SELECT = `
  SELECT a.*, d.title AS drive_title, d.job_role, d.package_min, d.package_max,
         c.name AS company_name, st.student_no, u.name AS student_name
  FROM placement_applications a
  JOIN placement_drives d ON d.id = a.drive_id
  JOIN companies c ON c.id = d.company_id
  JOIN students st ON st.id = a.student_id
  JOIN users u ON u.id = st.user_id
`;

export async function applyToDrive(userId: string, driveId: string) {
  const profileId = await requireStudentProfile(userId);
  return withTransaction(async (client) => {
    const driveRows = await client.query(`SELECT * FROM placement_drives WHERE id = $1 FOR UPDATE`, [driveId]);
    if (driveRows.rows.length === 0) throw ApiError.notFound("Drive not found");
    const drive = driveRows.rows[0];
    if (drive.status !== "OPEN") throw ApiError.badRequest("This drive is not accepting applications", "VALIDATION_ERROR");
    const deadline = new Date(drive.application_deadline as string);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (deadline < today) throw ApiError.badRequest("The application deadline has passed", "VALIDATION_ERROR");

    const standing = await getAcademicStanding(profileId);
    const result = evaluateEligibility(standing, toRules(drive));
    if (!result.eligible) {
      throw ApiError.badRequest(`Not eligible: ${result.reasons.join("; ")}`, "VALIDATION_ERROR");
    }
    try {
      const inserted = await client.query(
        `INSERT INTO placement_applications (drive_id, student_id) VALUES ($1, $2) RETURNING *`,
        [driveId, profileId],
      );
      return inserted.rows[0];
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") {
        throw ApiError.conflict("You have already applied to this drive", "DUPLICATE_RESOURCE");
      }
      throw error;
    }
  });
}

export async function withdrawApplication(userId: string, applicationId: string) {
  const profileId = await requireStudentProfile(userId);
  return withTransaction(async (client) => {
    const found = await client.query(`SELECT * FROM placement_applications WHERE id = $1 FOR UPDATE`, [applicationId]);
    if (found.rows.length === 0 || (found.rows[0].student_id as string) !== profileId) {
      throw ApiError.notFound("Application not found");
    }
    const status = found.rows[0].status as ApplicationStatus;
    if (status !== "APPLIED" && status !== "SHORTLISTED") {
      throw ApiError.badRequest(`Cannot withdraw an application in ${status} state`, "INVALID_TRANSITION");
    }
    const updated = await client.query(
      `UPDATE placement_applications SET status = 'WITHDRAWN', withdrawn_at = now() WHERE id = $1 RETURNING *`,
      [applicationId],
    );
    return updated.rows[0];
  });
}

export async function listMyApplications(userId: string) {
  const profileId = await requireStudentProfile(userId);
  const rows = await query(`${APP_SELECT} WHERE a.student_id = $1 ORDER BY a.applied_at DESC LIMIT 100`, [profileId]);
  const ids = rows.map((r) => r.id as string);
  const [interviews, offers] = await Promise.all([interviewsFor(ids, false), offersFor(ids)]);
  return rows.map((row) => mapApplication(row, interviews.get(row.id as string) ?? [], offers.get(row.id as string) ?? []));
}

export async function getMyApplication(userId: string, applicationId: string) {
  const profileId = await requireStudentProfile(userId);
  const rows = await query(`${APP_SELECT} WHERE a.id = $1 AND a.student_id = $2`, [applicationId, profileId]);
  if (rows.length === 0) throw ApiError.notFound("Application not found");
  const [interviews, offers] = await Promise.all([
    interviewsFor([applicationId], false),
    offersFor([applicationId]),
  ]);
  return mapApplication(rows[0], interviews.get(applicationId) ?? [], offers.get(applicationId) ?? []);
}

export async function placementHistory(userId: string) {
  const profileId = await requireStudentProfile(userId);
  const rows = await query(
    `${APP_SELECT} WHERE a.student_id = $1 AND a.status = 'SELECTED' ORDER BY a.applied_at DESC LIMIT 100`,
    [profileId],
  );
  const ids = rows.map((r) => r.id as string);
  const offers = await offersFor(ids);
  return rows.map((row) => mapApplication(row, [], offers.get(row.id as string) ?? []));
}

// ------------------------------------------------------------------- admin

export async function adminListApplications(filter: { driveId?: string; status?: string; page?: number; limit?: number } = {}) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.driveId) {
    conditions.push(`a.drive_id = $${params.length + 1}`);
    params.push(filter.driveId);
  }
  if (filter.status) {
    conditions.push(`a.status = $${params.length + 1}`);
    params.push(filter.status);
  }
  const page = filter.page ?? 1;
  const limit = filter.limit ?? 20;
  const rows = await query(
    `${APP_SELECT} ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY a.applied_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, (page - 1) * limit],
  );
  const ids = rows.map((r) => r.id as string);
  const [interviews, offers] = await Promise.all([interviewsFor(ids, true), offersFor(ids)]);
  return {
    items: rows.map((row) => mapApplication(row, interviews.get(row.id as string) ?? [], offers.get(row.id as string) ?? [])),
    page,
    limit,
  };
}

export async function adminGetApplication(applicationId: string) {
  const rows = await query(`${APP_SELECT} WHERE a.id = $1`, [applicationId]);
  if (rows.length === 0) throw ApiError.notFound("Application not found");
  const [interviews, offers] = await Promise.all([interviewsFor([applicationId], true), offersFor([applicationId])]);
  const standing = await getAcademicStanding(rows[0].student_id as string);
  return {
    application: mapApplication(rows[0], interviews.get(applicationId) ?? [], offers.get(applicationId) ?? []),
    academicStanding: standing,
  };
}

export async function updateApplicationStatus(applicationId: string, to: ApplicationStatus) {
  return withTransaction(async (client) => {
    const found = await client.query(`SELECT * FROM placement_applications WHERE id = $1 FOR UPDATE`, [applicationId]);
    if (found.rows.length === 0) throw ApiError.notFound("Application not found");
    const from = found.rows[0].status as ApplicationStatus;
    if (!APPLICATION_TRANSITIONS[from].includes(to)) {
      throw ApiError.badRequest(`Cannot move application from ${from} to ${to}`, "INVALID_TRANSITION");
    }
    const updated = await client.query(`UPDATE placement_applications SET status = $1 WHERE id = $2 RETURNING *`, [to, applicationId]);
    return updated.rows[0];
  });
}

export async function scheduleInterview(applicationId: string, input: { roundName: string; roundNumber: number; scheduledAt: string; location: string }) {
  return withTransaction(async (client) => {
    const found = await client.query(`SELECT * FROM placement_applications WHERE id = $1 FOR UPDATE`, [applicationId]);
    if (found.rows.length === 0) throw ApiError.notFound("Application not found");
    const status = found.rows[0].status as ApplicationStatus;
    if (status !== "SHORTLISTED" && status !== "INTERVIEW") {
      throw ApiError.badRequest(`Interviews require SHORTLISTED or INTERVIEW status (current: ${status})`, "INVALID_TRANSITION");
    }
    const scheduled = new Date(input.scheduledAt);
    if (Number.isNaN(scheduled.getTime())) throw ApiError.badRequest("Invalid scheduled time", "VALIDATION_ERROR");
    const inserted = await client.query(
      `INSERT INTO placement_interviews (application_id, round_name, round_number, scheduled_at, location)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [applicationId, input.roundName.trim(), input.roundNumber, scheduled.toISOString(), (input.location ?? "").trim()],
    );
    if (status === "SHORTLISTED") {
      await client.query(`UPDATE placement_applications SET status = 'INTERVIEW' WHERE id = $1`, [applicationId]);
    }
    return inserted.rows[0];
  });
}

export async function updateInterview(interviewId: string, updates: { status?: string; feedback?: string; scheduledAt?: string; location?: string }) {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (updates.status !== undefined) {
    sets.push(`status = $${params.length + 1}`);
    params.push(updates.status);
  }
  if (updates.feedback !== undefined) {
    sets.push(`feedback = $${params.length + 1}`);
    params.push(updates.feedback.trim());
  }
  if (updates.scheduledAt !== undefined) {
    const scheduled = new Date(updates.scheduledAt);
    if (Number.isNaN(scheduled.getTime())) throw ApiError.badRequest("Invalid scheduled time", "VALIDATION_ERROR");
    sets.push(`scheduled_at = $${params.length + 1}`);
    params.push(scheduled.toISOString());
  }
  if (updates.location !== undefined) {
    sets.push(`location = $${params.length + 1}`);
    params.push(updates.location.trim());
  }
  if (sets.length === 0) throw ApiError.badRequest("No fields to update", "VALIDATION_ERROR");
  params.push(interviewId);
  const rows = await query(`UPDATE placement_interviews SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`, params);
  if (rows.length === 0) throw ApiError.notFound("Interview not found");
  return rows[0];
}

export async function createOffer(applicationId: string, input: { packageAmount: number; currency?: string; employmentType?: string; joiningDate?: string | null }) {
  return withTransaction(async (client) => {
    const found = await client.query(`SELECT * FROM placement_applications WHERE id = $1 FOR UPDATE`, [applicationId]);
    if (found.rows.length === 0) throw ApiError.notFound("Application not found");
    if ((found.rows[0].status as ApplicationStatus) !== "SELECTED") {
      throw ApiError.badRequest("Offers require a SELECTED application", "INVALID_TRANSITION");
    }
    try {
      const inserted = await client.query(
        `INSERT INTO placement_offers (application_id, package_amount, currency, employment_type, joining_date)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [applicationId, input.packageAmount, input.currency ?? "INR", input.employmentType ?? "FULL_TIME", input.joiningDate ?? null],
      );
      return inserted.rows[0];
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") {
        throw ApiError.conflict("An active offer already exists for this application", "DUPLICATE_RESOURCE");
      }
      throw error;
    }
  });
}

export async function updateOffer(offerId: string, offerStatus: string) {
  return withTransaction(async (client) => {
    const found = await client.query(`SELECT * FROM placement_offers WHERE id = $1 FOR UPDATE`, [offerId]);
    if (found.rows.length === 0) throw ApiError.notFound("Offer not found");
    if (found.rows[0].offer_status !== "PENDING") {
      throw ApiError.badRequest("Only pending offers can be updated", "INVALID_TRANSITION");
    }
    const updated = await client.query(`UPDATE placement_offers SET offer_status = $1 WHERE id = $2 RETURNING *`, [offerStatus, offerId]);
    return updated.rows[0];
  });
}

/**
 * Placement rate = distinct students holding an ACCEPTED offer ÷ distinct
 * students with an ACTIVE enrollment. Both halves are stated so the metric
 * cannot be misread.
 */
export async function placementAnalytics() {
  const [companies, drives, apps, offers] = await Promise.all([
    query(`SELECT COUNT(*) FILTER (WHERE active = true)::int AS active_companies,
                  COUNT(*)::int AS total_companies FROM companies`),
    query(`SELECT COUNT(*) FILTER (WHERE status = 'OPEN')::int AS active_drives,
                  COUNT(*)::int AS total_drives FROM placement_drives`),
    query(`SELECT COUNT(*)::int AS total_applications,
                  COUNT(*) FILTER (WHERE status = 'SHORTLISTED')::int AS shortlisted,
                  COUNT(*) FILTER (WHERE status = 'INTERVIEW')::int AS in_interview,
                  COUNT(*) FILTER (WHERE status = 'SELECTED')::int AS selected,
                  COUNT(DISTINCT student_id)::int AS applicant_students
           FROM placement_applications`),
    query(`SELECT COUNT(DISTINCT o.application_id) FILTER (WHERE o.offer_status = 'ACCEPTED')::int AS accepted_offers,
                  COUNT(DISTINCT CASE WHEN o.offer_status = 'ACCEPTED' THEN a.student_id END)::int AS placed_students,
                  AVG(o.package_amount) FILTER (WHERE o.offer_status = 'ACCEPTED') AS avg_package,
                  MAX(o.package_amount) FILTER (WHERE o.offer_status = 'ACCEPTED') AS max_package,
                  (SELECT COUNT(DISTINCT student_id)::int FROM enrollments WHERE status = 'ACTIVE') AS enrolled_students
           FROM placement_offers o JOIN placement_applications a ON a.id = o.application_id`),
  ]);
  const o = offers[0] as Record<string, unknown>;
  const placed = Number(o.placed_students ?? 0);
  const enrolled = Number(o.enrolled_students ?? 0);
  return {
    companies: { total: Number(companies[0]?.total_companies ?? 0), active: Number(companies[0]?.active_companies ?? 0) },
    drives: { total: Number(drives[0]?.total_drives ?? 0), active: Number(drives[0]?.active_drives ?? 0) },
    applications: {
      total: Number(apps[0]?.total_applications ?? 0),
      shortlisted: Number(apps[0]?.shortlisted ?? 0),
      inInterview: Number(apps[0]?.in_interview ?? 0),
      selected: Number(apps[0]?.selected ?? 0),
      applicantStudents: Number(apps[0]?.applicant_students ?? 0),
    },
    offers: {
      accepted: Number(o.accepted_offers ?? 0),
      placedStudents: placed,
      avgPackage: o.avg_package === null ? null : Math.round(Number(o.avg_package)),
      maxPackage: o.max_package === null ? null : Number(o.max_package),
    },
    placementRate: {
      placedStudents: placed,
      enrolledStudents: enrolled,
      rate: enrolled > 0 ? Math.round((placed / enrolled) * 1000) / 10 : 0,
    },
  };
}

// ------------------------------------------------------------------ parent

export async function getPlacementsForParent(parentUserId: string, studentId: string) {
  const { requireLinkedStudentUserId } = await import("../parent/parent.service");
  const studentUserId = await requireLinkedStudentUserId(parentUserId, studentId);
  const profileId = await requireStudentProfile(studentUserId);
  const rows = await query(`${APP_SELECT} WHERE a.student_id = $1 ORDER BY a.applied_at DESC LIMIT 100`, [profileId]);
  const ids = rows.map((r) => r.id as string);
  const [interviews, offers] = await Promise.all([interviewsFor(ids, false), offersFor(ids)]);
  const applications = rows.map((row) =>
    mapApplication(row, interviews.get(row.id as string) ?? [], offers.get(row.id as string) ?? []),
  );
  const placed = applications.some((a) => (a.offers as Array<{ offerStatus: string }>)?.some((o) => o.offerStatus === "ACCEPTED"));
  return {
    applications: applications.map((a) => ({
      companyName: a.companyName,
      jobRole: a.jobRole,
      status: a.status,
      appliedAt: a.appliedAt,
      interviews: (a.interviews as Array<{ roundName: string; scheduledAt: string; status: string }>).map((i) => ({
        roundName: i.roundName,
        scheduledAt: i.scheduledAt,
        status: i.status,
      })),
      offers: (a.offers as Array<{ packageAmount: number; currency: string; offerStatus: string; joiningDate: string | null }>).map((of) => ({
        packageAmount: of.packageAmount,
        currency: of.currency,
        offerStatus: of.offerStatus,
        joiningDate: of.joiningDate,
      })),
    })),
    placed,
  };
}
