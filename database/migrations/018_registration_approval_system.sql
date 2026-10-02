-- 018_registration_approval_system.sql
-- Registration approval system: account status, pending registrations,
-- password help requests, and secure password reset tokens.

-- 1. Account status on users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('PENDING','ACTIVE','REJECTED','SUSPENDED'));

-- Phone number for registration
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;

-- Indexes for auth queries
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(lower(email));
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);

-- 2. Registrations table: tracks pending/approved/rejected registration requests
CREATE TABLE IF NOT EXISTS registrations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  requested_role TEXT NOT NULL CHECK (requested_role IN ('STUDENT','FACULTY','ADMIN')),
  status        TEXT NOT NULL DEFAULT 'PENDING_APPROVAL'
                  CHECK (status IN ('REGISTRATION_STARTED','PENDING_APPROVAL','APPROVED','REJECTED')),
  submission    JSONB NOT NULL DEFAULT '{}'::jsonb,
  rejection_reason TEXT,
  reviewed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);
CREATE INDEX IF NOT EXISTS idx_registrations_role ON registrations(requested_role);
CREATE INDEX IF NOT EXISTS idx_registrations_created ON registrations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_registrations_status_created ON registrations(status, created_at DESC);

-- Updated_at trigger for registrations
DROP TRIGGER IF EXISTS trg_registrations_updated_at ON registrations;
CREATE TRIGGER trg_registrations_updated_at
  BEFORE UPDATE ON registrations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 3. Password help requests (forgot password / account help)
CREATE TABLE IF NOT EXISTS password_help_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  email           TEXT NOT NULL,
  requester_role  TEXT CHECK (requester_role IN ('STUDENT','FACULTY','ADMIN','PARENT','ALUMNI','SUPER_ADMIN')),
  contact         TEXT,
  message         TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'OPEN'
                  CHECK (status IN ('OPEN','IN_PROGRESS','RESOLVED','REJECTED')),
  admin_notes     TEXT,
  handled_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  handled_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_help_status ON password_help_requests(status);
CREATE INDEX IF NOT EXISTS idx_password_help_created ON password_help_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_help_email ON password_help_requests(lower(email));

-- Updated_at trigger for password_help_requests
DROP TRIGGER IF EXISTS trg_password_help_updated_at ON password_help_requests;
CREATE TRIGGER trg_password_help_updated_at
  BEFORE UPDATE ON password_help_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 4. Password reset tokens (issued by admin, single-use)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id    UUID REFERENCES password_help_requests(id) ON DELETE SET NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);