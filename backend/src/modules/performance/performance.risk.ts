import { query, queryOne } from "../../config/db";
import { ApiError } from "../../utils/ApiError";
import { getStudentPerformanceFeatures, getStudentProfileId } from "./performance.service";
import { createProvider } from "../ai/ai.provider";

export const RISK_LEVELS = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MODERATE: "MODERATE",
  LOW: "LOW",
} as const;

export type RiskLevel = (typeof RISK_LEVELS)[keyof typeof RISK_LEVELS];

export const INTERVENTION_TYPES = {
  ACADEMIC_REVIEW: "ACADEMIC_REVIEW",
  ATTENDANCE_SUPPORT: "ATTENDANCE_SUPPORT",
  ASSESSMENT_SUPPORT: "ASSESSMENT_SUPPORT",
  ASSIGNMENT_SUPPORT: "ASSIGNMENT_SUPPORT",
  REMEDIAL_SUPPORT: "REMEDIAL_SUPPORT",
  FACULTY_MEETING: "FACULTY_MEETING",
  GENERAL_FOLLOW_UP: "GENERAL_FOLLOW_UP",
} as const;

export const INTERVENTION_STATUSES = {
  OPEN: "OPEN",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  DISMISSED: "DISMISSED",
} as const;

export interface TrendPoint {
  current: number;
  previous: number;
  change: number;
  trend: "DECLINING" | "STABLE" | "IMPROVING" | "INSUFFICIENT_DATA";
}

export interface RiskTrends {
  attendance: TrendPoint;
  assessments: TrendPoint;
  assignments: TrendPoint;
}

async function resolveStudentProfileId(userId: string): Promise<string> {
  return getStudentProfileId(userId);
}

function toTrend(current: number, previous: number, hasCurrent: boolean, hasPrevious: boolean): TrendPoint {
  const c = Math.round(current * 10) / 10;
  const p = Math.round(previous * 10) / 10;
  const change = Math.round((c - p) * 10) / 10;
  let trend: TrendPoint["trend"] = "STABLE";
  if (!hasCurrent || !hasPrevious) {
    trend = "INSUFFICIENT_DATA";
  } else if (change <= -3) {
    trend = "DECLINING";
  } else if (change >= 3) {
    trend = "IMPROVING";
  } else {
    trend = "STABLE";
  }
  return { current: c, previous: p, change, trend };
}

/**
 * Calculates temporal trends for a student.
 * Windows chosen to match seed data:
 * - attendance: last 21 days vs prior 21 days (seed covers ~42 days)
 * - assessments: last 30 days vs prior 30-60 days (seed covers 90 days)
 * - assignments: last 30 days vs prior 30-60 days (seed covers 60 days)
 */
