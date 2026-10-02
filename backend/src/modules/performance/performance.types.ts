export interface Assessment {
  id: string;
  student_id: string;
  course_id: string;
  assessment_type: "QUIZ" | "MIDTERM" | "FINAL" | "PROJECT" | "LAB" | "ASSIGNMENT";
  marks_obtained: number;
  max_marks: number;
  assessed_on: string;
}

export interface Assignment {
  id: string;
  student_id: string;
  course_id: string;
  title: string;
  submitted: boolean;
  score: number | null;
  max_score: number;
  due_date: string;
  submitted_on: string | null;
}

export interface StudentPerformanceFeatures {
  student_id: string;
  attendance_percentage: number;
  avg_assessment_percentage: number;
  total_assessments: number;
  assignment_submission_rate: number;
  avg_assignment_score: number;
  academic_score: number;
}

/** How the returned prediction was produced. */
export type PredictionSource = "ML" | "RULE_BASED";

export interface PerformancePrediction {
  category: string;
  confidence: number;
  probabilities: Record<string, number>;
  model_version: string;
  features_used: string[];
  /** "ML" when the Python service scored the model, "RULE_BASED" on degradation. */
  prediction_source: PredictionSource;
  /** Present only for a rule-based prediction. Never a model confidence. */
  fallback_reason?: string;
  /** True only when the numbers came from the trained model. */
  is_model_prediction: boolean;
}

export interface PerformancePredictionRequest {
  features: Record<string, number>;
}

export interface PerformancePredictionResponse {
  category: string;
  confidence: number;
  probabilities: Record<string, number>;
  model_version: string;
  features_used: string[];
  prediction_source: PredictionSource;
  fallback_reason?: string;
  is_model_prediction: boolean;
  /** Model metadata echoed from the ML service. */
  model_trained_at?: string | null;
  predicted_at?: string;
}

export interface LearningResource {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  resource_type: "VIDEO" | "NOTES" | "PRACTICE" | "ARTICLE" | "REMEDIAL";
  topic: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  url: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecommendationMetrics {
  attendancePercentage: number;
  assessmentPercentage: number;
  assignmentSubmissionRate: number;
  totalAssignments: number;
}

export interface Recommendation {
  courseId: string;
  courseName: string;
  category: "COURSE_WEAKNESS" | "ATTENDANCE" | "ASSESSMENT" | "ASSIGNMENT" | "STUDY_ACTION" | "REMEDIAL_SUPPORT";
  priority: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
  metrics: RecommendationMetrics;
  resources: LearningResource[];
  resourceCount: number;
}

export interface RecommendationsSummary {
  highPriority: number;
  mediumPriority: number;
  coursesNeedingAttention: number;
}

export interface RecommendationsResponse {
  summary: RecommendationsSummary;
  recommendations: Recommendation[];
}

export interface StudyPlanResponse {
  studyPlan: string | null;
  recommendations: Array<{
    course: string;
    category: string;
    priority: string;
    reason: string;
  }>;
  fallback?: boolean;
}

export type RiskLevel = "CRITICAL" | "HIGH" | "MODERATE" | "LOW";

export type TrendDirection = "DECLINING" | "STABLE" | "IMPROVING" | "INSUFFICIENT_DATA";

export interface TrendPoint {
  current: number;
  previous: number;
  change: number;
  trend: TrendDirection;
}

export interface RiskTrends {
  attendance: TrendPoint;
  assessments: TrendPoint;
  assignments: TrendPoint;
}

export interface RiskAnalysis {
  studentId: string;
  userId: string;
  riskLevel: RiskLevel;
  riskScore: number;
  signals: string[];
  trends: RiskTrends;
  currentMetrics: {
    attendancePercentage: number;
    avgAssessmentPercentage: number;
    assignmentSubmissionRate: number;
    avgAssignmentScore: number;
    academicScore: number;
  };
}

export type InterventionType =
  | "ACADEMIC_REVIEW"
  | "ATTENDANCE_SUPPORT"
  | "ASSESSMENT_SUPPORT"
  | "ASSIGNMENT_SUPPORT"
  | "REMEDIAL_SUPPORT"
  | "FACULTY_MEETING"
  | "GENERAL_FOLLOW_UP";

export type InterventionStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "DISMISSED";

export interface Intervention {
  id: string;
  student_id: string;
  created_by: string;
  created_by_name?: string;
  risk_level_at_creation: RiskLevel;
  intervention_type: InterventionType;
  notes: string | null;
  status: InterventionStatus;
  follow_up_date: string | null;
  created_at: string;
  updated_at: string;
}