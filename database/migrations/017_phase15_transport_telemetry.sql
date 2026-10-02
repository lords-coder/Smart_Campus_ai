-- 017_phase15_transport_telemetry.sql
-- Phase 15: transport live-tracking readiness foundation (no hardware).
-- Stores device-reported GPS telemetry per vehicle plus deterministic route
-- progress snapshots. Nearest/current-stop matching keys off the
-- device-reported stop sequence because route stops carry no coordinates
-- (GPS matching is an explicit future enhancement, not faked here).
-- Telemetry ingestion is ADMIN-only at the API layer; the DB enforces
-- value ranges so bad coordinates can never be persisted.

CREATE TABLE IF NOT EXISTS transport_vehicle_telemetry (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id    UUID NOT NULL REFERENCES transport_vehicles (id) ON DELETE CASCADE,
  latitude      DOUBLE PRECISION CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  longitude     DOUBLE PRECISION CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  speed_kmh     DOUBLE PRECISION CHECK (speed_kmh IS NULL OR speed_kmh >= 0),
  heading_deg   INT CHECK (heading_deg IS NULL OR (heading_deg >= 0 AND heading_deg < 360)),
  stop_sequence INT CHECK (stop_sequence IS NULL OR stop_sequence >= 1),
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  source        TEXT NOT NULL DEFAULT 'SIMULATED'
                CHECK (source IN ('MANUAL', 'SIMULATED', 'DEVICE')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT telemetry_coords_pair CHECK (
    (latitude IS NULL AND longitude IS NULL) OR
    (latitude IS NOT NULL AND longitude IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_transport_telemetry_vehicle_time
  ON transport_vehicle_telemetry (vehicle_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS transport_route_progress (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id        UUID NOT NULL REFERENCES transport_vehicles (id) ON DELETE CASCADE,
  route_id          UUID NOT NULL REFERENCES transport_routes (id) ON DELETE CASCADE,
  current_stop_id   UUID REFERENCES transport_route_stops (id) ON DELETE SET NULL,
  next_stop_id      UUID REFERENCES transport_route_stops (id) ON DELETE SET NULL,
  progress_pct      INT NOT NULL CHECK (progress_pct BETWEEN 0 AND 100),
  tracking_status   TEXT NOT NULL DEFAULT 'IDLE'
                    CHECK (tracking_status IN ('MOVING', 'IDLE', 'OFFLINE')),
  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transport_progress_vehicle_time
  ON transport_route_progress (vehicle_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_transport_progress_route
  ON transport_route_progress (route_id);
