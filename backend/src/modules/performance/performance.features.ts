import { query } from "../../config/db";

/**
 * Authoritative ML feature contract.
 *
 * These names and this order are dictated by the trained artifact in
 * `ml/models/performance_model.joblib` (mirrored in
 * `performance_model_metadata.json`). They must match the training-time
 * pipeline exactly: the scaler and classifier were fitted on this column set
 * in this order, so a renamed, reordered or missing column silently corrupts
 * every prediction.
 *
 * The list is derived from `ml/training/feature_engineering.py`:
 *   8 aggregate features, then
 *   per-course attendance, per-course assessments, per-course assignment
 *   submission rate + score, then per-assessment-type average and count.
 *
 * `docs/ML_ARCHITECTURE.md` holds the full source mapping, and
 * `backend/tests/feature-parity.mjs` asserts this list still equals the
 * feature names recorded in the model metadata.
 */
export const ML_FEATURE_NAMES = [
  // --- aggregate features (8) ---
  "attendance_percentage",
  "total_classes",
  "avg_assessment_percentage",
  "total_assessments",
  "assignment_submission_rate",
  "total_assignments",
  "avg_assignment_score",
  "academic_score",
  // --- per-course attendance (6) ---
  "attendance_CS301",
  "attendance_CS305",
  "attendance_CS311",
  "attendance_CS315",
  "attendance_CS321",
  "attendance_MA201",
  // --- per-course assessment average (6) ---
  "assessment_CS301",
  "assessment_CS305",
  "assessment_CS311",
  "assessment_CS315",
  "assessment_CS321",
  "assessment_MA201",
  // --- per-course assignment submission rate + score (12) ---
  "assign_sub_CS301",
  "assign_score_CS301",
  "assign_sub_CS305",
  "assign_score_CS305",
  "assign_sub_CS311",
  "assign_score_CS311",
  "assign_sub_CS315",
  "assign_score_CS315",
  "assign_sub_CS321",
  "assign_score_CS321",
  "assign_sub_MA201",
  "assign_score_MA201",
  // --- per-assessment-type average and count (12) ---
  "assess_QUIZ_avg",
  "assess_QUIZ_count",
  "assess_MIDTERM_avg",
  "assess_MIDTERM_count",
  "assess_FINAL_avg",
  "assess_FINAL_count",
  "assess_PROJECT_avg",
  "assess_PROJECT_count",
  "assess_LAB_avg",
  "assess_LAB_count",
  "assess_ASSIGNMENT_avg",
  "assess_ASSIGNMENT_count",
] as const;

export type MlFeatureName = (typeof ML_FEATURE_NAMES)[number];

/** Number of features the trained pipeline expects. */
export const ML_FEATURE_COUNT = ML_FEATURE_NAMES.length;

/**
 * Weighting used by the training-time `compute_academic_score`. The model
 * carries `academic_score` as an input feature, so the backend must reproduce
 * it rather than substituting its own composite.
 */
const ACADEMIC_SCORE_WEIGHTS = {
  attendance: 0.3,
  assessment: 0.5,
  assignment: 0.2,
} as const;

/** Training-time score column is out of 10; this is the multiplier to percent. */
const ASSIGNMENT_SCORE_SCALE = 10;

export interface MlFeatureVector {
  /** Feature values keyed by contract name — the payload sent to the ML service. */
  features: Record<string, number>;
  /** Same values in contract order, for logging and drift checks. */
  ordered: number[];
  /** The aggregates, reused by the `/api/performance` feature view. */
  aggregates: {
    attendance_percentage: number;
    total_classes: number;
    avg_assessment_percentage: number;
    total_assessments: number;
    assignment_submission_rate: number;
    total_assignments: number;
    /** Out of 10, matching the training-time definition. */
    avg_assignment_score: number;
    academic_score: number;
  };
}

