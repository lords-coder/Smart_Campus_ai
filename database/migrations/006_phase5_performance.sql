-- 006_phase5_performance.sql
-- Phase 5: academic performance data for ML prediction.
-- Adds assessments (marks) and assignments tables with proper foreign keys.

CREATE TABLE IF NOT EXISTS assessments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id     UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  course_id      UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  assessment_type TEXT NOT NULL
                 CHECK (assessment_type IN ('QUIZ', 'MIDTERM', 'FINAL', 'PROJECT', 'LAB', 'ASSIGNMENT')),
  marks_obtained NUMERIC(6, 2) NOT NULL CHECK (marks_obtained >= 0),
  max_marks      NUMERIC(6, 2) NOT NULL CHECK (max_marks > 0),
  assessed_on    DATE NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT marks_not_exceed_max CHECK (marks_obtained <= max_marks)
);

CREATE INDEX IF NOT EXISTS idx_assessments_student ON assessments (student_id);
CREATE INDEX IF NOT EXISTS idx_assessments_course ON assessments (course_id);
CREATE INDEX IF NOT EXISTS idx_assessments_student_course ON assessments (student_id, course_id);
CREATE INDEX IF NOT EXISTS idx_assessments_assessed_on ON assessments (assessed_on DESC);

CREATE TABLE IF NOT EXISTS assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  course_id     UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  submitted     BOOLEAN NOT NULL DEFAULT false,
  score         NUMERIC(6, 2) CHECK (score IS NULL OR (score >= 0 AND score <= max_score)),
  max_score     NUMERIC(6, 2) CHECK (max_score IS NULL OR max_score > 0),
  due_date      DATE NOT NULL,
  submitted_on  DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assignments_student ON assignments (student_id);
CREATE INDEX IF NOT EXISTS idx_assignments_course ON assignments (course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_student_course ON assignments (student_id, course_id);
CREATE INDEX IF NOT EXISTS idx_assignments_due_date ON assignments (due_date);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['assessments', 'assignments'] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s;
       CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;