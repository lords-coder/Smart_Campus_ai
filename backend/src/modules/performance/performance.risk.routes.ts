import { Router } from "express";
import { z } from "zod";
import { query } from "../../config/db";
import { ApiError } from "../../utils/ApiError";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/response";
import { requireAuth, requireRole } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import {
  INTERVENTION_STATUSES,
  INTERVENTION_TYPES,
  analyzeStudentRiskByProfileId,
  analyzeStudentRiskByUserId,
  createInterventionRecord,
  ensureRiskSnapshots,
  facultyProfileId,
  generateAiInterventionPlanByUserId,
  getStudentInterventionsByProfile,
  saveRiskSnapshot,
  updateInterventionRecord,
} from "./performance.risk";

const router = Router();

router.use(requireAuth);

const listQuerySchema = z.object({
  riskLevel: z.enum(["CRITICAL", "HIGH", "MODERATE", "LOW"]).optional(),
  section: z.string().min(1).max(10).optional(),
  course: z.string().min(1).max(20).optional(),
});

const createInterventionSchema = z.object({
  studentId: z.string().uuid(),
  interventionType: z.enum([
    "ACADEMIC_REVIEW",
    "ATTENDANCE_SUPPORT",
    "ASSESSMENT_SUPPORT",
    "ASSIGNMENT_SUPPORT",
    "REMEDIAL_SUPPORT",
    "FACULTY_MEETING",
    "GENERAL_FOLLOW_UP",
  ]),
  notes: z.string().max(2000).optional().default(""),
  followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
});

const updateInterventionSchema = z
  .object({
    interventionType: z
      .enum([
        "ACADEMIC_REVIEW",
        "ATTENDANCE_SUPPORT",
        "ASSESSMENT_SUPPORT",
        "ASSIGNMENT_SUPPORT",
        "REMEDIAL_SUPPORT",
        "FACULTY_MEETING",
        "GENERAL_FOLLOW_UP",
      ])
      .optional(),
    notes: z.string().max(2000).optional(),
    status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "DISMISSED"]).optional(),
    followUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

