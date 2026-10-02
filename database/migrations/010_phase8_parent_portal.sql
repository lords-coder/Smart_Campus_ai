-- 010_phase8_parent_portal.sql
-- Phase 8: parent/guardian portal — relationship links + invitations.

CREATE TABLE IF NOT EXISTS parent_student_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  student_id        UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL DEFAULT 'PARENT'
                    CHECK (relationship_type IN ('PARENT', 'GUARDIAN', 'SPONSOR')),
  status            TEXT NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE', 'REVOKED')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_user_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_parent_links_parent ON parent_student_links (parent_user_id);
CREATE INDEX IF NOT EXISTS idx_parent_links_student ON parent_student_links (student_id);
CREATE INDEX IF NOT EXISTS idx_parent_links_status ON parent_student_links (status);

-- Only users with the PARENT role may hold links. Enforced at the database
-- level so no application path can attach a student to a non-parent account.
CREATE OR REPLACE FUNCTION enforce_parent_link_role() RETURNS trigger AS $$
DECLARE
  r TEXT;
BEGIN
  SELECT role INTO r FROM users WHERE id = NEW.parent_user_id;
  IF r IS NULL OR r <> 'PARENT' THEN
    RAISE EXCEPTION 'parent_student_links.parent_user_id must reference a PARENT user (got %)', COALESCE(r, 'missing');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_parent_links_role ON parent_student_links;
CREATE TRIGGER trg_parent_links_role BEFORE INSERT OR UPDATE OF parent_user_id ON parent_student_links
  FOR EACH ROW EXECUTE FUNCTION enforce_parent_link_role();

CREATE TABLE IF NOT EXISTS parent_invitations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  parent_email      TEXT NOT NULL,
  relationship_type TEXT NOT NULL DEFAULT 'PARENT'
                    CHECK (relationship_type IN ('PARENT', 'GUARDIAN', 'SPONSOR')),
  token_hash        TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
  expires_at        TIMESTAMPTZ NOT NULL,
  used_at           TIMESTAMPTZ,
  created_by        UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parent_invitations_email ON parent_invitations (lower(parent_email));
CREATE INDEX IF NOT EXISTS idx_parent_invitations_student ON parent_invitations (student_id);
CREATE INDEX IF NOT EXISTS idx_parent_invitations_status ON parent_invitations (status);
CREATE INDEX IF NOT EXISTS idx_parent_invitations_expires ON parent_invitations (expires_at);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['parent_student_links', 'parent_invitations'] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s;
       CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;
