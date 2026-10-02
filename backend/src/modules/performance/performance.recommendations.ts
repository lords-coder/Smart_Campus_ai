import { query } from "../../config/db";
import { getStudentPerformanceFeatures, getStudentProfileId, categorizePerformance } from "./performance.service";
import { sendSuccess } from "../../utils/response";
import { AiProvider, createProvider } from "../../modules/ai/ai.provider";
import { AiIntent } from "../../modules/ai/ai.types";
import type { LearningResource } from "./performance.types";

export const THRESHOLDS = {
  ATTENDANCE_WARNING: 70,
  ASSESSMENT_WARNING: 60,
  ASSIGNMENT_WARNING: 65,
};

export const RESOURCE_TYPES = {
  VIDEO: "VIDEO",
  NOTES: "NOTES",
  PRACTICE: "PRACTICE",
  ARTICLE: "ARTICLE",
  REMEDIAL: "REMEDIAL",
};

interface Weakness {
  type: "ATTENDANCE" | "ASSESSMENT" | "ASSIGNMENT";
  value: number;
  threshold: number;
}

interface RecommendationInternal {
  courseId: string;
  courseName: string;
  category: "COURSE_WEAKNESS" | "ATTENDANCE" | "ASSESSMENT" | "ASSIGNMENT" | "STUDY_ACTION" | "REMEDIAL_SUPPORT";
  priority: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
  metrics: {
    attendancePercentage: number;
    assessmentPercentage: number;
    assignmentSubmissionRate: number;
    totalAssignments: number;
  };
  resources: LearningResource[];
  resourceCount: number;
}

/**
 * Generates personalized recommendations for a student.
 * Deterministic: uses only database-grounded data, never invents facts.
 * The optional AI explanation layer (Phase 4 provider) may decorate but
 * does not determine any academic fact, priority, or resource.
 */