function paramToString(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

async function facultyCourseIds(userId: string): Promise<string[]> {
  const profileId = await facultyProfileId(userId);
  if (!profileId) return [];
  const rows = await query<{ course_id: string }>(
    `SELECT DISTINCT t.course_id FROM timetable_entries t WHERE t.faculty_id = $1 AND t.is_active = true`,
    [profileId],
  );
  return rows.map((r) => r.course_id);
}

async function assertFacultyCanAccessStudent(facultyUserId: string, studentProfileId: string): Promise<void> {
  const courses = await facultyCourseIds(facultyUserId);
  if (courses.length === 0) throw ApiError.forbidden("You are not assigned to any active course");
  const rows = await query<{ one: number }>(
    `SELECT 1 AS one FROM enrollments e WHERE e.student_id = $1 AND e.status = 'ACTIVE' AND e.course_id = ANY($2::uuid[]) LIMIT 1`,
    [studentProfileId, courses],
  );
  if (rows.length === 0) throw ApiError.forbidden("You are not authorized to view this student");
}

/**
 * GET /api/risk/own/analysis — STUDENT sees own high-level warning (no staff notes).
 */
router.get(
  "/own/analysis",
  requireRole("STUDENT"),
  asyncHandler(async (req, res) => {
    const result = await analyzeStudentRiskByUserId(req.user!.id);
    await saveRiskSnapshot(result.data.studentId, {
      riskLevel: result.data.riskLevel,
      riskScore: result.data.riskScore,
      signals: result.data.signals,
      trends: result.data.trends,
    });
    // Student-facing minimization: level + signals + supportive metrics, no internal score emphasis.
    return sendSuccess(
      res,
      {
        riskLevel: result.data.riskLevel,
        signals: result.data.signals,
        trends: result.data.trends,
        currentMetrics: result.data.currentMetrics,
      },
      result.message,
    );
  }),
);

router.get(
  "/own/intervention-plan",
  requireRole("STUDENT"),
  asyncHandler(async (req, res) => {
    const result = await generateAiInterventionPlanByUserId(req.user!.id);
    return sendSuccess(res, result.data, result.message);
  }),
);

/**
 * GET /api/risk/students — FACULTY (own courses) / ADMIN (all).
 */
router.get(
  "/students",
  requireRole("FACULTY", "ADMIN"),
  validate(listQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const role = req.user!.role;
    const userId = req.user!.id;
    const { riskLevel, section, course } = req.query as { riskLevel?: string; section?: string; course?: string };

    let facultyCourses: string[] = [];
    if (role === "FACULTY") {
      facultyCourses = await facultyCourseIds(userId);
      if (facultyCourses.length === 0) {
        return sendSuccess(res, { students: [] }, "No assigned courses");
      }
    }

    // Scope students first (snapshot-independent filters), then backfill snapshots.
    const scopeConditions: string[] = [`e.status = 'ACTIVE'`];
    const scopeParams: unknown[] = [];
    let sidx = 1;
    if (role === "FACULTY") {
      scopeConditions.push(`e.course_id = ANY($${sidx++}::uuid[])`);
      scopeParams.push(facultyCourses);
    }
    if (section) {
      scopeConditions.push(`st.section = $${sidx++}`);
      scopeParams.push(section);
    }
    if (course) {
      scopeConditions.push(`EXISTS (SELECT 1 FROM enrollments e2 JOIN courses c2 ON c2.id = e2.course_id
        WHERE e2.student_id = st.id AND e2.status = 'ACTIVE' AND c2.code ILIKE $${sidx++})`);
      scopeParams.push(`%${course}%`);
    }

    const scopeRows = await query<{ id: string }>(
      `SELECT DISTINCT st.id FROM students st
       JOIN enrollments e ON e.student_id = st.id
       WHERE ${scopeConditions.join(" AND ")} LIMIT 200`,
      scopeParams,
    );
    const scopeIds = scopeRows.map((r) => r.id);
    await ensureRiskSnapshots(scopeIds);

    // One row per student: latest snapshot + open intervention count, batched (no N+1).
    const listParams: unknown[] = [scopeIds.length > 0 ? scopeIds : ["00000000-0000-0000-0000-000000000000"]];
    let listFilter = "";
    if (riskLevel) {
      listFilter = `AND rs.risk_level = $2`;
      listParams.push(riskLevel);
    }
    const rows = await query(
      `SELECT st.id AS student_id, u.name AS student_name, u.email AS student_email,
              st.student_no, st.section,
              rs.risk_level, rs.risk_score, rs.signals, rs.calculated_on,
              rs.attendance_current, rs.attendance_previous, rs.attendance_change,
              rs.assessment_current, rs.assessment_previous, rs.assessment_change,
              rs.assignment_current, rs.assignment_previous, rs.assignment_change,
              (SELECT COUNT(*)::int FROM interventions i
                WHERE i.student_id = st.id AND i.status IN ('OPEN','IN_PROGRESS')) AS open_interventions
       FROM students st
       JOIN users u ON u.id = st.user_id
       LEFT JOIN LATERAL (
         SELECT * FROM risk_snapshots r WHERE r.student_id = st.id ORDER BY r.calculated_on DESC LIMIT 1
       ) rs ON true
       WHERE st.id = ANY($1::uuid[]) ${listFilter}
       ORDER BY
         CASE rs.risk_level WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MODERATE' THEN 2 WHEN 'LOW' THEN 3 ELSE 4 END,
         rs.risk_score DESC NULLS LAST, u.name ASC
       LIMIT 200`,
      listParams,
    );

    const students = rows.map((row: Record<string, unknown>) => ({
      studentId: row.student_id,
      studentName: row.student_name,
      studentEmail: row.student_email,
      studentNo: row.student_no,
      section: row.section,
      riskLevel: row.risk_level,
      riskScore: row.risk_score,
      signals: typeof row.signals === "string" ? JSON.parse(row.signals as string) : row.signals ?? [],
      trends: {
        attendance: { current: row.attendance_current, previous: row.attendance_previous, change: row.attendance_change },
        assessments: { current: row.assessment_current, previous: row.assessment_previous, change: row.assessment_change },
        assignments: { current: row.assignment_current, previous: row.assignment_previous, change: row.assignment_change },
      },
      openInterventions: row.open_interventions ?? 0,
      lastUpdated: row.calculated_on,
    }));

    return sendSuccess(res, { students }, "Risk data retrieved");
  }),
);

/**
 * GET /api/risk/stats — cohort summary.
 */
