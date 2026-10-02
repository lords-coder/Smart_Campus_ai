import { randomBytes } from "node:crypto";
import { query, queryOne, withTransaction } from "../../config/db";
import { ApiError } from "../../utils/ApiError";
import { toLocalDateString } from "../../utils/date";
import { env } from "../../config/env";
import { renderCertificatePdf } from "./certificate.document";
import {
  CERTIFICATE_TYPE_CODES,
  CERTIFICATE_TYPE_LABELS,
  type Certificate,
  type CertificateRequest,
  type CertificateType,
  type PublicVerification,
} from "./certificates.types";

async function requireStudentProfile(userId: string): Promise<string> {
  const row = await queryOne<{ id: string }>("SELECT id FROM students WHERE user_id = $1", [userId]);
  if (!row) throw ApiError.notFound("No student profile is linked to this account");
  return row.id;
}

function iso(value: unknown): string {
  return new Date(value as string).toISOString();
}

function mapRequest(row: Record<string, unknown>): CertificateRequest {
  return {
    id: row.id as string,
    studentId: row.student_id as string,
    studentNo: row.student_no as string | undefined,
    studentName: row.student_name as string | undefined,
    certificateType: row.certificate_type as CertificateRequest["certificateType"],
    status: row.status as CertificateRequest["status"],
    purpose: (row.purpose as string) ?? "",
    rejectionReason: (row.rejection_reason as string | null) ?? null,
    reviewedBy: (row.reviewed_by as string | null) ?? null,
    reviewedAt: row.reviewed_at ? iso(row.reviewed_at) : null,
    issuedAt: row.issued_at ? iso(row.issued_at) : null,
    certificateId: (row.certificate_id as string | null) ?? null,
    createdAt: iso(row.created_at),
  };
}

function mapCertificate(row: Record<string, unknown>): Certificate {
  return {
    id: row.id as string,
    requestId: row.request_id as string,
    studentId: row.student_id as string,
    studentNo: row.student_no as string | undefined,
    studentName: row.student_name as string | undefined,
    certificateType: row.certificate_type as Certificate["certificateType"],
    certificateNumber: row.certificate_number as string,
    verificationCode: row.verification_code as string,
    status: row.status as Certificate["status"],
    issuedAt: iso(row.issued_at),
    revokedAt: row.revoked_at ? iso(row.revoked_at) : null,
  };
}

// ------------------------------------------------------------------ student

export async function createRequest(userId: string, certificateType: CertificateType, purpose: string) {
  const profileId = await requireStudentProfile(userId);
  try {
    const rows = await query(
      `INSERT INTO certificate_requests (student_id, certificate_type, purpose)
       VALUES ($1, $2, $3) RETURNING *`,
      [profileId, certificateType, purpose.trim()],
    );
    return mapRequest(rows[0]);
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      throw ApiError.conflict("A pending request for this certificate type already exists", "DUPLICATE_RESOURCE");
    }
    throw error;
  }
}

