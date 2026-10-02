-- 005_phase3_timetable.sql
-- Phase 3: operational timetable management.
-- Adds an archive flag (safe delete) plus the indexes used by conflict detection
-- and timetable filtering. Previous migrations are never rewritten.

ALTER TABLE timetable_entries
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE timetable_entries
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Entry lookups / joins by course (attendance class queries, delete path).
CREATE INDEX IF NOT EXISTS idx_timetable_course ON timetable_entries (course_id);

-- Room conflict detection and room filtering: WHERE day_of_week = ? AND room = ?
CREATE INDEX IF NOT EXISTS idx_timetable_room_day ON timetable_entries (room, day_of_week);

-- Existing indexes already cover the other Phase 3 read paths:
--   idx_timetable_day_section (day_of_week, section, semester) -> day/section filters + section conflicts
--   idx_timetable_faculty     (faculty_id)                     -> faculty filter + faculty conflicts