export async function generateRecommendations(studentId: string) {
  // studentId is users.id (JWT sub); enrollments/assessments/assignments/attendance
  // reference students.id, so resolve the profile first.
  const profileId = await getStudentProfileId(studentId);

  // 1. Get performance features from existing Phase 5 service
  const features = await getStudentPerformanceFeatures(studentId);

  // 2. Get enrolled courses for this student
  const enrollmentRows = await query(`
    SELECT e.course_id, c.code, c.name
    FROM enrollments e
    JOIN courses c ON c.id = e.course_id
    WHERE e.student_id = $1 AND e.status = 'ACTIVE'
  `, [profileId]);

  // 3. Get per-course performance details from assessments and assignments
  const assessmentRows = await query(`
    SELECT a.course_id,
           AVG((a.marks_obtained / a.max_marks) * 100) AS avg_pct
    FROM assessments a
    WHERE a.student_id = $1
    GROUP BY a.course_id
  `, [profileId]);

  const assignmentRows = await query(`
    SELECT asg.course_id,
           AVG((CASE WHEN asg.score IS NOT NULL AND asg.max_score > 0
                     THEN (asg.score / asg.max_score) * 100 ELSE 0 END)) AS avg_submission_pct,
           COUNT(asg.id) AS total_assignments,
           SUM(CASE WHEN asg.submitted THEN 1 ELSE 0 END) AS submitted_count
    FROM assignments asg
    WHERE asg.student_id = $1
    GROUP BY asg.course_id
  `, [profileId]);

  // 4. Get attendance per course
  const attendanceRows = await query(`
    SELECT a.course_id,
           COUNT(*) FILTER (WHERE a.status IN ('PRESENT', 'LATE'))::int AS classes_attended,
           COUNT(*)::int AS total_classes
    FROM attendance a
    WHERE a.student_id = $1
    GROUP BY a.course_id
  `, [profileId]);

  // 5. Build per-course metric map
  const courseMetrics = new Map<string, {
    avgAssessmentPct: number,
    avgAssignmentPct: number,
    totalAssignments: number,
    submittedCount: number,
    classesAttended: number,
    totalClasses: number,
    attendancePct: number,
  }>();

  // Initialize from assessment averages
  for (const row of assessmentRows) {
    courseMetrics.set(row.course_id, {
      avgAssessmentPct: Number(row.avg_pct || 0),
      avgAssignmentPct: 0,
      totalAssignments: 0,
      submittedCount: 0,
      classesAttended: 0,
      totalClasses: 0,
      attendancePct: 0,
    });
  }

  // Initialize from assignment averages
  for (const row of assignmentRows) {
    const existing = courseMetrics.get(row.course_id) || {
      avgAssessmentPct: 0, avgAssignmentPct: 0, totalAssignments: 0, submittedCount: 0,
      classesAttended: 0, totalClasses: 0, attendancePct: 0,
    };
    courseMetrics.set(row.course_id, {
      avgAssessmentPct: existing.avgAssessmentPct,
      avgAssignmentPct: Number(row.avg_submission_pct || 0),
      totalAssignments: Number(row.total_assignments || 0),
      submittedCount: Number(row.submitted_count || 0),
      classesAttended: existing.classesAttended || 0,
      totalClasses: existing.totalClasses || 0,
      attendancePct: 0,
    });
  }

  // Add attendance per course
  for (const row of attendanceRows) {
    const attendancePct = row.total_classes > 0
      ? (Number(row.classes_attended) / Number(row.total_classes)) * 100
      : 0;
    const existing = courseMetrics.get(row.course_id) || {
      avgAssessmentPct: 0, avgAssignmentPct: 0, totalAssignments: 0, submittedCount: 0,
      classesAttended: 0, totalClasses: 0, attendancePct: 0,
    };
    courseMetrics.set(row.course_id, {
      avgAssessmentPct: existing.avgAssessmentPct,
      avgAssignmentPct: existing.avgAssignmentPct,
      totalAssignments: existing.totalAssignments,
      submittedCount: existing.submittedCount,
      classesAttended: Number(row.classes_attended),
      totalClasses: Number(row.total_classes),
      attendancePct,
    });
  }

  // 6. Generate recommendations per course
  const recommendations: RecommendationInternal[] = [];

  for (const enrollment of enrollmentRows) {
    const courseId = enrollment.course_id;
    const courseName = enrollment.name;
    const code = enrollment.code;
    const metrics = courseMetrics.get(courseId) || {
      avgAssessmentPct: 0, avgAssignmentPct: 0, totalAssignments: 0, submittedCount: 0,
      classesAttended: 0, totalClasses: 0, attendancePct: 0,
    };

    // --- COURSE_WEAKNESS ---
    const assessmentPct = metrics.avgAssessmentPct;
    const assignmentPct = metrics.avgAssignmentPct;
    const attendancePct = metrics.attendancePct;

    // Determine if course is weak (any metric below threshold)
    const weaknesses: Weakness[] = [];

    if (attendancePct < THRESHOLDS.ATTENDANCE_WARNING) {
      weaknesses.push({
        type: "ATTENDANCE",
        value: Math.round(attendancePct),
        threshold: THRESHOLDS.ATTENDANCE_WARNING,
      });
    }

    if (assessmentPct < THRESHOLDS.ASSESSMENT_WARNING) {
      weaknesses.push({
        type: "ASSESSMENT",
        value: Math.round(assessmentPct),
        threshold: THRESHOLDS.ASSESSMENT_WARNING,
      });
    }

    if (assignmentPct < THRESHOLDS.ASSIGNMENT_WARNING) {
      weaknesses.push({
        type: "ASSIGNMENT",
        value: Math.round(assignmentPct),
        threshold: THRESHOLDS.ASSIGNMENT_WARNING,
      });
    }

    let priority: "HIGH" | "MEDIUM" | "LOW" = "LOW";

    if (weaknesses.length > 0) {
      // Determine priority based on number and severity of weaknesses

      const severeCount = weaknesses.filter((w: Weakness) => {
        // Severe if more than 15 points below threshold
        return (THRESHOLDS.ATTENDANCE_WARNING - w.value) > 15 ||
               (THRESHOLDS.ASSESSMENT_WARNING - w.value) > 15 ||
               (THRESHOLDS.ASSIGNMENT_WARNING - w.value) > 15;
      }).length;

      const moderateCount = weaknesses.filter((w: Weakness) => {
        // Moderate if 8-15 points below threshold
        return (THRESHOLDS.ATTENDANCE_WARNING - w.value) >= 8 &&
               (THRESHOLDS.ATTENDANCE_WARNING - w.value) <= 15 ||
               (THRESHOLDS.ASSESSMENT_WARNING - w.value) >= 8 &&
               (THRESHOLDS.ASSESSMENT_WARNING - w.value) <= 15 ||
               (THRESHOLDS.ASSIGNMENT_WARNING - w.value) >= 8 &&
               (THRESHOLDS.ASSIGNMENT_WARNING - w.value) <= 15;
      }).length;

      if (weaknesses.length >= 3 || severeCount >= 1) {
        priority = "HIGH";
      } else if (moderateCount >= 1 || weaknesses.length >= 2) {
        priority = "MEDIUM";
      } else {
        priority = "LOW";
      }

      // Determine primary category (the weakest metric)
      let primaryCategory: "COURSE_WEAKNESS" | "ATTENDANCE" | "ASSESSMENT" | "ASSIGNMENT" | "STUDY_ACTION" | "REMEDIAL_SUPPORT" = "COURSE_WEAKNESS";
      if (weaknesses.some((w: Weakness) => w.type === "ATTENDANCE")) {
        primaryCategory = "ATTENDANCE";
      } else if (weaknesses.some((w: Weakness) => w.type === "ASSESSMENT")) {
        primaryCategory = "ASSESSMENT";
      } else if (weaknesses.some((w: Weakness) => w.type === "ASSIGNMENT")) {
        primaryCategory = "ASSIGNMENT";
      }

      // Build factual reason
      const reasonParts: string[] = [];
      if (weaknesses.some((w: Weakness) => w.type === "ATTENDANCE")) {
        reasonParts.push(`Your attendance in ${code} is ${Math.round(attendancePct)}%, below the warning threshold of ${THRESHOLDS.ATTENDANCE_WARNING}%`);
      }
      if (weaknesses.some((w: Weakness) => w.type === "ASSESSMENT")) {
        reasonParts.push(`Your assessment average in ${code} is ${Math.round(assessmentPct)}%, below the warning threshold of ${THRESHOLDS.ASSESSMENT_WARNING}%`);
      }
      if (weaknesses.some((w: Weakness) => w.type === "ASSIGNMENT")) {
        reasonParts.push(`Your assignment submission and score rate in ${code} is ${Math.round(assignmentPct)}%, below the warning threshold of ${THRESHOLDS.ASSIGNMENT_WARNING}%`);
      }

      const reason = reasonParts.length > 0
        ? reasonParts.join(". ")
        : `Your academic performance in ${code} needs attention`;

      recommendations.push({
        courseId,
        courseName,
        category: primaryCategory,
        priority,
        reason,
        metrics: {
          attendancePercentage: Math.round(attendancePct),
          assessmentPercentage: Math.round(assessmentPct),
          assignmentSubmissionRate: Math.round(metrics.avgAssignmentPct),
          totalAssignments: metrics.totalAssignments,
        },
        resources: [],
        resourceCount: 0, // will be filled after resource matching
      });
    }

    // --- STUDY_ACTION (if course has any weakness but not severe) ---
    if (weaknesses.length > 0 && priority !== "HIGH") {
      recommendations.push({
        courseId,
        courseName,
        category: "STUDY_ACTION",
        priority: "LOW",
        reason: `Focused study plan recommended for ${code} based on academic performance review`,
        metrics: {
          attendancePercentage: Math.round(attendancePct),
          assessmentPercentage: Math.round(assessmentPct),
          assignmentSubmissionRate: Math.round(metrics.avgAssignmentPct),
          totalAssignments: metrics.totalAssignments,
        },
        resources: [],
        resourceCount: 0,
      });
    }
  }

  // 7. Sort recommendations: HIGH first, then MEDIUM, then LOW
  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  recommendations.sort((a: RecommendationInternal, b: RecommendationInternal) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // 8. Match resources to each recommendation
  for (const rec of recommendations) {
    const resources = await matchResources(rec.courseId, rec.category, rec.priority);
    rec.resources = resources;
    rec.resourceCount = resources.length;
  }

  // 9. Build summary
  const highPriority = recommendations.filter((r: RecommendationInternal) => r.priority === "HIGH").length;
  const mediumPriority = recommendations.filter((r: RecommendationInternal) => r.priority === "MEDIUM").length;
  const coursesNeedingAttention = recommendations.length;

  return {
    success: true,
    data: {
      summary: {
        highPriority,
        mediumPriority,
        coursesNeedingAttention,
      },
      recommendations,
    },
    message: "Recommendations generated",
  };
}

/**
 * Matches resources to a course and recommendation category.
 * Deterministic: selects resources by course_id, topic relevance, and difficulty.
 */
async function matchResources(courseId: string, category: string, priority: string): Promise<LearningResource[]> {
  let queryCondition = "course_id = $1 AND active = true";

  // Determine topic and difficulty based on category
  let topicFilter = "";
  let difficultyFilter = "";

  if (category === "ATTENDANCE") {
    topicFilter = "AND topic ILIKE '%attendance%'";
    difficultyFilter = "AND difficulty != 'advanced'";
  } else if (category === "ASSESSMENT") {
    topicFilter = "AND topic ILIKE '%assessment%'";
    difficultyFilter = "AND difficulty != 'beginner'";
  } else if (category === "ASSIGNMENT") {
    topicFilter = "AND topic ILIKE '%assignment%'";
    difficultyFilter = "AND difficulty != 'beginner'";
  } else if (category === "COURSE_WEAKNESS") {
    // General resources for the course
    difficultyFilter = "AND difficulty != 'advanced'";
  } else if (category === "STUDY_ACTION") {
    topicFilter = "AND topic ILIKE '%study%'";
    difficultyFilter = "AND difficulty IN ('beginner', 'intermediate')";
  } else if (category === "REMEDIAL_SUPPORT") {
    topicFilter = "AND topic ILIKE '%remedial%'";
    difficultyFilter = "AND difficulty = 'beginner'";
  }

  // Priority-based limiting
  let limitClause = "";
  if (priority === "HIGH") {
    limitClause = "LIMIT 3";
  } else if (priority === "MEDIUM") {
    limitClause = "LIMIT 2";
  } else {
    limitClause = "LIMIT 1";
  }

  const rows = await query(`
    SELECT id, title, description, resource_type, topic, difficulty, url
    FROM learning_resources
    WHERE ${queryCondition}
      ${topicFilter}
      ${difficultyFilter}
    ${limitClause}
  `, [courseId]);

  // Fallback: if no resources matched with filters, try without topic/difficulty filters
  if (rows.length === 0) {
    const fallbackQuery = `
      SELECT id, title, description, resource_type, topic, difficulty, url
      FROM learning_resources
      WHERE course_id = $1 AND active = true
      ${limitClause}
    `;
    const fallback = await query(fallbackQuery, [courseId]);
    if (fallback.length > 0) {
      return fallback as LearningResource[];
    }
  }

  return rows as LearningResource[];
}

/**
 * Optional AI explanation layer.
 * Reuses Phase 4's AI provider abstraction to turn deterministic
 * recommendations into natural language study guidance.
 * The AI must NOT invent marks, attendance, resources, courses, or deadlines.
 */
export async function generateAiStudyPlan(studentId: string) {
  const recommendations = (await generateRecommendations(studentId)).data.recommendations;

  if (recommendations.length === 0) {
    return {
      success: true,
      data: {
        studyPlan: "No recommendations available — your academic performance is strong across all courses.",
        recommendations: [],
      },
      message: "No study plan needed",
    };
  }

  // Prepare context for AI: only verified facts from the recommendation engine
  const context = {
    scopeNote: "SmartCampus deterministic recommendation engine output — academic facts only",
    recommendations: recommendations.map((rec) => ({
      course: rec.courseName,
      courseCode: rec.courseId,
      category: rec.category,
      priority: rec.priority,
      reason: rec.reason,
      metrics: rec.metrics,
      resources: rec.resources.map((r) => ({
        title: r.title,
        type: r.resource_type,
        topic: r.topic,
      })),
    })),
  };

  try {
    const provider = createProvider();
    const result = await provider.generate({
      systemPrompt: "You are SmartCampus AI. Generate a concise, supportive study plan for the student based on the provided deterministic recommendation data. Convert the facts into natural language guidance. Do NOT invent any academic data (marks, attendance, courses, deadlines, resources). Do NOT generate policy or disciplinary content. Output in markdown.",
      userPrompt: "Generate a short study plan for the student. Context:",
      context,
      intent: "GENERAL",
    });

    return {
      success: true,
      data: {
        studyPlan: result.text,
        recommendations: recommendations.map((rec) => ({
          course: rec.courseName,
          category: rec.category,
          priority: rec.priority,
          reason: rec.reason,
        })),
      },
      message: "Study plan generated",
    };
  } catch (error) {
    // If AI provider fails, return deterministic recommendations without AI explanation
    return {
      success: true,
      data: {
        studyPlan: null,
        recommendations: recommendations.map((rec) => ({
          course: rec.courseName,
          category: rec.category,
          priority: rec.priority,
          reason: rec.reason,
        })),
        fallback: true,
      },
      message: "Recommendations generated (AI unavailable — deterministic engine used)",
    };
  }
}