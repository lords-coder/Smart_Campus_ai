-- 004_phase2_operations.sql
-- Phase 2: operational fee payments + indexes needed by the attendance workflow.

CREATE TABLE IF NOT EXISTS fee_payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_id         UUID NOT NULL REFERENCES fees (id) ON DELETE CASCADE,
  amount         NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL
                 CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'UPI', 'CARD')),
  reference      TEXT CHECK (reference IS NULL OR char_length(reference) <= 100),
  recorded_by    UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fee_payments_fee ON fee_payments (fee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fees_status ON fees (status);
CREATE INDEX IF NOT EXISTS idx_attendance_recorded_by ON attendance (recorded_by);
CREATE INDEX IF NOT EXISTS idx_timetable_faculty ON timetable_entries (faculty_id);
