-- 007_phase6_recommendations.sql
-- Phase 6: Personalized Learning Recommendations resources.

CREATE TABLE IF NOT EXISTS learning_resources (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        UUID NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  resource_type    TEXT NOT NULL
    CHECK (resource_type IN ('VIDEO', 'NOTES', 'PRACTICE', 'ARTICLE', 'REMEDIAL')),
  topic            TEXT NOT NULL,
  difficulty       TEXT NOT NULL DEFAULT 'intermediate'
    CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  url              TEXT,
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT learning_resources_course_fk FOREIGN KEY (course_id) REFERENCES courses (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_learning_resources_course ON learning_resources (course_id);
CREATE INDEX IF NOT EXISTS idx_learning_resources_topic ON learning_resources (topic);
CREATE INDEX IF NOT EXISTS idx_learning_resources_type ON learning_resources (resource_type);
CREATE INDEX IF NOT EXISTS idx_learning_resources_active ON learning_resources (active);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['learning_resources'] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s;
       CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;