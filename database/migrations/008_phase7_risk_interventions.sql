-- 008_phase7_risk_interventions.sql
-- Phase 7: Dropout risk analysis and intervention tracking.

CREATE TABLE IF NOT EXISTS risk_snapshots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  calculated_on         DATE NOT NULL DEFAULT CURRENT_DATE,
  risk_level            TEXT NOT NULL
                            CHECK (risk_level IN ('CRITICAL', 'HIGH', 'MODERATE', 'LOW')),
  risk_score            INT NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  attendance_current    NUMERIC(5,2),
  attendance_previous   NUMERIC(5,2),
  attendance_change     NUMERIC(5,2),
  assessment_current    NUMERIC(5,2),
  assessment_previous   NUMERIC(5,2),
  assessment_change     NUMERIC(5,2),
  assignment_current    NUMERIC(5,2),
  assignment_previous   NUMERIC(5,2),
  assignment_change     NUMERIC(5,2),
  signals               JSONB NOT NULL DEFAULT '[]',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, calculated_on)
);

CREATE INDEX IF NOT EXISTS idx_risk_snapshots_student ON risk_snapshots (student_id);
CREATE INDEX IF NOT EXISTS idx_risk_snapshots_calculated ON risk_snapshots (calculated_on DESC);
CREATE INDEX IF NOT EXISTS idx_risk_snapshots_level ON risk_snapshots (risk_level);

CREATE TABLE IF NOT EXISTS interventions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id             UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  created_by             UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  risk_level_at_creation TEXT NOT NULL
                            CHECK (risk_level_at_creation IN ('CRITICAL', 'HIGH', 'MODERATE', 'LOW')),
  intervention_type      TEXT NOT NULL
                            CHECK (intervention_type IN (
                              'ACADEMIC_REVIEW',
                              'ATTENDANCE_SUPPORT',
                              'ASSESSMENT_SUPPORT',
                              'ASSIGNMENT_SUPPORT',
                              'REMEDIAL_SUPPORT',
                              'FACULTY_MEETING',
                              'GENERAL_FOLLOW_UP'
                            )),
  notes                  TEXT,
  status                 TEXT NOT NULL DEFAULT 'OPEN'
                            CHECK (status IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'DISMISSED')),
  follow_up_date         DATE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interventions_student ON interventions (student_id);
CREATE INDEX IF NOT EXISTS idx_interventions_created_by ON interventions (created_by);
CREATE INDEX IF NOT EXISTS idx_interventions_status ON interventions (status);
CREATE INDEX IF NOT EXISTS idx_interventions_follow_up ON interventions (follow_up_date);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['risk_snapshots', 'interventions'] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s;
       CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;