import { query, queryOne } from "../../config/db";
import { ApiError } from "../../utils/ApiError";
import { buildMlFeatureVector } from "./performance.features";
import { requestMlPrediction } from "./performance.ml-client";
import { PerformancePredictionResponse } from "./performance.types";

export interface StudentPerformanceFeatures {
  attendance_percentage: number;
  avg_assessment_percentage: number;
  total_assessments: number;
  assignment_submission_rate: number;
  avg_assignment_score: number;
  academic_score: number;
}

/**
 * Resolves the students.id profile id from a users.id.
 * assessments/assignments/enrollments reference students.id (not users.id).
 */
export async function getStudentProfileId(userId: string): Promise<string> {
  const row = await queryOne<{ id: string }>("SELECT id FROM students WHERE user_id = $1", [userId]);
  if (!row) throw ApiError.notFound("No student profile is linked to this account");
  return row.id;
}

/**
 * Extract performance features for a student from the database.
 * Returns the computed features and the raw data for debugging.
 * NOTE: studentId is users.id (JWT sub); profile id is resolved internally
 * because assessments/assignments reference students.id.
 */
export async function getStudentPerformanceFeatures(studentId: string): Promise<StudentPerformanceFeatures> {
  const profileId = await getStudentProfileId(studentId);
  // Get student's attendance record
  const attendanceRows = await query(`
    SELECT a.course_id,
           c.code,
           c.name,
           COUNT(*) FILTER (WHERE a.status IN ('PRESENT', 'LATE'))::int AS classes_attended,
           COUNT(*)::int AS total_classes,
           COUNT(*) FILTER (WHERE a.status = 'PRESENT')::int AS present,
           COUNT(*) FILTER (WHERE a.status = 'LATE')::int AS late,
           COUNT(*) FILTER (WHERE a.status = 'ABSENT')::int AS absent
    FROM attendance a
    JOIN students s ON s.id = a.student_id
    JOIN courses c ON c.id = a.course_id
    WHERE s.user_id = $1
    GROUP BY a.course_id, c.code, c.name
  `, [studentId]);

  // Calculate overall attendance percentage
  let totalClasses = 0;
  let classesAttended = 0;
  
  if (attendanceRows.length > 0) {
    for (const row of attendanceRows) {
      totalClasses += (row as any).total_classes;
      classesAttended += (row as any).classes_attended;
    }
  }

  const attendance_percentage = totalClasses > 0 ? (classesAttended / totalClasses) * 100 : 0;

  // Get assessments (assessments.student_id references students.id)
  const assessmentRows = await query(`
    SELECT assessment_type, marks_obtained, max_marks
    FROM assessments
    WHERE student_id = $1
  `, [profileId]);

  let totalAssessmentPct = 0;
  let numAssessments = 0;

  if (assessmentRows.length > 0) {
    for (const row of assessmentRows) {
      const pct = (row.marks_obtained / row.max_marks) * 100;
      totalAssessmentPct += pct;
      numAssessments++;
    }
  }

  const avg_assessment_percentage = numAssessments > 0 ? totalAssessmentPct / numAssessments : 0;
  const totalAssessments = numAssessments;

  // Get assignments (assignments.student_id references students.id)
  const assignmentRows = await query(`
    SELECT submitted, score, max_score
    FROM assignments
    WHERE student_id = $1
  `, [profileId]);

  let totalAssignments = 0;
  let assignmentsSubmitted = 0;
  let totalAssignmentScore = 0;

  if (assignmentRows.length > 0) {
    for (const row of assignmentRows) {
      totalAssignments++;
      if (row.submitted) {
        assignmentsSubmitted++;
        if (row.score !== null && row.max_score > 0) {
          totalAssignmentScore += (row.score / row.max_score) * 100;
        }
      }
    }
  }

  const assignment_submission_rate = totalAssignments > 0 ? (assignmentsSubmitted / totalAssignments) * 100 : 0;
  const avg_assignment_score = totalAssignments > 0 ? totalAssignmentScore / totalAssignments : 0;

  // Compute academic score (weighted: attendance 30%, assessments 50%, assignments 20%)
  const academic_score = (
    attendance_percentage * 0.30 +
    avg_assessment_percentage * 0.50 +
    avg_assignment_score * 0.20
  );

  return {
    attendance_percentage: Math.round(attendance_percentage * 100) / 100,
    avg_assessment_percentage: Math.round(avg_assessment_percentage * 100) / 100,
    total_assessments: numAssessments,
    assignment_submission_rate: Math.round(assignment_submission_rate * 100) / 100,
    avg_assignment_score: Math.round(avg_assignment_score * 100) / 100,
    academic_score: Math.round(academic_score * 100) / 100,
  };
}

