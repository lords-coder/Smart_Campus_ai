-- 015_phase13_alumni.sql
-- Phase 13: alumni relations — profiles, mentorship, events, contributions.
-- Also activates the ALUMNI role (genuinely required: alumni login, own-profile
-- editing, and mentorship accept/reject are role-specific capabilities).

ALTER TABLE IF EXISTS users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE IF EXISTS users ADD CONSTRAINT users_role_check
  CHECK (role IN ('STUDENT', 'FACULTY', 'ADMIN', 'PARENT', 'ALUMNI', 'SUPER_ADMIN'));

CREATE TABLE IF NOT EXISTS alumni_profiles (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  student_id         UUID REFERENCES students (id) ON DELETE SET NULL,
  graduation_year    INT NOT NULL CHECK (graduation_year BETWEEN 1950 AND 2100),
  graduation_program TEXT NOT NULL DEFAULT '',
  department         TEXT NOT NULL DEFAULT '',
  current_company    TEXT NOT NULL DEFAULT '',
  current_position   TEXT NOT NULL DEFAULT '',
  industry           TEXT NOT NULL DEFAULT '',
  location           TEXT NOT NULL DEFAULT '',
  bio                TEXT NOT NULL DEFAULT '' CHECK (length(bio) <= 2000),
  linkedin_url       TEXT NOT NULL DEFAULT '',
  github_url         TEXT NOT NULL DEFAULT '',
  offers_mentorship  BOOLEAN NOT NULL DEFAULT false,
  mentorship_topics  TEXT NOT NULL DEFAULT '',
  mentorship_mode    TEXT NOT NULL DEFAULT 'ONLINE'
                     CHECK (mentorship_mode IN ('ONLINE', 'ONSITE', 'BOTH')),
  availability       TEXT NOT NULL DEFAULT '' CHECK (length(availability) <= 500),
  visibility         TEXT NOT NULL DEFAULT 'PUBLIC'
                     CHECK (visibility IN ('PUBLIC', 'PRIVATE')),
  verification       TEXT NOT NULL DEFAULT 'UNVERIFIED'
                     CHECK (verification IN ('UNVERIFIED', 'VERIFIED')),
  status             TEXT NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING', 'ALUMNI', 'INACTIVE')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only users with the ALUMNI role may hold an alumni profile.
CREATE OR REPLACE FUNCTION enforce_alumni_profile_role() RETURNS trigger AS $$
DECLARE
  r TEXT;
BEGIN
  SELECT role INTO r FROM users WHERE id = NEW.user_id;
  IF r IS NULL OR r <> 'ALUMNI' THEN
    RAISE EXCEPTION 'alumni_profiles.user_id must reference an ALUMNI user (got %)', COALESCE(r, 'missing');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_alumni_profiles_role ON alumni_profiles;
CREATE TRIGGER trg_alumni_profiles_role BEFORE INSERT OR UPDATE OF user_id ON alumni_profiles
  FOR EACH ROW EXECUTE FUNCTION enforce_alumni_profile_role();

CREATE INDEX IF NOT EXISTS idx_alumni_profiles_user ON alumni_profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_alumni_profiles_status ON alumni_profiles (status);
CREATE INDEX IF NOT EXISTS idx_alumni_profiles_verification ON alumni_profiles (verification);
CREATE INDEX IF NOT EXISTS idx_alumni_profiles_grad_year ON alumni_profiles (graduation_year);
CREATE INDEX IF NOT EXISTS idx_alumni_profiles_industry ON alumni_profiles (lower(industry));
CREATE INDEX IF NOT EXISTS idx_alumni_profiles_company ON alumni_profiles (lower(current_company));

CREATE TABLE IF NOT EXISTS alumni_mentorships (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alumni_id     UUID NOT NULL REFERENCES alumni_profiles (id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  topic         TEXT NOT NULL CHECK (length(trim(topic)) >= 2),
  message       TEXT NOT NULL DEFAULT '' CHECK (length(message) <= 2000),
  status        TEXT NOT NULL DEFAULT 'REQUESTED'
                CHECK (status IN ('REQUESTED', 'ACCEPTED', 'REJECTED', 'COMPLETED', 'CANCELLED')),
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at   TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One live mentorship per student+mentor pair.
CREATE UNIQUE INDEX IF NOT EXISTS uq_alumni_mentorship_live
  ON alumni_mentorships (alumni_id, student_id) WHERE status IN ('REQUESTED', 'ACCEPTED');
CREATE INDEX IF NOT EXISTS idx_alumni_mentorships_alumni ON alumni_mentorships (alumni_id);
CREATE INDEX IF NOT EXISTS idx_alumni_mentorships_student ON alumni_mentorships (student_id);
CREATE INDEX IF NOT EXISTS idx_alumni_mentorships_status ON alumni_mentorships (status);

CREATE TABLE IF NOT EXISTS alumni_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL CHECK (length(trim(title)) >= 3),
  description TEXT NOT NULL DEFAULT '',
  event_type  TEXT NOT NULL DEFAULT 'MEET'
              CHECK (event_type IN ('MEET', 'CAREER_TALK', 'NETWORKING', 'GUEST_LECTURE', 'MENTORSHIP_SESSION', 'REUNION', 'INDUSTRY_PANEL', 'OTHER')),
  location    TEXT NOT NULL DEFAULT '',
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ,
  capacity    INT NOT NULL DEFAULT 100 CHECK (capacity >= 1),
  audience    TEXT NOT NULL DEFAULT 'ALL'
              CHECK (audience IN ('ALL', 'STUDENTS', 'ALUMNI')),
  status      TEXT NOT NULL DEFAULT 'DRAFT'
              CHECK (status IN ('DRAFT', 'PUBLISHED', 'CLOSED', 'CANCELLED', 'COMPLETED')),
  created_by  UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_time_order CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS idx_alumni_events_status ON alumni_events (status);
CREATE INDEX IF NOT EXISTS idx_alumni_events_starts ON alumni_events (starts_at);

CREATE TABLE IF NOT EXISTS alumni_event_registrations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES alumni_events (id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'REGISTERED'
                CHECK (status IN ('REGISTERED', 'CANCELLED', 'ATTENDED')),
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_alumni_event_reg_event ON alumni_event_registrations (event_id);
CREATE INDEX IF NOT EXISTS idx_alumni_event_reg_user ON alumni_event_registrations (user_id);

CREATE TABLE IF NOT EXISTS alumni_campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL CHECK (length(trim(title)) >= 3),
  description  TEXT NOT NULL DEFAULT '',
  target_amount NUMERIC(12, 2) NOT NULL CHECK (target_amount >= 0),
  status       TEXT NOT NULL DEFAULT 'DRAFT'
               CHECK (status IN ('DRAFT', 'ACTIVE', 'CLOSED')),
  start_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date     DATE,
  created_by   UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT campaign_date_order CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS alumni_contributions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES alumni_campaigns (id) ON DELETE CASCADE,
  alumni_id   UUID NOT NULL REFERENCES alumni_profiles (id) ON DELETE CASCADE,
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency    TEXT NOT NULL DEFAULT 'INR',
  status      TEXT NOT NULL DEFAULT 'PLEDGED'
              CHECK (status IN ('PLEDGED', 'RECORDED', 'CANCELLED')),
  reference   TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alumni_contrib_campaign ON alumni_contributions (campaign_id);
CREATE INDEX IF NOT EXISTS idx_alumni_contrib_alumni ON alumni_contributions (alumni_id);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'alumni_profiles', 'alumni_mentorships', 'alumni_events',
    'alumni_event_registrations', 'alumni_campaigns', 'alumni_contributions'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s;
       CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;