export async function calculateStudentTrendsByProfile(profileId: string): Promise<RiskTrends> {
  const attendanceRows = await query<{
    current_pct: number | null;
    previous_pct: number | null;
    current_n: number;
    previous_n: number;
  }>(
    `SELECT
       AVG(CASE WHEN date >= CURRENT_DATE - INTERVAL '21 days'
            THEN CASE WHEN status IN ('PRESENT','LATE') THEN 1.0 ELSE 0.0 END END) * 100 AS current_pct,
       AVG(CASE WHEN date >= CURRENT_DATE - INTERVAL '42 days' AND date < CURRENT_DATE - INTERVAL '21 days'
            THEN CASE WHEN status IN ('PRESENT','LATE') THEN 1.0 ELSE 0.0 END END) * 100 AS previous_pct,
       COUNT(*) FILTER (WHERE date >= CURRENT_DATE - INTERVAL '21 days')::int AS current_n,
       COUNT(*) FILTER (WHERE date >= CURRENT_DATE - INTERVAL '42 days' AND date < CURRENT_DATE - INTERVAL '21 days')::int AS previous_n
     FROM attendance WHERE student_id = $1`,
    [profileId],
  );

  const assessmentRows = await query<{
    current_pct: number | null;
    previous_pct: number | null;
    current_n: number;
    previous_n: number;
  }>(
    `SELECT
       AVG(CASE WHEN assessed_on >= CURRENT_DATE - INTERVAL '30 days'
            THEN (marks_obtained / NULLIF(max_marks,0)) * 100 END) AS current_pct,
       AVG(CASE WHEN assessed_on >= CURRENT_DATE - INTERVAL '60 days' AND assessed_on < CURRENT_DATE - INTERVAL '30 days'
            THEN (marks_obtained / NULLIF(max_marks,0)) * 100 END) AS previous_pct,
       COUNT(*) FILTER (WHERE assessed_on >= CURRENT_DATE - INTERVAL '30 days')::int AS current_n,
       COUNT(*) FILTER (WHERE assessed_on >= CURRENT_DATE - INTERVAL '60 days' AND assessed_on < CURRENT_DATE - INTERVAL '30 days')::int AS previous_n
     FROM assessments WHERE student_id = $1`,
    [profileId],
  );

  const assignmentRows = await query<{
    current_pct: number | null;
    previous_pct: number | null;
    current_n: number;
    previous_n: number;
  }>(
    `SELECT
       AVG(CASE WHEN due_date >= CURRENT_DATE - INTERVAL '30 days' AND submitted
            THEN CASE WHEN score IS NOT NULL AND max_score > 0 THEN (score / max_score) * 100 ELSE 0 END END) AS current_pct,
       AVG(CASE WHEN due_date >= CURRENT_DATE - INTERVAL '60 days' AND due_date < CURRENT_DATE - INTERVAL '30 days' AND submitted
            THEN CASE WHEN score IS NOT NULL AND max_score > 0 THEN (score / max_score) * 100 ELSE 0 END END) AS previous_pct,
       COUNT(*) FILTER (WHERE due_date >= CURRENT_DATE - INTERVAL '30 days')::int AS current_n,
       COUNT(*) FILTER (WHERE due_date >= CURRENT_DATE - INTERVAL '60 days' AND due_date < CURRENT_DATE - INTERVAL '30 days')::int AS previous_n
     FROM assignments WHERE student_id = $1`,
    [profileId],
  );

  const a = attendanceRows[0];
  const asmt = assessmentRows[0];
  const asg = assignmentRows[0];

  return {
    attendance: toTrend(
      Number(a?.current_pct ?? 0),
      Number(a?.previous_pct ?? 0),
      Number(a?.current_n ?? 0) >= 3,
      Number(a?.previous_n ?? 0) >= 3,
    ),
    assessments: toTrend(
      Number(asmt?.current_pct ?? 0),
      Number(asmt?.previous_pct ?? 0),
      Number(asmt?.current_n ?? 0) >= 1,
      Number(asmt?.previous_n ?? 0) >= 1,
    ),
    assignments: toTrend(
      Number(asg?.current_pct ?? 0),
      Number(asg?.previous_pct ?? 0),
      Number(asg?.current_n ?? 0) >= 1,
      Number(asg?.previous_n ?? 0) >= 1,
    ),
  };
}

function scoreDecline(change: number, trend: TrendPoint["trend"], severeWeight: number, moderateWeight: number, mildWeight: number): { points: number; label: string | null } {
  if (trend === "INSUFFICIENT_DATA") return { points: 0, label: null };
  if (change <= -15) return { points: severeWeight, label: "severe" };
  if (change <= -8) return { points: moderateWeight, label: "moderate" };
  if (change <= -3) return { points: mildWeight, label: "mild" };
  return { points: 0, label: null };
}

/**
 * Transparent deterministic risk scoring (0-100, NOT a probability).
 * - Attendance decline: severe 25 / moderate 15 / mild 5
 * - Assessment decline: severe 25 / moderate 15 / mild 5
 * - Assignment decline: severe 20 / moderate 12 / mild 6
 * - Persistent low current values: very low +15, low +10 per domain
 * - Multiple declining indicators: +10 bonus when 2+ domains declining
 * Levels: >=70 CRITICAL, >=50 HIGH, >=30 MODERATE, else LOW.
 */