/**
 * Categorize academic performance into bands.
 * These thresholds match `ml/training/feature_engineering.categorize_performance`
 * and are used only by the degraded (rule-based) path.
 */
export function categorizePerformance(score: number): "EXCELLENT" | "GOOD" | "AVERAGE" | "AT_RISK" {
  if (score >= 85) return "EXCELLENT";
  if (score >= 70) return "GOOD";
  if (score >= 55) return "AVERAGE";
  return "AT_RISK";
}

/**
 * Deterministic band-and-confidence estimate from the aggregate score.
 *
 * This is the degraded path only. It is a threshold calculation, not a model
 * prediction, and every response it produces is tagged `RULE_BASED` with
 * `is_model_prediction: false` so no consumer can mistake it for the trained
 * model.
 */
function ruleBasedPrediction(academicScore: number) {
  const category = categorizePerformance(academicScore);
  const probs: Record<string, number> = {
    EXCELLENT: 0,
    GOOD: 0,
    AVERAGE: 0,
    AT_RISK: 0,
  };

  if (academicScore >= 85) {
    probs.EXCELLENT = 0.8 + 0.2 * (academicScore - 85) / 15;
    probs.GOOD = 1 - probs.EXCELLENT;
  } else if (academicScore >= 70) {
    probs.GOOD = 0.7 + 0.3 * (academicScore - 70) / 15;
    probs.EXCELLENT = 1 - probs.GOOD;
  } else if (academicScore >= 55) {
    probs.AVERAGE = 0.5 + 0.5 * (academicScore - 55) / 15;
    probs.GOOD = 1 - probs.AVERAGE;
  } else {
    probs.AT_RISK = 0.6 + 0.4 * academicScore / 55;
    probs.AVERAGE = 1 - probs.AT_RISK;
  }

  return { category, confidence: Math.max(...Object.values(probs)), probabilities: probs };
}

/**
 * Predicts a student's performance category.
 *
 * Flow: build the model's full 44-feature vector from the student's own records,
 * hand it to the Python ML service, and return the trained model's prediction.
 * If that service is unreachable, times out, or answers with something
 * unusable, fall back to the deterministic threshold estimate above and say so
 * in the response.
 */
export async function predictPerformance(studentId: string): Promise<PerformancePredictionResponse> {
  const vector = await buildMlFeatureVector(studentId);
  const ml = await requestMlPrediction(vector.features);

  if (ml.ok) {
    return {
      category: ml.prediction.category,
      confidence: ml.prediction.confidence,
      probabilities: ml.prediction.probabilities,
      model_version: ml.prediction.model_version,
      features_used: ml.prediction.features_used,
      prediction_source: "ML",
      is_model_prediction: true,
      model_trained_at: ml.prediction.model_trained_at ?? null,
      predicted_at: ml.prediction.predicted_at,
    };
  }

  const rule = ruleBasedPrediction(vector.aggregates.academic_score);
  return {
    category: rule.category,
    confidence: rule.confidence,
    probabilities: rule.probabilities,
    model_version: "rule-based-v1",
    features_used: [
      "attendance_percentage",
      "avg_assessment_percentage",
      "total_assessments",
      "assignment_submission_rate",
      "avg_assignment_score",
    ],
    prediction_source: "RULE_BASED",
    fallback_reason: ml.reason,
    is_model_prediction: false,
  };
}