router.get(
  "/stats",
  requireRole("FACULTY", "ADMIN"),
  asyncHandler(async (req, res) => {
    const role = req.user!.role;
    const userId = req.user!.id;
    let facultyCourses: string[] = [];
    if (role === "FACULTY") {
      facultyCourses = await facultyCourseIds(userId);
      if (facultyCourses.length === 0) {
        return sendSuccess(
          res,
          { totalStudents: 0, critical: 0, high: 0, moderate: 0, low: 0, decliningAttendance: 0, decliningAssessments: 0, decliningAssignments: 0, openInterventions: 0 },
          "No assigned courses",
        );
      }
    }

    const scopeIds = await query<{ id: string }>(
      role === "FACULTY"
        ? `SELECT DISTINCT st.id FROM students st JOIN enrollments e ON e.student_id = st.id
           WHERE e.status = 'ACTIVE' AND e.course_id = ANY($1::uuid[])`
        : `SELECT DISTINCT st.id FROM students st JOIN enrollments e ON e.student_id = st.id WHERE e.status = 'ACTIVE'`,
      role === "FACULTY" ? [facultyCourses] : [],
    ).then((r) => r.map((x) => x.id));
    await ensureRiskSnapshots(scopeIds);

    const params: unknown[] = [];
    let scope = "";
    if (role === "FACULTY") {
      scope = `AND st.id = ANY($1::uuid[])`;
      params.push(scopeIds.length > 0 ? scopeIds : ["00000000-0000-0000-0000-000000000000"]);
    }

    const rows = await query(
      `SELECT
         COUNT(DISTINCT st.id)::int AS total_students,
         COUNT(DISTINCT CASE WHEN rs.risk_level='CRITICAL' THEN st.id END)::int AS critical,
         COUNT(DISTINCT CASE WHEN rs.risk_level='HIGH' THEN st.id END)::int AS high,
         COUNT(DISTINCT CASE WHEN rs.risk_level='MODERATE' THEN st.id END)::int AS moderate,
         COUNT(DISTINCT CASE WHEN rs.risk_level='LOW' THEN st.id END)::int AS low,
         COUNT(DISTINCT CASE WHEN rs.attendance_change < -5 THEN st.id END)::int AS declining_attendance,
         COUNT(DISTINCT CASE WHEN rs.assessment_change < -5 THEN st.id END)::int AS declining_assessments,
         COUNT(DISTINCT CASE WHEN rs.assignment_change < -5 THEN st.id END)::int AS declining_assignments
       FROM students st
       LEFT JOIN LATERAL (SELECT * FROM risk_snapshots r WHERE r.student_id = st.id ORDER BY r.calculated_on DESC LIMIT 1) rs ON true
       WHERE EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = st.id AND e.status='ACTIVE') ${scope}`,
      params,
    );
    const openRows = await query(
      `SELECT COUNT(*)::int AS open_interventions FROM interventions i
        JOIN students st ON st.id = i.student_id
        WHERE i.status IN ('OPEN','IN_PROGRESS')
        ${role === "FACULTY" ? `AND st.id = ANY($1::uuid[])` : ""}`,
      role === "FACULTY" ? [scopeIds.length > 0 ? scopeIds : ["00000000-0000-0000-0000-000000000000"]] : [],
    );

    const s = (rows[0] ?? {}) as Record<string, number>;
    const openCount = ((openRows[0] ?? {}) as { open_interventions?: number }).open_interventions ?? 0;
    return sendSuccess(
      res,
      {
        totalStudents: s.total_students ?? 0,
        critical: s.critical ?? 0,
        high: s.high ?? 0,
        moderate: s.moderate ?? 0,
        low: s.low ?? 0,
        decliningAttendance: s.declining_attendance ?? 0,
        decliningAssessments: s.declining_assessments ?? 0,
        decliningAssignments: s.declining_assignments ?? 0,
        openInterventions: openCount,
      },
      "Risk statistics retrieved",
    );
  }),
);

/**
 * GET /api/risk/students/:studentId — detail + interventions.
 * :studentId is students.id (profile id).
 */
router.get(
  "/students/:studentId",
  requireRole("FACULTY", "ADMIN"),
  asyncHandler(async (req, res) => {
    const profileId = paramToString(req.params.studentId);
    if (req.user!.role === "FACULTY") {
      await assertFacultyCanAccessStudent(req.user!.id, profileId);
    }
    const analysis = await analyzeStudentRiskByProfileId(profileId);
    await saveRiskSnapshot(analysis.data.studentId, {
      riskLevel: analysis.data.riskLevel,
      riskScore: analysis.data.riskScore,
      signals: analysis.data.signals,
      trends: analysis.data.trends,
    });
    const interventions = await getStudentInterventionsByProfile(profileId);
    const header = await query(
      `SELECT st.id AS student_id, u.name AS student_name, u.email AS student_email, st.student_no, st.section, st.semester
       FROM students st JOIN users u ON u.id = st.user_id WHERE st.id = $1`,
      [profileId],
    );
    if (header.length === 0) throw ApiError.notFound("Student not found");
    return sendSuccess(res, { student: header[0], riskAnalysis: analysis.data, interventions }, "Student risk data retrieved");
  }),
);

