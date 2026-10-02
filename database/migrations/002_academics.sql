-- 002_academics.sql
-- Student/faculty profiles and the academic catalogue.

CREATE TABLE IF NOT EXISTS students (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  student_no   TEXT NOT NULL UNIQUE,
  department   TEXT NOT NULL DEFAULT 'Unassigned',
  semester     INT  NOT NULL DEFAULT 1 CHECK (semester BETWEEN 1 AND 12),
  section      TEXT NOT NULL DEFAULT 'A' CHECK (length(trim(section)) > 0),
  batch_year   INT  NOT NULL DEFAULT EXTRACT(YEAR FROM now())::int,
  admission_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_students_department_semester ON students (department, semester, section);

CREATE TABLE IF NOT EXISTS faculties (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  employee_no TEXT NOT NULL UNIQUE,
  department  TEXT NOT NULL DEFAULT 'Unassigned',
  designation TEXT NOT NULL DEFAULT 'Faculty',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS courses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  credits     INT  NOT NULL CHECK (credits BETWEEN 1 AND 6),
  department  TEXT NOT NULL,
  semester    INT  NOT NULL CHECK (semester BETWEEN 1 AND 12),
  faculty_id  UUID REFERENCES faculties (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_courses_department_semester ON courses (department, semester);

CREATE TABLE IF NOT EXISTS enrollments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  course_id   UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  enrolled_on DATE NOT NULL DEFAULT CURRENT_DATE,
  status      TEXT NOT NULL DEFAULT 'ACTIVE'
              CHECK (status IN ('ACTIVE', 'DROPPED', 'COMPLETED')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_student ON enrollments (student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments (course_id);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['students', 'faculties', 'courses'] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s;
       CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;
