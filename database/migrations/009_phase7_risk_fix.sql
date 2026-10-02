-- 009_phase7_risk_fix.sql
-- Adds updated_at to risk_snapshots for DBs migrated with 008 before the fix.

ALTER TABLE IF EXISTS risk_snapshots
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_risk_snapshots_updated_at ON risk_snapshots;
CREATE TRIGGER trg_risk_snapshots_updated_at BEFORE UPDATE ON risk_snapshots
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