export async function listMyRequests(userId: string): Promise<CertificateRequest[]> {
  const profileId = await requireStudentProfile(userId);
  const rows = await query(
    `SELECT * FROM certificate_requests WHERE student_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [profileId],
  );
  return rows.map(mapRequest);
}

export async function listMyCertificates(userId: string): Promise<Certificate[]> {
  const profileId = await requireStudentProfile(userId);
  const rows = await query(
    `SELECT c.* FROM certificates c WHERE c.student_id = $1 ORDER BY c.issued_at DESC LIMIT 100`,
    [profileId],
  );
  return rows.map(mapCertificate);
}

export async function getMyCertificate(userId: string, certificateId: string): Promise<Certificate> {
  const profileId = await requireStudentProfile(userId);
  const rows = await query(
    `SELECT c.* FROM certificates c WHERE c.id = $1 AND c.student_id = $2`,
    [certificateId, profileId],
  );
  if (rows.length === 0) throw ApiError.notFound("Certificate not found");
  return mapCertificate(rows[0]);
}

// ------------------------------------------------------------------- admin

export async function adminListRequests(filter: { status?: string; certificateType?: string; q?: string }) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    conditions.push(`r.status = $${params.length + 1}`);
    params.push(filter.status);
  }
  if (filter.certificateType) {
    conditions.push(`r.certificate_type = $${params.length + 1}`);
    params.push(filter.certificateType);
  }
  if (filter.q) {
    conditions.push(
      `(u.name ILIKE $${params.length + 1} OR st.student_no ILIKE $${params.length + 1} OR u.email ILIKE $${params.length + 1})`,
    );
    params.push(`%${filter.q}%`);
  }
  const rows = await query(
    `SELECT r.*, st.student_no, u.name AS student_name
     FROM certificate_requests r
     JOIN students st ON st.id = r.student_id
     JOIN users u ON u.id = st.user_id
     ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY r.created_at DESC LIMIT 200`,
    params,
  );
  return rows.map(mapRequest);
}

export async function adminGetRequest(requestId: string) {
  const rows = await query(
    `SELECT r.*, st.student_no, u.name AS student_name, u.email AS student_email,
            st.department, st.semester, st.section, st.user_id
     FROM certificate_requests r
     JOIN students st ON st.id = r.student_id
     JOIN users u ON u.id = st.user_id
     WHERE r.id = $1`,
    [requestId],
  );
  if (rows.length === 0) throw ApiError.notFound("Certificate request not found");
  const row = rows[0];
  let academic: { attendancePercentage: number | null; enrolledCourses: number } = {
    attendancePercentage: null,
    enrolledCourses: 0,
  };
  try {
    const { getAttendanceSummary } = await import("../students/students.service");
    const summary = await getAttendanceSummary(row.user_id as string);
    const enrolled = await query(`SELECT count(*)::int AS n FROM enrollments WHERE student_id = $1 AND status = 'ACTIVE'`, [
      row.student_id,
    ]);
    academic = { attendancePercentage: summary.overall.percentage, enrolledCourses: Number(enrolled[0]?.n ?? 0) };
  } catch {
    /* academic snapshot is best-effort context for the reviewer */
  }
  return {
    request: mapRequest(row),
    student: {
      studentId: row.student_id as string,
      studentNo: row.student_no as string,
      name: row.student_name as string,
      department: row.department as string,
      semester: Number(row.semester),
      section: row.section as string,
    },
    academic,
  };
}

export async function approveRequest(requestId: string, reviewerId: string) {
  return withTransaction(async (client) => {
    const found = await client.query(`SELECT * FROM certificate_requests WHERE id = $1 FOR UPDATE`, [requestId]);
    if (found.rows.length === 0) throw ApiError.notFound("Certificate request not found");
    if (found.rows[0].status !== "PENDING") {
      throw ApiError.badRequest(`Only pending requests can be approved (current: ${found.rows[0].status})`, "INVALID_TRANSITION");
    }
    const updated = await client.query(
      `UPDATE certificate_requests SET status = 'APPROVED', reviewed_by = $1, reviewed_at = now() WHERE id = $2 RETURNING *`,
      [reviewerId, requestId],
    );
    return mapRequest(updated.rows[0]);
  });
}

export async function rejectRequest(requestId: string, reviewerId: string, rejectionReason: string) {
  return withTransaction(async (client) => {
    const found = await client.query(`SELECT * FROM certificate_requests WHERE id = $1 FOR UPDATE`, [requestId]);
    if (found.rows.length === 0) throw ApiError.notFound("Certificate request not found");
    if (found.rows[0].status !== "PENDING") {
      throw ApiError.badRequest(`Only pending requests can be rejected (current: ${found.rows[0].status})`, "INVALID_TRANSITION");
    }
    const updated = await client.query(
      `UPDATE certificate_requests
       SET status = 'REJECTED', rejection_reason = $1, reviewed_by = $2, reviewed_at = now()
       WHERE id = $3 RETURNING *`,
      [rejectionReason.trim(), reviewerId, requestId],
    );
    return mapRequest(updated.rows[0]);
  });
}

function certificateNumberFor(type: CertificateType, year: number, seq: number): string {
  return `SC-${year}-${CERTIFICATE_TYPE_CODES[type]}-${String(seq).padStart(6, "0")}`;
}

function newVerificationCode(): string {
  return randomBytes(9).toString("base64url");
}

export async function issueCertificate(requestId: string, issuerId: string) {
  return withTransaction(async (client) => {
    const found = await client.query(`SELECT * FROM certificate_requests WHERE id = $1 FOR UPDATE`, [requestId]);
    if (found.rows.length === 0) throw ApiError.notFound("Certificate request not found");
    const request = found.rows[0];
    if (request.status === "ISSUED") {
      throw ApiError.badRequest("Certificate has already been issued for this request", "INVALID_TRANSITION");
    }
    if (request.status !== "APPROVED") {
      throw ApiError.badRequest(`Only approved requests can be issued (current: ${request.status})`, "INVALID_TRANSITION");
    }
    const year = new Date().getFullYear();
    const seqRow = await client.query(`SELECT nextval('certificate_no_seq') AS seq`);
    const number = certificateNumberFor(request.certificate_type as CertificateType, year, Number(seqRow.rows[0].seq));
    let code = "";
    let inserted: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      code = newVerificationCode();
      try {
        const result = await client.query(
          `INSERT INTO certificates (request_id, student_id, certificate_type, certificate_number, verification_code)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [requestId, request.student_id, request.certificate_type, number, code],
        );
        inserted = result.rows[0] as Record<string, unknown>;
        break;
      } catch (error) {
        if ((error as { code?: string })?.code !== "23505" || attempt === 2) throw error;
      }
    }
    if (!inserted) throw ApiError.conflict("Could not generate a unique certificate", "DUPLICATE_RESOURCE");
    const updated = await client.query(
      `UPDATE certificate_requests
       SET status = 'ISSUED', certificate_id = $1, issued_by = $2, issued_at = now()
       WHERE id = $3 RETURNING *`,
      [(inserted as { id: string }).id, issuerId, requestId],
    );
    return { request: mapRequest(updated.rows[0]), certificate: mapCertificate(inserted) };
  });
}