function calculateRiskLevel(
  trends: RiskTrends,
  currentFeatures: { attendance_percentage: number; avg_assessment_percentage: number; assignment_submission_rate: number },
): { level: RiskLevel; score: number; signals: string[] } {
  const signals: string[] = [];
  let score = 0;

  const att = scoreDecline(trends.attendance.change, trends.attendance.trend, 25, 15, 5);
  if (att.label) {
    score += att.points;
    signals.push(`Attendance ${att.label} decline (${trends.attendance.previous.toFixed(0)}% → ${trends.attendance.current.toFixed(0)}%)`);
  }
  const asm = scoreDecline(trends.assessments.change, trends.assessments.trend, 25, 15, 5);
  if (asm.label) {
    score += asm.points;
    signals.push(`Assessment performance ${asm.label} decline (${trends.assessments.previous.toFixed(0)}% → ${trends.assessments.current.toFixed(0)}%)`);
  }
  const asg = scoreDecline(trends.assignments.change, trends.assignments.trend, 20, 12, 6);
  if (asg.label) {
    score += asg.points;
    signals.push(`Assignment completion ${asg.label} decline (${trends.assignments.previous.toFixed(0)}% → ${trends.assignments.current.toFixed(0)}%)`);
  }

  if (currentFeatures.attendance_percentage < 50) {
    score += 15;
    signals.push(`Very low current attendance (${currentFeatures.attendance_percentage.toFixed(0)}%)`);
  } else if (currentFeatures.attendance_percentage < 60) {
    score += 10;
    signals.push(`Low current attendance (${currentFeatures.attendance_percentage.toFixed(0)}%)`);
  }

  if (currentFeatures.avg_assessment_percentage < 40) {
    score += 15;
    signals.push(`Very low current assessment average (${currentFeatures.avg_assessment_percentage.toFixed(0)}%)`);
  } else if (currentFeatures.avg_assessment_percentage < 50) {
    score += 10;
    signals.push(`Low current assessment average (${currentFeatures.avg_assessment_percentage.toFixed(0)}%)`);
  }

  if (currentFeatures.assignment_submission_rate < 40) {
    score += 15;
    signals.push(`Very low current assignment completion (${currentFeatures.assignment_submission_rate.toFixed(0)}%)`);
  } else if (currentFeatures.assignment_submission_rate < 50) {
    score += 10;
    signals.push(`Low current assignment completion (${currentFeatures.assignment_submission_rate.toFixed(0)}%)`);
  }

  const decliningCount = [trends.attendance.trend, trends.assessments.trend, trends.assignments.trend].filter(
    (t) => t === "DECLINING",
  ).length;
  if (decliningCount >= 2) {
    score += 10;
    signals.push(`Multiple declining indicators (${decliningCount} domains)`);
  }

  score = Math.min(100, Math.max(0, Math.round(score)));

  let level: RiskLevel = RISK_LEVELS.LOW;
  if (score >= 70) level = RISK_LEVELS.CRITICAL;
  else if (score >= 50) level = RISK_LEVELS.HIGH;
  else if (score >= 30) level = RISK_LEVELS.MODERATE;

  return { level, score, signals };
}

/**
 * Analyzes student risk. userId is users.id (JWT sub); profile is resolved internally.
 */
