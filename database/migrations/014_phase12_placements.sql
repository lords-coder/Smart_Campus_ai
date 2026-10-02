-- 014_phase12_placements.sql
-- Phase 12: placement cell — companies, drives, applications, interviews, offers.
-- Eligibility derives from live academic data (no separate academic store).

CREATE TABLE IF NOT EXISTS companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL CHECK (length(trim(name)) >= 2),
  industry      TEXT NOT NULL DEFAULT '',
  company_type  TEXT NOT NULL DEFAULT 'OTHER'
                CHECK (company_type IN ('PRODUCT', 'SERVICE', 'STARTUP', 'CONSULTING', 'GOVERNMENT', 'NON_PROFIT', 'OTHER')),
  website       TEXT NOT NULL DEFAULT '',
  location      TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  contact_name  TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_companies_name ON companies (lower(name));
CREATE INDEX IF NOT EXISTS idx_companies_active ON companies (active);

CREATE TABLE IF NOT EXISTS placement_drives (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  title                TEXT NOT NULL CHECK (length(trim(title)) >= 2),
  job_role             TEXT NOT NULL CHECK (length(trim(job_role)) >= 2),
  description          TEXT NOT NULL DEFAULT '',
  package_min          NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (package_min >= 0),
  package_max          NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (package_max >= 0),
  currency             TEXT NOT NULL DEFAULT 'INR',
  employment_type      TEXT NOT NULL DEFAULT 'FULL_TIME'
                       CHECK (employment_type IN ('FULL_TIME', 'PART_TIME', 'INTERNSHIP', 'CONTRACT')),
  work_mode            TEXT NOT NULL DEFAULT 'ONSITE'
                       CHECK (work_mode IN ('ONSITE', 'REMOTE', 'HYBRID')),
  location             TEXT NOT NULL DEFAULT '',
  openings             INT NOT NULL DEFAULT 1 CHECK (openings >= 1),
  application_deadline DATE NOT NULL,
  drive_date           DATE,
  min_cgpa             NUMERIC(3, 2),
  max_backlogs         INT CHECK (max_backlogs IS NULL OR max_backlogs >= 0),
  min_attendance       NUMERIC(5, 2),
  eligible_departments TEXT[] NOT NULL DEFAULT '{}',
  eligible_semesters   INT[] NOT NULL DEFAULT '{}',
  graduation_year      INT,
  status               TEXT NOT NULL DEFAULT 'DRAFT'
                       CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED', 'CANCELLED', 'COMPLETED')),
  created_by           UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT drive_package_order CHECK (package_max >= package_min)
);

CREATE INDEX IF NOT EXISTS idx_drives_company ON placement_drives (company_id);
CREATE INDEX IF NOT EXISTS idx_drives_status ON placement_drives (status);
CREATE INDEX IF NOT EXISTS idx_drives_deadline ON placement_drives (application_deadline);

CREATE TABLE IF NOT EXISTS placement_applications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id     UUID NOT NULL REFERENCES placement_drives (id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'APPLIED'
               CHECK (status IN ('APPLIED', 'SHORTLISTED', 'INTERVIEW', 'SELECTED', 'WAITLISTED', 'REJECTED', 'WITHDRAWN')),
  applied_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One live application per student per drive (withdrawn ones may re-apply).
CREATE UNIQUE INDEX IF NOT EXISTS uq_placement_apps_live
  ON placement_applications (drive_id, student_id) WHERE status <> 'WITHDRAWN';
CREATE INDEX IF NOT EXISTS idx_placement_apps_drive ON placement_applications (drive_id);
CREATE INDEX IF NOT EXISTS idx_placement_apps_student ON placement_applications (student_id);
CREATE INDEX IF NOT EXISTS idx_placement_apps_status ON placement_applications (status);

CREATE TABLE IF NOT EXISTS placement_interviews (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES placement_applications (id) ON DELETE CASCADE,
  round_name     TEXT NOT NULL DEFAULT 'Round 1',
  round_number   INT NOT NULL DEFAULT 1 CHECK (round_number >= 1),
  scheduled_at   TIMESTAMPTZ NOT NULL,
  location       TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'SCHEDULED'
                 CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'MISSED')),
  feedback       TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_placement_interviews_app ON placement_interviews (application_id);

CREATE TABLE IF NOT EXISTS placement_offers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES placement_applications (id) ON DELETE CASCADE,
  package_amount NUMERIC(12, 2) NOT NULL CHECK (package_amount > 0),
  currency       TEXT NOT NULL DEFAULT 'INR',
  employment_type TEXT NOT NULL DEFAULT 'FULL_TIME',
  joining_date   DATE,
  offer_status   TEXT NOT NULL DEFAULT 'PENDING'
                 CHECK (offer_status IN ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN')),
  issued_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One live offer per application (accepted/pending); declined/withdrawn may be replaced.
CREATE UNIQUE INDEX IF NOT EXISTS uq_placement_offers_live
  ON placement_offers (application_id) WHERE offer_status IN ('PENDING', 'ACCEPTED');
CREATE INDEX IF NOT EXISTS idx_placement_offers_app ON placement_offers (application_id);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies', 'placement_drives', 'placement_applications',
    'placement_interviews', 'placement_offers'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s;
       CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;