export async function revokeCertificate(certificateId: string) {
  return withTransaction(async (client) => {
    const found = await client.query(`SELECT * FROM certificates WHERE id = $1 FOR UPDATE`, [certificateId]);
    if (found.rows.length === 0) throw ApiError.notFound("Certificate not found");
    if (found.rows[0].status !== "ISSUED") {
      throw ApiError.badRequest(`Only issued certificates can be revoked (current: ${found.rows[0].status})`, "INVALID_TRANSITION");
    }
    const updated = await client.query(
      `UPDATE certificates SET status = 'REVOKED', revoked_at = now() WHERE id = $1 RETURNING *`,
      [certificateId],
    );
    await client.query(`UPDATE certificate_requests SET status = 'REVOKED' WHERE id = $1`, [found.rows[0].request_id]);
    return mapCertificate(updated.rows[0]);
  });
}

// ------------------------------------------------------------------ verify

function maskName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export async function verifyByCode(verificationCode: string): Promise<PublicVerification | null> {
  const rows = await query(
    `SELECT c.certificate_number, c.certificate_type, c.status, c.issued_at, u.name AS student_name
     FROM certificates c
     JOIN students st ON st.id = c.student_id
     JOIN users u ON u.id = st.user_id
     WHERE c.verification_code = $1`,
    [verificationCode],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    certificateNumber: row.certificate_number as string,
    certificateType: row.certificate_type as PublicVerification["certificateType"],
    studentName: maskName(row.student_name as string),
    institution: "SmartCampus (Demo)",
    issuedDate: toLocalDateString(row.issued_at as string),
    status: row.status === "REVOKED" ? "REVOKED" : "VALID",
  };
}