export async function analyzeStudentRiskByUserId(userId: string) {
  const profileId = await resolveStudentProfileId(userId);
  const currentFeatures = await getStudentPerformanceFeatures(userId);
  const trends = await calculateStudentTrendsByProfile(profileId);
  const { level, score, signals } = calculateRiskLevel(trends, currentFeatures);

  return {
    success: true as const,
    data: {
      studentId: profileId,
      userId,
      riskLevel: level,
      riskScore: score,
      signals,
      trends,
      currentMetrics: {
        attendancePercentage: currentFeatures.attendance_percentage,
        avgAssessmentPercentage: currentFeatures.avg_assessment_percentage,
        assignmentSubmissionRate: currentFeatures.assignment_submission_rate,
        avgAssignmentScore: currentFeatures.avg_assignment_score,
        academicScore: currentFeatures.academic_score,
      },
    },
    message: "Risk analysis completed",
  };
}

/** Analyze by profile id (students.id) – for staff views. */
export async function analyzeStudentRiskByProfileId(profileId: string) {
  const owner = await queryOne<{ user_id: string }>("SELECT user_id FROM students WHERE id = $1", [profileId]);
  if (!owner) throw ApiError.notFound("Student not found");
  return analyzeStudentRiskByUserId(owner.user_id);
}

export async function generateAiInterventionPlanByUserId(userId: string) {
  const riskAnalysis = (await analyzeStudentRiskByUserId(userId)).data;
  if (riskAnalysis.signals.length === 0) {
    return {
      success: true as const,
      data: {
        interventionPlan: "No risk signals detected — academic indicators appear stable. Continue current study habits.",
        riskAnalysis: {
          riskLevel: riskAnalysis.riskLevel,
          riskScore: riskAnalysis.riskScore,
          signals: riskAnalysis.signals,
        },
      },
      message: "No intervention needed",
    };
  }
  const context = {
    scopeNote: "SmartCampus deterministic risk analysis output — academic facts only",
    riskAnalysis: {
      riskLevel: riskAnalysis.riskLevel,
      riskScore: riskAnalysis.riskScore,
      signals: riskAnalysis.signals,
      trends: riskAnalysis.trends,
      currentMetrics: riskAnalysis.currentMetrics,
    },
  };
  try {
    const provider = createProvider();
    const result = await provider.generate({
      systemPrompt:
        "You are SmartCampus AI. Generate a concise, supportive intervention suggestion for authorized staff review based on the provided deterministic risk data. Convert facts into supportive guidance. Do NOT invent academic data, programs, deadlines, or diagnoses. Do NOT make disciplinary decisions. Output in markdown.",
      userPrompt: "Generate a short supportive intervention suggestion. Context:",
      context,
      intent: "GENERAL",
    });
    return {
      success: true as const,
      data: {
        interventionPlan: result.text,
        riskAnalysis: {
          riskLevel: riskAnalysis.riskLevel,
          riskScore: riskAnalysis.riskScore,
          signals: riskAnalysis.signals,
        },
      },
      message: "Intervention plan generated",
    };
  } catch {
    return {
      success: true as const,
      data: {
        interventionPlan: null,
        riskAnalysis: {
          riskLevel: riskAnalysis.riskLevel,
          riskScore: riskAnalysis.riskScore,
          signals: riskAnalysis.signals,
        },
        fallback: true as const,
      },
      message: "Risk analysis completed (AI unavailable — deterministic engine used)",
    };
  }
}

export async function saveRiskSnapshot(profileId: string, riskData: { riskLevel: RiskLevel; riskScore: number; signals: string[]; trends: RiskTrends }) {
  const rows = await query(
    `INSERT INTO risk_snapshots (
      student_id, risk_level, risk_score,
      attendance_current, attendance_previous, attendance_change,
      assessment_current, assessment_previous, assessment_change,
      assignment_current, assignment_previous, assignment_change,
      signals
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (student_id, calculated_on) DO UPDATE SET
      risk_level = EXCLUDED.risk_level,
      risk_score = EXCLUDED.risk_score,
      attendance_current = EXCLUDED.attendance_current,
      attendance_previous = EXCLUDED.attendance_previous,
      attendance_change = EXCLUDED.attendance_change,
      assessment_current = EXCLUDED.assessment_current,
      assessment_previous = EXCLUDED.assessment_previous,
      assessment_change = EXCLUDED.assessment_change,
      assignment_current = EXCLUDED.assignment_current,
      assignment_previous = EXCLUDED.assignment_previous,
      assignment_change = EXCLUDED.assignment_change,
      signals = EXCLUDED.signals
    RETURNING *`,
    [
      profileId,
      riskData.riskLevel,
      riskData.riskScore,
      riskData.trends.attendance.current,
      riskData.trends.attendance.previous,
      riskData.trends.attendance.change,
      riskData.trends.assessments.current,
      riskData.trends.assessments.previous,
      riskData.trends.assessments.change,
      riskData.trends.assignments.current,
      riskData.trends.assignments.previous,
      riskData.trends.assignments.change,
      JSON.stringify(riskData.signals),
    ],
  );
  return rows[0];
}