function finite(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

/**
 * Reproduces `ml/training/feature_engineering.compute_academic_score`.
 * `avgAssignmentScore` arrives on the training scale (0-10).
 */
export function computeAcademicScore(input: {
  attendancePercentage: number;
  avgAssessmentPercentage: number;
  assignmentSubmissionRate: number;
  avgAssignmentScore: number;
}): number {
  const assignmentPct = input.avgAssignmentScore * ASSIGNMENT_SCORE_SCALE;
  const assignmentComponent = (input.assignmentSubmissionRate / 100) * assignmentPct;
  const score =
    input.attendancePercentage * ACADEMIC_SCORE_WEIGHTS.attendance +
    input.avgAssessmentPercentage * ACADEMIC_SCORE_WEIGHTS.assessment +
    assignmentComponent * ACADEMIC_SCORE_WEIGHTS.assignment;
  return Math.min(100, Math.max(0, score));
}

interface AttendanceAggregateRow {
  code: string;
  total: number;
  attended: number;
}

/**
 * Builds the full model feature vector for one student.
 *
 * `userId` is the JWT subject (`users.id`); the `students.id` profile id used
 * by attendance/assessments/assignments is resolved internally.
 *
 * Semantics mirror `ml/training/feature_engineering.extract_features`:
 *   - attendance counts PRESENT and LATE as attended, but every attendance
 *     row (including ABSENT and LEAVE) counts toward the denominator;
 *   - averages ignore NULL scores, exactly as pandas `.mean()` does;
 *   - a course/type with no rows yields 0.0 rather than being omitted;
 *   - the whole record history is used, with no date window.
 *
 * Three aggregate queries total, independent of how many courses exist, so
 * there is no N+1 behaviour as the catalogue grows.
 */
export async function buildMlFeatureVector(userId: string): Promise<MlFeatureVector> {
  const profileRow = await query<{ id: string }>("SELECT id FROM students WHERE user_id = $1", [userId]);
  const profileId = profileRow[0]?.id;
  if (!profileId) {
    throw new Error("No student profile is linked to this account");
  }

  const [attendanceRows, assessmentRows, assignmentRows] = await Promise.all([
    query<AttendanceAggregateRow>(
      `SELECT c.code,
              COUNT(a.id)::int AS total,
              COUNT(a.id) FILTER (WHERE a.status IN ('PRESENT', 'LATE'))::int AS attended
         FROM courses c
         LEFT JOIN attendance a
           ON a.course_id = c.id AND a.student_id = $1
        GROUP BY c.code`,
      [profileId],
    ),
    query<{ group: string; key: string; n: number; avg_pct: number | null }>(
      `SELECT 'OVERALL'::text AS group, ''::text AS key,
              COUNT(*)::int AS n,
              AVG(a.marks_obtained::numeric / NULLIF(a.max_marks, 0) * 100) AS avg_pct
         FROM assessments a
        WHERE a.student_id = $1
       UNION ALL
       SELECT 'COURSE', c.code,
              COUNT(*)::int,
              AVG(a.marks_obtained::numeric / NULLIF(a.max_marks, 0) * 100)
         FROM assessments a
         JOIN courses c ON c.id = a.course_id
        WHERE a.student_id = $1
        GROUP BY c.code
       UNION ALL
       SELECT 'TYPE', a.assessment_type,
              COUNT(*)::int,
              AVG(a.marks_obtained::numeric / NULLIF(a.max_marks, 0) * 100)
         FROM assessments a
        WHERE a.student_id = $1
        GROUP BY a.assessment_type`,
      [profileId],
    ),
    query<{ group: string; key: string; n: number; submitted: number; avg_score: number | null }>(
      `SELECT 'OVERALL'::text AS group, ''::text AS key,
              COUNT(*)::int AS n,
              COUNT(*) FILTER (WHERE submitted)::int AS submitted,
              AVG(score) FILTER (WHERE submitted) AS avg_score
         FROM assignments
        WHERE student_id = $1
       UNION ALL
       SELECT 'COURSE', c.code,
              COUNT(*)::int,
              COUNT(*) FILTER (WHERE a.submitted)::int,
              AVG(a.score) FILTER (WHERE a.submitted)
         FROM assignments a
         JOIN courses c ON c.id = a.course_id
        WHERE a.student_id = $1
        GROUP BY c.code`,
      [profileId],
    ),
  ]);

  // --- attendance ---
  const attendanceByCourse = new Map<string, number>();
  let totalClasses = 0;
  let classesAttended = 0;
  for (const row of attendanceRows) {
    attendanceByCourse.set(row.code, ratio(row.attended, row.total));
    totalClasses += row.total;
    classesAttended += row.attended;
  }
  const attendancePercentage = ratio(classesAttended, totalClasses);

  // --- assessments ---
  const assessmentByCourse = new Map<string, number>();
  const assessAvgByType = new Map<string, number>();
  const assessCountByType = new Map<string, number>();
  let totalAssessments = 0;
  let avgAssessmentPercentage = 0;
  for (const row of assessmentRows) {
    if (row.group === "OVERALL") {
      totalAssessments = row.n;
      avgAssessmentPercentage = finite(row.avg_pct);
    } else if (row.group === "COURSE") {
      assessmentByCourse.set(row.key, finite(row.avg_pct));
    } else if (row.group === "TYPE") {
      assessAvgByType.set(row.key, finite(row.avg_pct));
      assessCountByType.set(row.key, row.n);
    }
  }

  // --- assignments ---
  const assignSubByCourse = new Map<string, number>();
  const assignScoreByCourse = new Map<string, number>();
  let totalAssignments = 0;
  let assignmentsSubmitted = 0;
  let avgAssignmentScore = 0;
  for (const row of assignmentRows) {
    if (row.group === "OVERALL") {
      totalAssignments = row.n;
      assignmentsSubmitted = row.submitted;
      avgAssignmentScore = finite(row.avg_score);
    } else if (row.group === "COURSE") {
      assignSubByCourse.set(row.key, ratio(row.submitted, row.n));
      assignScoreByCourse.set(row.key, finite(row.avg_score));
    }
  }
  const assignmentSubmissionRate = ratio(assignmentsSubmitted, totalAssignments);

  const academicScore = computeAcademicScore({
    attendancePercentage,
    avgAssessmentPercentage,
    assignmentSubmissionRate,
    avgAssignmentScore,
  });

  const aggregates = {
    attendance_percentage: attendancePercentage,
    total_classes: totalClasses,
    avg_assessment_percentage: avgAssessmentPercentage,
    total_assessments: totalAssessments,
    assignment_submission_rate: assignmentSubmissionRate,
    total_assignments: totalAssignments,
    avg_assignment_score: avgAssignmentScore,
    academic_score: academicScore,
  };

  // Resolve each contract name from the aggregates computed above. Any feature
  // the builder does not recognise resolves to 0.0 rather than being dropped,
  // so the payload always has exactly ML_FEATURE_COUNT entries.
  const features: Record<string, number> = {};
  for (const name of ML_FEATURE_NAMES) {
    features[name] = resolveFeature(name, {
      aggregates,
      attendanceByCourse,
      assessmentByCourse,
      assignSubByCourse,
      assignScoreByCourse,
      assessAvgByType,
      assessCountByType,
    });
  }

  return {
    features,
    ordered: ML_FEATURE_NAMES.map((name) => features[name]),
    aggregates,
  };
}

interface ResolveInput {
  aggregates: MlFeatureVector["aggregates"];
  attendanceByCourse: Map<string, number>;
  assessmentByCourse: Map<string, number>;
  assignSubByCourse: Map<string, number>;
  assignScoreByCourse: Map<string, number>;
  assessAvgByType: Map<string, number>;
  assessCountByType: Map<string, number>;
}

/** Maps one contract feature name onto its computed value. */
function resolveFeature(name: string, input: ResolveInput): number {
  const base = input.aggregates as unknown as Record<string, number>;
  if (Object.prototype.hasOwnProperty.call(base, name)) return finite(base[name]);

  if (name.startsWith("attendance_")) {
    return finite(input.attendanceByCourse.get(name.slice("attendance_".length)));
  }
  if (name.startsWith("assessment_")) {
    return finite(input.assessmentByCourse.get(name.slice("assessment_".length)));
  }
  if (name.startsWith("assign_sub_")) {
    return finite(input.assignSubByCourse.get(name.slice("assign_sub_".length)));
  }
  if (name.startsWith("assign_score_")) {
    return finite(input.assignScoreByCourse.get(name.slice("assign_score_".length)));
  }
  if (name.startsWith("assess_")) {
    const rest = name.slice("assess_".length);
    const separator = rest.lastIndexOf("_");
    if (separator > 0) {
      const type = rest.slice(0, separator);
      const stat = rest.slice(separator + 1);
      if (stat === "avg") return finite(input.assessAvgByType.get(type));
      if (stat === "count") return finite(input.assessCountByType.get(type));
    }
  }
  return 0;
}
