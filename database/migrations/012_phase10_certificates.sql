-- 012_phase10_certificates.sql
-- Phase 10: digital certificates — request workflow, issuance, verification.

CREATE SEQUENCE IF NOT EXISTS certificate_no_seq START 1;

CREATE TABLE IF NOT EXISTS certificate_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id       UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  certificate_type TEXT NOT NULL
                   CHECK (certificate_type IN ('BONAFIDE', 'TRANSCRIPT', 'CONDUCT', 'ENROLLMENT')),
  status           TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'ISSUED', 'REVOKED')),
  purpose          TEXT NOT NULL DEFAULT '' CHECK (length(purpose) <= 2000),
  rejection_reason TEXT,
  reviewed_by      UUID REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  issued_by        UUID REFERENCES users (id) ON DELETE SET NULL,
  issued_at        TIMESTAMPTZ,
  certificate_id   UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One pending request per student per type (prevents duplicate submissions).
CREATE UNIQUE INDEX IF NOT EXISTS uq_cert_requests_pending
  ON certificate_requests (student_id, certificate_type) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_cert_requests_student ON certificate_requests (student_id);
CREATE INDEX IF NOT EXISTS idx_cert_requests_status ON certificate_requests (status);
CREATE INDEX IF NOT EXISTS idx_cert_requests_type ON certificate_requests (certificate_type);

CREATE TABLE IF NOT EXISTS certificates (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id         UUID NOT NULL UNIQUE REFERENCES certificate_requests (id) ON DELETE CASCADE,
  student_id         UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  certificate_type   TEXT NOT NULL
                     CHECK (certificate_type IN ('BONAFIDE', 'TRANSCRIPT', 'CONDUCT', 'ENROLLMENT')),
  certificate_number TEXT NOT NULL UNIQUE,
  verification_code  TEXT NOT NULL UNIQUE,
  status             TEXT NOT NULL DEFAULT 'ISSUED'
                     CHECK (status IN ('ISSUED', 'REVOKED')),
  issued_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_certificates_student ON certificates (student_id);
CREATE INDEX IF NOT EXISTS idx_certificates_status ON certificates (status);
CREATE INDEX IF NOT EXISTS idx_certificates_verify ON certificates (verification_code);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_cert_requests_certificate'
  ) THEN
    ALTER TABLE certificate_requests
      ADD CONSTRAINT fk_cert_requests_certificate
      FOREIGN KEY (certificate_id) REFERENCES certificates (id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['certificate_requests', 'certificates'] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s;
       CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;