export async function createInterventionRecord(
  profileId: string,
  createdByUserId: string,
  riskLevelAtCreation: RiskLevel,
  interventionType: string,
  notes = "",
  followUpDate: string | null = null,
) {
  const rows = await query(
    `INSERT INTO interventions (student_id, created_by, risk_level_at_creation, intervention_type, notes, follow_up_date)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [profileId, createdByUserId, riskLevelAtCreation, interventionType, notes, followUpDate],
  );
  return rows[0];
}

export async function updateInterventionRecord(
  interventionId: string,
  updates: Partial<{ interventionType: string; notes: string; status: string; followUpDate: string | null }>,
) {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (updates.interventionType !== undefined) {
    setClauses.push(`intervention_type = $${i++}`);
    values.push(updates.interventionType);
  }
  if (updates.notes !== undefined) {
    setClauses.push(`notes = $${i++}`);
    values.push(updates.notes);
  }
  if (updates.status !== undefined) {
    setClauses.push(`status = $${i++}`);
    values.push(updates.status);
  }
  if (updates.followUpDate !== undefined) {
    setClauses.push(`follow_up_date = $${i++}`);
    values.push(updates.followUpDate);
  }
  if (setClauses.length === 0) throw ApiError.badRequest("No fields to update", "VALIDATION_ERROR");
  values.push(interventionId);
  const rows = await query(`UPDATE interventions SET ${setClauses.join(", ")} WHERE id = $${i} RETURNING *`, values);
  if (rows.length === 0) throw ApiError.notFound("Intervention not found");
  return rows[0];
}

export async function getStudentInterventionsByProfile(profileId: string) {
  const rows = await query(
    `SELECT i.*, u.name as created_by_name
     FROM interventions i JOIN users u ON u.id = i.created_by
     WHERE i.student_id = $1 ORDER BY i.created_at DESC`,
    [profileId],
  );
  return rows;
}

export async function facultyProfileId(userId: string): Promise<string | null> {
  const row = await queryOne<{ id: string }>("SELECT id FROM faculties WHERE user_id = $1", [userId]);
  return row?.id ?? null;
}

/**
 * Ensures today's snapshot exists for each profile, computing live risk only
 * for those missing. Keeps list/stats endpoints fast after the first load.
 */
export async function ensureRiskSnapshots(profileIds: string[]): Promise<void> {
  if (profileIds.length === 0) return;
  const existing = await query<{ student_id: string }>(
    `SELECT student_id FROM risk_snapshots WHERE student_id = ANY($1::uuid[]) AND calculated_on = CURRENT_DATE`,
    [profileIds],
  );
  const have = new Set(existing.map((r) => r.student_id));
  const missing = profileIds.filter((id) => !have.has(id));
  await Promise.all(
    missing.map(async (pid) => {
      try {
        const analysis = await analyzeStudentRiskByProfileId(pid);
        await saveRiskSnapshot(pid, {
          riskLevel: analysis.data.riskLevel,
          riskScore: analysis.data.riskScore,
          signals: analysis.data.signals,
          trends: analysis.data.trends,
        });
      } catch {
        /* skip students without computable data */
      }
    }),
  );
}