router.get(
  "/students/:studentId/trends",
  requireRole("FACULTY", "ADMIN"),
  asyncHandler(async (req, res) => {
    const profileId = paramToString(req.params.studentId);
    if (req.user!.role === "FACULTY") {
      await assertFacultyCanAccessStudent(req.user!.id, profileId);
    }
    const analysis = await analyzeStudentRiskByProfileId(profileId);
    return sendSuccess(res, { studentId: profileId, trends: analysis.data.trends, currentMetrics: analysis.data.currentMetrics }, "Trends retrieved");
  }),
);

router.get(
  "/students/:studentId/interventions",
  requireRole("FACULTY", "ADMIN"),
  asyncHandler(async (req, res) => {
    const profileId = paramToString(req.params.studentId);
    if (req.user!.role === "FACULTY") {
      await assertFacultyCanAccessStudent(req.user!.id, profileId);
    }
    const interventions = await getStudentInterventionsByProfile(profileId);
    return sendSuccess(res, { interventions }, "Interventions retrieved");
  }),
);

/**
 * POST /api/risk/students/:studentId/interventions
 */
router.post(
  "/students/:studentId/interventions",
  requireRole("FACULTY", "ADMIN"),
  validate(createInterventionSchema.omit({ studentId: true }), "body"),
  asyncHandler(async (req, res) => {
    const profileId = paramToString(req.params.studentId);
    if (req.user!.role === "FACULTY") {
      await assertFacultyCanAccessStudent(req.user!.id, profileId);
    }
    const { interventionType, notes, followUpDate } = req.body as {
      interventionType: keyof typeof INTERVENTION_TYPES;
      notes?: string;
      followUpDate?: string | null;
    };
    if (followUpDate) {
      const d = new Date(followUpDate);
      if (Number.isNaN(d.getTime())) throw ApiError.badRequest("Invalid follow_up_date", "VALIDATION_ERROR");
    }
    const analysis = await analyzeStudentRiskByProfileId(profileId);
    const row = await createInterventionRecord(
      profileId,
      req.user!.id,
      analysis.data.riskLevel,
      interventionType,
      notes ?? "",
      followUpDate ?? null,
    );
    return sendSuccess(res, row, "Intervention created", 201);
  }),
);

/** Back-compat alias: POST /api/risk/interventions { studentId, ... } */
router.post(
  "/interventions",
  requireRole("FACULTY", "ADMIN"),
  validate(createInterventionSchema, "body"),
  asyncHandler(async (req, res) => {
    const { studentId, interventionType, notes, followUpDate } = req.body as {
      studentId: string;
      interventionType: keyof typeof INTERVENTION_TYPES;
      notes?: string;
      followUpDate?: string | null;
    };
    if (req.user!.role === "FACULTY") {
      await assertFacultyCanAccessStudent(req.user!.id, studentId);
    }
    const analysis = await analyzeStudentRiskByProfileId(studentId);
    const row = await createInterventionRecord(req.body.studentId, req.user!.id, analysis.data.riskLevel, interventionType, notes ?? "", followUpDate ?? null);
    return sendSuccess(res, row, "Intervention created", 201);
  }),
);

router.patch(
  "/interventions/:interventionId",
  requireRole("FACULTY", "ADMIN"),
  validate(updateInterventionSchema, "body"),
  asyncHandler(async (req, res) => {
    const interventionId = paramToString(req.params.interventionId);
    const rows = await query(`SELECT * FROM interventions WHERE id = $1`, [interventionId]);
    if (rows.length === 0) throw ApiError.notFound("Intervention not found");
    const existing = rows[0] as { student_id: string; created_by: string };
    if (req.user!.role === "FACULTY") {
      await assertFacultyCanAccessStudent(req.user!.id, existing.student_id as string);
    }
    const updated = await updateInterventionRecord(interventionId, req.body as Record<string, string>);
    return sendSuccess(res, updated, "Intervention updated");
  }),
);

export default router;
