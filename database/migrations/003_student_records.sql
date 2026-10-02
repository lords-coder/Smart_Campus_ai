-- 003_student_records.sql
-- Operational records: attendance, fees and timetable.

CREATE TABLE IF NOT EXISTS attendance (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  course_id   UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('PRESENT', 'ABSENT', 'LATE', 'LEAVE')),
  recorded_by UUID REFERENCES faculties (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, course_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON attendance (student_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_course_date ON attendance (course_id, date DESC);

CREATE TABLE IF NOT EXISTS fees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  fee_type    TEXT NOT NULL,
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  due_date    DATE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'PENDING'
              CHECK (status IN ('PENDING', 'PARTIAL', 'PAID')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fees_amount_not_negative CHECK (amount_paid <= amount)
);

CREATE INDEX IF NOT EXISTS idx_fees_student ON fees (student_id);
CREATE INDEX IF NOT EXISTS idx_fees_due_date ON fees (due_date);

CREATE TABLE IF NOT EXISTS timetable_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  faculty_id  UUID REFERENCES faculties (id) ON DELETE SET NULL,
  room        TEXT NOT NULL,
  day_of_week TEXT NOT NULL
              CHECK (day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  section     TEXT NOT NULL,
  semester    INT  NOT NULL,
  department  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT timetable_time_order CHECK (end_time > start_time),
  UNIQUE (course_id, day_of_week, start_time, section)
);

CREATE INDEX IF NOT EXISTS idx_timetable_day_section ON timetable_entries (day_of_week, section, semester);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['fees', 'timetable_entries'] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s;
       CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;
