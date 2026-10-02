import { createHash, randomBytes } from "node:crypto";
import { query, queryOne, withTransaction } from "../../config/db";
import { ApiError } from "../../utils/ApiError";
import { hashPassword } from "../../utils/password";
import { signToken } from "../../utils/jwt";
import { toLocalDateString } from "../../utils/date";
import { currentWeekday } from "../../utils/date";
import * as studentsService from "../students/students.service";
import { getStudentPerformanceFeatures, predictPerformance } from "../performance/performance.service";
import { generateRecommendations } from "../performance/performance.recommendations";
import type {
  InvitationStatus,
  LinkedStudent,
  ParentInvitation,
  ParentUserRow,
  RelationshipType,
} from "./parent.types";
import type { ActivateParentInput, CreateInvitationInput } from "./parent.schemas";

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

const LINK_SELECT = `
  SELECT st.id AS student_id, st.student_no, u.name, u.email,
         st.department, st.semester, st.section, l.relationship_type
  FROM parent_student_links l
  JOIN students st ON st.id = l.student_id
  JOIN users u ON u.id = st.user_id
  WHERE l.parent_user_id = $1 AND l.status = 'ACTIVE'
  ORDER BY u.name ASC
`;

function toLinkedStudent(row: Record<string, unknown>): LinkedStudent {
  return {
    studentId: row.student_id as string,
    studentNo: row.student_no as string,
    name: row.name as string,
    email: row.email as string,
    department: row.department as string,
    semester: Number(row.semester),
    section: row.section as string,
    relationshipType: row.relationship_type as LinkedStudent["relationshipType"],
  };
}

export async function getLinkedStudents(parentUserId: string): Promise<LinkedStudent[]> {
  const rows = await query(LINK_SELECT, [parentUserId]);
  return rows.map(toLinkedStudent);
}

/** Resolves a student profile id to its users.id (for service reuse). */
export async function getStudentUserId(profileId: string): Promise<string> {
  const row = await queryOne<{ user_id: string }>("SELECT user_id FROM students WHERE id = $1", [profileId]);
  if (!row) throw ApiError.notFound("Student not found");
  return row.user_id;
}

/**
 * Authoritative link check. Returns the linked student's users.id for
 * downstream service reuse. 404 (not 403) so link existence is not leaked.
 */
export async function requireLinkedStudentUserId(parentUserId: string, studentId: string): Promise<string> {
  const row = await queryOne<{ user_id: string }>(
    `SELECT st.user_id FROM parent_student_links l
     JOIN students st ON st.id = l.student_id
     WHERE l.parent_user_id = $1 AND l.student_id = $2 AND l.status = 'ACTIVE'`,
    [parentUserId, studentId],
  );
  if (!row) throw ApiError.notFound("Student not found");
  return row.user_id;
}

// ------------------------------------------------------------ invitations

export async function createInvitation(
  adminUserId: string,
  input: CreateInvitationInput,
): Promise<{ invitation: ParentInvitation; token: string }> {
  const student = await queryOne<{ id: string; student_no: string; name: string }>(
    `SELECT st.id, st.student_no, u.name FROM students st JOIN users u ON u.id = st.user_id WHERE st.id = $1`,
    [input.studentId],
  );
  if (!student) throw ApiError.notFound("Student not found");

  const duplicate = await queryOne<{ id: string }>(
    `SELECT id FROM parent_invitations
     WHERE student_id = $1 AND lower(parent_email) = lower($2) AND status = 'PENDING' AND expires_at > now()`,
    [input.studentId, input.parentEmail],
  );
  if (duplicate) {
    throw ApiError.conflict("A pending invitation already exists for this student and email", "INVITATION_EXISTS");
  }

  const token = newInvitationToken();
  const rows = await query(
    `INSERT INTO parent_invitations (student_id, parent_email, relationship_type, token_hash, expires_at, created_by)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' hours')::interval, $6)
     RETURNING id, parent_email, relationship_type, status, expires_at, used_at, created_at`,
    [input.studentId, input.parentEmail, input.relationshipType, hashInvitationToken(token), String(input.expiresInHours), adminUserId],
  );
  const row = rows[0] as Record<string, unknown>;
  return {
    invitation: {
      id: row.id as string,
      studentId: input.studentId,
      studentNo: student.student_no,
      studentName: student.name,
      parentEmail: row.parent_email as string,
      relationshipType: row.relationship_type as ParentInvitation["relationshipType"],
      status: row.status as InvitationStatus,
      expired: false,
      expiresAt: (row.expires_at as Date).toISOString(),
      usedAt: null,
      createdAt: (row.created_at as Date).toISOString(),
    },
    token,
  };
}

