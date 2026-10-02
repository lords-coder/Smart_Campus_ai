-- 011_phase9_hostel_transport.sql
-- Phase 9: hostel management + transport management.

-- ================================================================ HOSTEL ===

CREATE TABLE IF NOT EXISTS hostels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  block       TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'COED'
              CHECK (category IN ('BOYS', 'GIRLS', 'COED')),
  warden_name TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hostel_rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostel_id   UUID NOT NULL REFERENCES hostels (id) ON DELETE CASCADE,
  room_number TEXT NOT NULL,
  floor       INT NOT NULL DEFAULT 0,
  room_type   TEXT NOT NULL DEFAULT 'DOUBLE'
              CHECK (room_type IN ('SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD')),
  capacity    INT NOT NULL CHECK (capacity BETWEEN 1 AND 4),
  status      TEXT NOT NULL DEFAULT 'AVAILABLE'
              CHECK (status IN ('AVAILABLE', 'FULL', 'MAINTENANCE')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (hostel_id, room_number)
);

CREATE INDEX IF NOT EXISTS idx_hostel_rooms_hostel ON hostel_rooms (hostel_id);

CREATE TABLE IF NOT EXISTS hostel_allocations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      UUID NOT NULL REFERENCES hostel_rooms (id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  bed_number   INT NOT NULL CHECK (bed_number >= 1),
  allocated_on DATE NOT NULL DEFAULT CURRENT_DATE,
  vacated_on   DATE,
  status       TEXT NOT NULL DEFAULT 'ACTIVE'
               CHECK (status IN ('ACTIVE', 'VACATED', 'PENDING')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active bed per student; one active occupant per bed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hostel_alloc_active_student
  ON hostel_allocations (student_id) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS uq_hostel_alloc_active_bed
  ON hostel_allocations (room_id, bed_number) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_hostel_alloc_room ON hostel_allocations (room_id);
CREATE INDEX IF NOT EXISTS idx_hostel_alloc_student ON hostel_allocations (student_id);
CREATE INDEX IF NOT EXISTS idx_hostel_alloc_status ON hostel_allocations (status);

-- Capacity + bed-range guard (partial uniques stop collisions; this stops overfill).
CREATE OR REPLACE FUNCTION enforce_hostel_capacity() RETURNS trigger AS $$
DECLARE
  room_cap INT;
  occupied INT;
BEGIN
  IF NEW.status <> 'ACTIVE' THEN
    RETURN NEW;
  END IF;
  SELECT capacity INTO room_cap FROM hostel_rooms WHERE id = NEW.room_id;
  IF room_cap IS NULL THEN
    RAISE EXCEPTION 'hostel room does not exist';
  END IF;
  IF NEW.bed_number > room_cap THEN
    RAISE EXCEPTION 'bed number % exceeds room capacity %', NEW.bed_number, room_cap;
  END IF;
  SELECT count(*) INTO occupied FROM hostel_allocations
   WHERE room_id = NEW.room_id AND status = 'ACTIVE' AND id <> NEW.id;
  IF occupied >= room_cap THEN
    RAISE EXCEPTION 'room is at full capacity (%)', room_cap;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hostel_alloc_capacity ON hostel_allocations;
CREATE TRIGGER trg_hostel_alloc_capacity BEFORE INSERT OR UPDATE OF room_id, bed_number, status ON hostel_allocations
  FOR EACH ROW EXECUTE FUNCTION enforce_hostel_capacity();

CREATE TABLE IF NOT EXISTS hostel_complaints (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  room_id     UUID REFERENCES hostel_rooms (id) ON DELETE SET NULL,
  category    TEXT NOT NULL DEFAULT 'OTHER'
              CHECK (category IN ('ELECTRICAL', 'PLUMBING', 'CLEANING', 'FURNITURE', 'INTERNET', 'OTHER')),
  description TEXT NOT NULL CHECK (length(trim(description)) >= 5),
  status      TEXT NOT NULL DEFAULT 'OPEN'
              CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  priority    TEXT NOT NULL DEFAULT 'MEDIUM'
              CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hostel_complaints_student ON hostel_complaints (student_id);
CREATE INDEX IF NOT EXISTS idx_hostel_complaints_room ON hostel_complaints (room_id);
CREATE INDEX IF NOT EXISTS idx_hostel_complaints_status ON hostel_complaints (status);

CREATE TABLE IF NOT EXISTS hostel_room_change_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  current_room_id   UUID NOT NULL REFERENCES hostel_rooms (id) ON DELETE CASCADE,
  requested_room_id UUID REFERENCES hostel_rooms (id) ON DELETE SET NULL,
  reason            TEXT NOT NULL CHECK (length(trim(reason)) >= 5),
  status            TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by       UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hostel_rcr_student ON hostel_room_change_requests (student_id);
CREATE INDEX IF NOT EXISTS idx_hostel_rcr_status ON hostel_room_change_requests (status);

CREATE TABLE IF NOT EXISTS hostel_visitors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  visitor_name TEXT NOT NULL CHECK (length(trim(visitor_name)) >= 2),
  relation     TEXT NOT NULL DEFAULT 'Family',
  visit_date   DATE NOT NULL,
  visit_time   TIME,
  status       TEXT NOT NULL DEFAULT 'PENDING'
               CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hostel_visitors_student ON hostel_visitors (student_id);
CREATE INDEX IF NOT EXISTS idx_hostel_visitors_date ON hostel_visitors (visit_date);

-- ============================================================= TRANSPORT ===

CREATE TABLE IF NOT EXISTS transport_drivers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL CHECK (length(trim(name)) >= 2),
  phone      TEXT NOT NULL,
  license_no TEXT NOT NULL UNIQUE,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transport_vehicles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_number TEXT NOT NULL UNIQUE,
  vehicle_type        TEXT NOT NULL DEFAULT 'BUS'
                      CHECK (vehicle_type IN ('BUS', 'MINIBUS', 'VAN')),
  capacity            INT NOT NULL CHECK (capacity BETWEEN 1 AND 80),
  status              TEXT NOT NULL DEFAULT 'ACTIVE'
                      CHECK (status IN ('ACTIVE', 'MAINTENANCE', 'INACTIVE')),
  driver_id           UUID REFERENCES transport_drivers (id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transport_vehicles_status ON transport_vehicles (status);

CREATE TABLE IF NOT EXISTS transport_routes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_code TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transport_route_stops (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id       UUID NOT NULL REFERENCES transport_routes (id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  sequence       INT NOT NULL CHECK (sequence >= 1),
  scheduled_time TIME NOT NULL,
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (route_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_transport_stops_route ON transport_route_stops (route_id);

CREATE TABLE IF NOT EXISTS transport_assignments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  route_id   UUID NOT NULL REFERENCES transport_routes (id) ON DELETE CASCADE,
  stop_id    UUID NOT NULL REFERENCES transport_route_stops (id) ON DELETE RESTRICT,
  vehicle_id UUID REFERENCES transport_vehicles (id) ON DELETE SET NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date   DATE,
  status     TEXT NOT NULL DEFAULT 'ACTIVE'
             CHECK (status IN ('ACTIVE', 'ENDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active route assignment per student.
CREATE UNIQUE INDEX IF NOT EXISTS uq_transport_assign_active_student
  ON transport_assignments (student_id) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_transport_assign_student ON transport_assignments (student_id);
CREATE INDEX IF NOT EXISTS idx_transport_assign_route ON transport_assignments (route_id);
CREATE INDEX IF NOT EXISTS idx_transport_assign_status ON transport_assignments (status);

-- A stop must belong to the assigned route.
CREATE OR REPLACE FUNCTION enforce_assignment_stop_route() RETURNS trigger AS $$
DECLARE
  stop_route UUID;
BEGIN
  SELECT route_id INTO stop_route FROM transport_route_stops WHERE id = NEW.stop_id;
  IF stop_route IS NULL OR stop_route <> NEW.route_id THEN
    RAISE EXCEPTION 'stop does not belong to the assigned route';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_transport_assign_stop ON transport_assignments;
CREATE TRIGGER trg_transport_assign_stop BEFORE INSERT OR UPDATE OF route_id, stop_id ON transport_assignments
  FOR EACH ROW EXECUTE FUNCTION enforce_assignment_stop_route();

CREATE TABLE IF NOT EXISTS transport_passes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES transport_assignments (id) ON DELETE CASCADE,
  pass_number   TEXT NOT NULL UNIQUE,
  valid_from    DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until   DATE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'ACTIVE'
                CHECK (status IN ('ACTIVE', 'EXPIRED', 'REVOKED')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pass_dates_order CHECK (valid_until >= valid_from)
);

CREATE INDEX IF NOT EXISTS idx_transport_passes_student ON transport_passes (student_id);
CREATE INDEX IF NOT EXISTS idx_transport_passes_status ON transport_passes (status);

CREATE TABLE IF NOT EXISTS transport_alerts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id   UUID NOT NULL REFERENCES transport_routes (id) ON DELETE CASCADE,
  title      TEXT NOT NULL CHECK (length(trim(title)) >= 3),
  detail     TEXT NOT NULL DEFAULT '',
  severity   TEXT NOT NULL DEFAULT 'INFO'
             CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  active     BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transport_alerts_route ON transport_alerts (route_id);
CREATE INDEX IF NOT EXISTS idx_transport_alerts_active ON transport_alerts (active);

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'hostels', 'hostel_rooms', 'hostel_allocations', 'hostel_complaints',
    'hostel_room_change_requests', 'hostel_visitors',
    'transport_drivers', 'transport_vehicles', 'transport_routes',
    'transport_route_stops', 'transport_assignments', 'transport_passes',
    'transport_alerts'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s;
       CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;