// ------------------------------------------------------------------ parent

export async function getIssuedForParent(parentUserId: string, studentId: string) {
  const { requireLinkedStudentUserId } = await import("../parent/parent.service");
  const studentUserId = await requireLinkedStudentUserId(parentUserId, studentId);
  const profileId = await requireStudentProfile(studentUserId);
  const rows = await query(
    `SELECT c.*, r.purpose FROM certificates c
     JOIN certificate_requests r ON r.id = c.request_id
     WHERE c.student_id = $1 ORDER BY c.issued_at DESC LIMIT 100`,
    [profileId],
  );
  return rows.map((row) => ({ ...mapCertificate(row), purpose: (row.purpose as string) ?? "" }));
}

export async function downloadForStudent(userId: string, certificateId: string) {
  const profileId = await requireStudentProfile(userId);
  return renderCertificateDocument(certificateId, profileId);
}

// ---------------------------------------------------------------- document

export async function renderCertificateDocument(certificateId: string, ownerProfileId: string): Promise<{ pdf: Buffer; filename: string }> {
  const rows = await query(
    `SELECT c.certificate_number, c.certificate_type, c.issued_at, c.verification_code,
            st.student_no, u.name AS student_name, st.department, st.semester, st.section, st.user_id
     FROM certificates c
     JOIN students st ON st.id = c.student_id
     JOIN users u ON u.id = st.user_id
     WHERE c.id = $1 AND c.student_id = $2`,
    [certificateId, ownerProfileId],
  );
  if (rows.length === 0) throw ApiError.notFound("Certificate not found");
  const row = rows[0];
  const type = row.certificate_type as CertificateType;

  const bodyLines = certificateBodyLines(type, {
    department: row.department as string,
    semester: Number(row.semester),
  });
  if (type === "TRANSCRIPT") {
    try {
      const { getStudentPerformanceFeatures } = await import("../performance/performance.service");
      const features = await getStudentPerformanceFeatures(row.user_id as string);
      bodyLines.push(
        `Internal assessment summary (demo data): attendance ${features.attendance_percentage}%, ` +
          `assessments ${features.avg_assessment_percentage}% across ${features.total_assessments} assessments, ` +
          `assignment completion ${features.assignment_submission_rate}%.`,
      );
    } catch {
      /* transcript falls back to the standard lines */
    }
  }

  const pdf = await renderCertificatePdf({
    certificateNumber: row.certificate_number as string,
    typeLabel: CERTIFICATE_TYPE_LABELS[type],
    studentName: row.student_name as string,
    studentNo: row.student_no as string,
    department: row.department as string,
    semester: Number(row.semester),
    section: row.section as string,
    issuedDate: toLocalDateString(row.issued_at as string),
    verificationUrl: `${env.corsOrigin}/verify/${row.verification_code}`,
    bodyLines,
  });
  const safeNumber = String(row.certificate_number).replace(/[^A-Za-z0-9-]/g, "");
  return { pdf, filename: `${safeNumber || "certificate"}.pdf` };
}

function certificateBodyLines(type: CertificateType, info: { department: string; semester: number }): string[] {
  switch (type) {
    case "BONAFIDE":
      return [
        "The above-named student is a bonafide student of this institution for the current academic session,",
        "as recorded in the SmartCampus student registry (demonstration data).",
      ];
    case "TRANSCRIPT":
      return [
        "This transcript summarizes the student's internal academic indicators as recorded in SmartCampus",
        "(demonstration data, not an official university mark sheet).",
      ];
    case "CONDUCT":
      return [
        "To the best of the records held in the SmartCampus demo system, no adverse disciplinary",
        "remarks are recorded against the above-named student during the period of study.",
      ];
    case "ENROLLMENT":
      return [
        `This certifies enrollment in ${info.department}, Semester ${info.semester},`,
        "as recorded in the SmartCampus enrollment registry (demonstration data).",
      ];
  }
}