function toInvitation(row: Record<string, unknown>): ParentInvitation {
  const status = row.status as InvitationStatus;
  const expired = status === "PENDING" && new Date(row.expires_at as string).getTime() < Date.now();
  return {
    id: row.id as string,
    studentId: row.student_id as string,
    studentNo: row.student_no as string,
    studentName: row.student_name as string,
    parentEmail: row.parent_email as string,
    relationshipType: row.relationship_type as ParentInvitation["relationshipType"],
    status,
    expired,
    expiresAt: new Date(row.expires_at as string).toISOString(),
    usedAt: row.used_at ? new Date(row.used_at as string).toISOString() : null,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

export async function listInvitations(): Promise<ParentInvitation[]> {
  const rows = await query(
    `SELECT i.id, i.student_id, st.student_no, u.name AS student_name, i.parent_email,
            i.relationship_type, i.status, i.expires_at, i.used_at, i.created_at
     FROM parent_invitations i
     JOIN students st ON st.id = i.student_id
     JOIN users u ON u.id = st.user_id
     ORDER BY i.created_at DESC LIMIT 200`,
  );
  return rows.map(toInvitation);
}

export async function revokeInvitation(invitationId: string): Promise<ParentInvitation> {
  const rows = await query(
    `UPDATE parent_invitations SET status = 'REVOKED' WHERE id = $1 AND status = 'PENDING'
     RETURNING id, student_id, parent_email, relationship_type, status, expires_at, used_at, created_at`,
    [invitationId],
  );
  if (rows.length === 0) throw ApiError.notFound("Pending invitation not found");
  const row = rows[0] as Record<string, unknown>;
  const student = await queryOne<{ student_no: string; name: string }>(
    `SELECT st.student_no, u.name FROM students st JOIN users u ON u.id = st.user_id WHERE st.id = $1`,
    [row.student_id],
  );
  return {
    id: row.id as string,
    studentId: row.student_id as string,
    studentNo: student?.student_no ?? "",
    studentName: student?.name ?? "",
    parentEmail: row.parent_email as string,
    relationshipType: row.relationship_type as ParentInvitation["relationshipType"],
    status: row.status as InvitationStatus,
    expired: false,
    expiresAt: new Date(row.expires_at as string).toISOString(),
    usedAt: null,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

// ------------------------------------------------------------- activation

export async function activateParent(input: ActivateParentInput): Promise<{ token: string; user: { id: string; name: string; email: string; role: "PARENT" } }> {
  const tokenHash = hashInvitationToken(input.token);
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id, student_id, parent_email, relationship_type, status, expires_at
       FROM parent_invitations WHERE token_hash = $1 FOR UPDATE`,
      [tokenHash],
    );
    const invitation = rows[0];
    if (!invitation) throw ApiError.notFound("Invitation not found");
    if (invitation.status === "REVOKED") throw ApiError.badRequest("This invitation has been revoked", "INVITATION_REVOKED");
    if (invitation.status === "ACCEPTED") throw ApiError.badRequest("This invitation has already been used", "INVITATION_USED");
    if (invitation.status === "EXPIRED" || new Date(invitation.expires_at).getTime() < Date.now()) {
      await client.query(`UPDATE parent_invitations SET status = 'EXPIRED' WHERE id = $1`, [invitation.id]);
      throw ApiError.badRequest("This invitation has expired", "INVITATION_EXPIRED");
    }

    const existing = await client.query(`SELECT id, role FROM users WHERE lower(email) = lower($1)`, [invitation.parent_email]);
    let parentId: string;
    if (existing.rows[0]) {
      if (existing.rows[0].role !== "PARENT") {
        throw ApiError.conflict("An account with this email already exists", "EMAIL_TAKEN");
      }
      parentId = existing.rows[0].id;
      await client.query(`UPDATE users SET name = $1 WHERE id = $2`, [input.name.trim(), parentId]);
    } else {
      const passwordHash = await hashPassword(input.password);
      const created = await client.query(
        `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'PARENT')
         RETURNING id`,
        [input.name.trim(), invitation.parent_email, passwordHash],
      );
      parentId = created.rows[0].id;
    }

    await client.query(
      `INSERT INTO parent_student_links (parent_user_id, student_id, relationship_type, status)
       VALUES ($1, $2, $3, 'ACTIVE')
       ON CONFLICT (parent_user_id, student_id) DO UPDATE SET status = 'ACTIVE', relationship_type = EXCLUDED.relationship_type`,
      [parentId, invitation.student_id, invitation.relationship_type],
    );
    await client.query(`UPDATE parent_invitations SET status = 'ACCEPTED', used_at = now() WHERE id = $1`, [invitation.id]);

    const userRow = await client.query(`SELECT id, name, email, role FROM users WHERE id = $1`, [parentId]);
    const user = userRow.rows[0];
    const token = signToken({ sub: user.id, role: user.role, email: user.email });
    return { token, user: { id: user.id, name: user.name, email: user.email, role: "PARENT" as const } };
  });
}

// ------------------------------------------------------- parent-scoped reads

export async function getOverview(parentUserId: string, studentId: string) {
  const studentUserId = await requireLinkedStudentUserId(parentUserId, studentId);
  const [me, features] = await Promise.all([
    studentsService.getMe(studentUserId),
    getStudentPerformanceFeatures(studentUserId),
  ]);
  let performance: { category: string; academicScore: number } | null = null;
  try {
    const prediction = await predictPerformance(studentUserId);
    performance = { category: prediction.category, academicScore: features.academic_score };
  } catch {
    performance = null;
  }
  return {
    student: { id: me.id, studentNo: me.studentNo, name: me.user.name, department: me.department, semester: me.semester, section: me.section, batchYear: me.batchYear },
    academic: {
      attendancePercentage: features.attendance_percentage,
      avgAssessmentPercentage: features.avg_assessment_percentage,
      totalAssessments: features.total_assessments,
      assignmentSubmissionRate: features.assignment_submission_rate,
      performanceCategory: performance?.category ?? null,
    },
  };
}

export async function getAttendanceForParent(parentUserId: string, studentId: string) {
  const studentUserId = await requireLinkedStudentUserId(parentUserId, studentId);
  return studentsService.getAttendanceSummary(studentUserId);
}

export async function getFeesForParent(parentUserId: string, studentId: string) {
  const studentUserId = await requireLinkedStudentUserId(parentUserId, studentId);
  return studentsService.getFeesSummary(studentUserId);
}

export async function getTimetableForParent(parentUserId: string, studentId: string, day?: string) {
  const studentUserId = await requireLinkedStudentUserId(parentUserId, studentId);
  return studentsService.getTimetable(studentUserId, day ?? currentWeekday());
}

export async function getRecommendationHeadlines(parentUserId: string, studentId: string) {
  const studentUserId = await requireLinkedStudentUserId(parentUserId, studentId);
  const result = await generateRecommendations(studentUserId);
  return {
    summary: result.data.summary,
    headlines: result.data.recommendations.map((rec) => ({
      courseName: rec.courseName,
      category: rec.category,
      priority: rec.priority,
      reason: rec.reason,
      resources: rec.resources.map((r) => ({ title: r.title, url: r.url, type: r.resource_type, topic: r.topic })),
      resourceCount: rec.resourceCount,
    })),
  };
}

export interface ParentNotice {
  kind: "ATTENDANCE_WARNING" | "FEE_DUE" | "TODAY_CLASSES";
  title: string;
  detail: string;
}

export async function getNotices(parentUserId: string, studentId: string): Promise<ParentNotice[]> {
  const studentUserId = await requireLinkedStudentUserId(parentUserId, studentId);
  const [attendance, fees, timetable] = await Promise.all([
    studentsService.getAttendanceSummary(studentUserId),
    studentsService.getFeesSummary(studentUserId),
    studentsService.getTimetable(studentUserId, currentWeekday()),
  ]);
  const notices: ParentNotice[] = [];
  const pct = attendance.overall.percentage;
  if (pct < 75) {
    notices.push({
      kind: "ATTENDANCE_WARNING",
      title: "Attendance needs attention",
      detail: `Overall attendance is ${pct}%. Please encourage regular class attendance.`,
    });
  }
  if (fees.totalPending > 0) {
    const next = fees.nextDue ? ` Next due: ${fees.nextDue.feeType} by ${toLocalDateString(fees.nextDue.dueDate)}.` : "";
    notices.push({
      kind: "FEE_DUE",
      title: "Fee payment pending",
      detail: `An amount of Rs.${fees.totalPending.toLocaleString("en-IN")} is pending.${next}`,
    });
  }
  notices.push({
    kind: "TODAY_CLASSES",
    title: timetable.entries.length > 0 ? `${timetable.entries.length} classes today` : "No classes today",
    detail:
      timetable.entries.length > 0
        ? `First class starts at ${timetable.entries[0].startTime.slice(0, 5)}.`
        : "There are no classes scheduled for today.",
  });
  return notices;
}

// ------------------------------------------------------------------- admin

export async function listParents(): Promise<ParentUserRow[]> {
  const rows = await query(
    `SELECT u.id, u.name, u.email,
            COALESCE(json_agg(json_build_object(
              'linkId', l.id, 'studentId', st.id, 'studentNo', st.student_no, 'name', su.name,
              'section', st.section, 'relationshipType', l.relationship_type
            ) ORDER BY su.name) FILTER (WHERE l.id IS NOT NULL), '[]') AS links,
            COUNT(l.id) FILTER (WHERE l.status = 'ACTIVE')::int AS link_count
     FROM users u
     LEFT JOIN parent_student_links l ON l.parent_user_id = u.id AND l.status = 'ACTIVE'
     LEFT JOIN students st ON st.id = l.student_id
     LEFT JOIN users su ON su.id = st.user_id
     WHERE u.role = 'PARENT'
     GROUP BY u.id, u.name, u.email
     ORDER BY u.name ASC`,
  );
  return rows.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    linkedStudents: (row.links as LinkedStudent[]) ?? [],
    linkCount: Number(row.link_count ?? 0),
  }));
}

export async function updateLink(linkId: string, status: "ACTIVE" | "REVOKED") {
  const rows = await query(
    `UPDATE parent_student_links SET status = $1 WHERE id = $2 RETURNING id, parent_user_id, student_id, relationship_type, status`,
    [status, linkId],
  );
  if (rows.length === 0) throw ApiError.notFound("Parent link not found");
  return rows[0];
}

export type { RelationshipType };
