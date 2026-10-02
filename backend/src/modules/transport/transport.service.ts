import { randomBytes } from "node:crypto";
import { query, queryOne, withTransaction } from "../../config/db";
import { ApiError } from "../../utils/ApiError";
import { toLocalDateString } from "../../utils/date";
import type {
  MyTransport,
  PassStatus,
  TelemetrySource,
  TrackingStatus,
  TransportAlert,
  TransportAssignment,
  TransportDriver,
  TransportRoute,
  TransportStop,
  TransportVehicle,
  VehicleTracking,
} from "./transport.types";
import type { AssignStudentInput, CreateVehicleInput } from "./transport.schemas";

async function requireStudentProfile(userId: string): Promise<string> {
  const row = await queryOne<{ id: string }>("SELECT id FROM students WHERE user_id = $1", [userId]);
  if (!row) throw ApiError.notFound("No student profile is linked to this account");
  return row.id;
}

function pgConflict(error: unknown, message: string): ApiError {
  const code = (error as { code?: string })?.code;
  if (code === "23505") return ApiError.conflict(message, "DUPLICATE_RESOURCE");
  const text = error instanceof Error ? error.message : String(error);
  if (/stop does not belong/i.test(text)) return ApiError.badRequest(text, "VALIDATION_ERROR");
  throw error;
}

// ---------------------------------------------------------------- vehicles

export async function listVehicles(status?: string): Promise<TransportVehicle[]> {
  const rows = await query(
    `SELECT v.id, v.registration_number, v.vehicle_type, v.capacity, v.status,
            v.driver_id, d.name AS driver_name,
            COUNT(a.id) FILTER (WHERE a.status = 'ACTIVE')::int AS assigned_students
     FROM transport_vehicles v
     LEFT JOIN transport_drivers d ON d.id = v.driver_id
     LEFT JOIN transport_assignments a ON a.vehicle_id = v.id AND a.status = 'ACTIVE'
     ${status ? `WHERE v.status = $1` : ""}
     GROUP BY v.id, v.registration_number, v.vehicle_type, v.capacity, v.status, v.driver_id, d.name
     ORDER BY v.registration_number ASC
     LIMIT 200`,
    status ? [status] : [],
  );
  return rows.map((row) => ({
    id: row.id as string,
    registrationNumber: row.registration_number as string,
    vehicleType: row.vehicle_type as TransportVehicle["vehicleType"],
    capacity: Number(row.capacity),
    status: row.status as TransportVehicle["status"],
    driverId: (row.driver_id as string | null) ?? null,
    driverName: (row.driver_name as string | null) ?? null,
    assignedStudents: Number(row.assigned_students),
  }));
}

export async function createVehicle(input: CreateVehicleInput) {
  if (input.driverId) {
    const driver = await queryOne<{ id: string }>(
      `SELECT id FROM transport_drivers WHERE id = $1 AND active = true`,
      [input.driverId],
    );
    if (!driver) throw ApiError.notFound("Driver not found or inactive");
  }
  try {
    const rows = await query(
      `INSERT INTO transport_vehicles (registration_number, vehicle_type, capacity, driver_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.registrationNumber.trim().toUpperCase(), input.vehicleType, input.capacity, input.driverId ?? null],
    );
    return rows[0];
  } catch (error) {
    throw pgConflict(error, "A vehicle with this registration number already exists");
  }
}

export async function updateVehicle(id: string, updates: { status?: string; driverId?: string | null; capacity?: number }) {
  if (updates.driverId) {
    const driver = await queryOne<{ id: string }>(
      `SELECT id FROM transport_drivers WHERE id = $1 AND active = true`,
      [updates.driverId],
    );
    if (!driver) throw ApiError.notFound("Driver not found or inactive");
  }
  const sets: string[] = [];
  const params: unknown[] = [];
  if (updates.status !== undefined) {
    sets.push(`status = $${params.length + 1}`);
    params.push(updates.status);
  }
  if (updates.driverId !== undefined) {
    sets.push(`driver_id = $${params.length + 1}`);
    params.push(updates.driverId);
  }
  if (updates.capacity !== undefined) {
    sets.push(`capacity = $${params.length + 1}`);
    params.push(updates.capacity);
  }
  if (sets.length === 0) throw ApiError.badRequest("No fields to update", "VALIDATION_ERROR");
  params.push(id);
  const rows = await query(
    `UPDATE transport_vehicles SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  if (rows.length === 0) throw ApiError.notFound("Vehicle not found");
  return rows[0];
}

// ----------------------------------------------------------------- drivers

export async function listDrivers(): Promise<TransportDriver[]> {
  const rows = await query(`SELECT * FROM transport_drivers ORDER BY name ASC LIMIT 200`);
  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    phone: row.phone as string,
    licenseNo: row.license_no as string,
    active: Boolean(row.active),
  }));
}

export async function createDriver(name: string, phone: string, licenseNo: string) {
  try {
    const rows = await query(
      `INSERT INTO transport_drivers (name, phone, license_no) VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), phone.trim(), licenseNo.trim().toUpperCase()],
    );
    return rows[0];
  } catch (error) {
    throw pgConflict(error, "A driver with this license number already exists");
  }
}

// ------------------------------------------------------------------ routes

export async function listRoutes(): Promise<TransportRoute[]> {
  const rows = await query(
    `SELECT r.id, r.route_code, r.name, r.active,
            COUNT(DISTINCT s.id) FILTER (WHERE s.active = true)::int AS stop_count,
            COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'ACTIVE')::int AS assigned_students,
            (SELECT v.id FROM transport_assignments a2 JOIN transport_vehicles v ON v.id = a2.vehicle_id
              WHERE a2.route_id = r.id AND a2.status = 'ACTIVE' AND a2.vehicle_id IS NOT NULL
              GROUP BY v.id ORDER BY count(*) DESC LIMIT 1) AS vehicle_id,
            (SELECT v.registration_number FROM transport_assignments a2 JOIN transport_vehicles v ON v.id = a2.vehicle_id
              WHERE a2.route_id = r.id AND a2.status = 'ACTIVE' AND a2.vehicle_id IS NOT NULL
              GROUP BY v.id, v.registration_number ORDER BY count(*) DESC LIMIT 1) AS vehicle_number
     FROM transport_routes r
     LEFT JOIN transport_route_stops s ON s.route_id = r.id
     LEFT JOIN transport_assignments a ON a.route_id = r.id
     GROUP BY r.id, r.route_code, r.name, r.active
     ORDER BY r.route_code ASC
     LIMIT 200`,
  );
  return rows.map((row) => ({
    id: row.id as string,
    routeCode: row.route_code as string,
    name: row.name as string,
    active: Boolean(row.active),
    stopCount: Number(row.stop_count),
    assignedStudents: Number(row.assigned_students),
    vehicleId: (row.vehicle_id as string | null) ?? null,
    vehicleNumber: (row.vehicle_number as string | null) ?? null,
  }));
}

export async function getRoute(id: string): Promise<{ route: TransportRoute; stops: TransportStop[] }> {
  const routes = await query(`SELECT * FROM transport_routes WHERE id = $1`, [id]);
  if (routes.length === 0) throw ApiError.notFound("Route not found");
  const stops = await listStops(id);
  const all = await listRoutes();
  const route = all.find((r) => r.id === id);
  return {
    route: route ?? {
      id,
      routeCode: routes[0].route_code as string,
      name: routes[0].name as string,
      active: Boolean(routes[0].active),
      stopCount: stops.length,
      assignedStudents: 0,
      vehicleId: null,
      vehicleNumber: null,
    },
    stops,
  };
}

export async function createRoute(routeCode: string, name: string) {
  try {
    const rows = await query(
      `INSERT INTO transport_routes (route_code, name) VALUES ($1, $2) RETURNING *`,
      [routeCode.trim().toUpperCase(), name.trim()],
    );
    return rows[0];
  } catch (error) {
    throw pgConflict(error, "A route with this code already exists");
  }
}

export async function updateRoute(id: string, updates: { name?: string; active?: boolean }) {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (updates.name !== undefined) {
    sets.push(`name = $${params.length + 1}`);
    params.push(updates.name.trim());
  }
  if (updates.active !== undefined) {
    sets.push(`active = $${params.length + 1}`);
    params.push(updates.active);
  }
  if (sets.length === 0) throw ApiError.badRequest("No fields to update", "VALIDATION_ERROR");
  params.push(id);
  const rows = await query(`UPDATE transport_routes SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`, params);
  if (rows.length === 0) throw ApiError.notFound("Route not found");
  return rows[0];
}

// ------------------------------------------------------------------- stops

export async function listStops(routeId: string): Promise<TransportStop[]> {
  const rows = await query(
    `SELECT * FROM transport_route_stops WHERE route_id = $1 ORDER BY sequence ASC LIMIT 100`,
    [routeId],
  );
  return rows.map((row) => ({
    id: row.id as string,
    routeId: row.route_id as string,
    name: row.name as string,
    sequence: Number(row.sequence),
    scheduledTime: String(row.scheduled_time).slice(0, 5),
    active: Boolean(row.active),
  }));
}

export async function addStop(routeId: string, name: string, sequence: number, scheduledTime: string) {
  const route = await queryOne<{ id: string }>(`SELECT id FROM transport_routes WHERE id = $1`, [routeId]);
  if (!route) throw ApiError.notFound("Route not found");
  try {
    const rows = await query(
      `INSERT INTO transport_route_stops (route_id, name, sequence, scheduled_time)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [routeId, name.trim(), sequence, scheduledTime],
    );
    return rows[0];
  } catch (error) {
    throw pgConflict(error, "A stop with this sequence already exists on the route");
  }
}

export async function updateStop(id: string, updates: { sequence?: number; scheduledTime?: string; active?: boolean }) {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (updates.sequence !== undefined) {
    sets.push(`sequence = $${params.length + 1}`);
    params.push(updates.sequence);
  }
  if (updates.scheduledTime !== undefined) {
    sets.push(`scheduled_time = $${params.length + 1}`);
    params.push(updates.scheduledTime);
  }
  if (updates.active !== undefined) {
    sets.push(`active = $${params.length + 1}`);
    params.push(updates.active);
  }
  if (sets.length === 0) throw ApiError.badRequest("No fields to update", "VALIDATION_ERROR");
  params.push(id);
  try {
    const rows = await query(
      `UPDATE transport_route_stops SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
      params,
    );
    if (rows.length === 0) throw ApiError.notFound("Stop not found");
    return rows[0];
  } catch (error) {
    throw pgConflict(error, "A stop with this sequence already exists on the route");
  }
}

// ------------------------------------------------------------- assignments

function newPassNumber(): string {
  const year = new Date().getFullYear();
  return `SCBP-${year}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

async function createPassForAssignment(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  profileId: string,
  assignmentId: string,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const inserted = await client.query(
        `INSERT INTO transport_passes (student_id, assignment_id, pass_number, valid_until)
         VALUES ($1, $2, $3, CURRENT_DATE + INTERVAL '180 days') RETURNING *`,
        [profileId, assignmentId, newPassNumber()],
      );
      return inserted.rows[0];
    } catch (error) {
      if ((error as { code?: string })?.code !== "23505" || attempt === 2) throw error;
    }
  }
  throw ApiError.conflict("Could not generate a unique pass number", "DUPLICATE_RESOURCE");
}

export async function assignStudent(input: AssignStudentInput) {
  return withTransaction(async (client) => {
    const student = await client.query(`SELECT id FROM students WHERE student_no = $1`, [input.studentNo.trim()]);
    if (student.rows.length === 0) throw ApiError.notFound("Student not found");
    const profileId = student.rows[0].id as string;
    const route = await client.query(`SELECT id, active FROM transport_routes WHERE id = $1`, [input.routeId]);
    if (route.rows.length === 0) throw ApiError.notFound("Route not found");
    if (!route.rows[0].active) throw ApiError.badRequest("Route is not active", "VALIDATION_ERROR");
    const stop = await client.query(`SELECT id, route_id, active FROM transport_route_stops WHERE id = $1`, [input.stopId]);
    if (stop.rows.length === 0) throw ApiError.notFound("Stop not found");
    if (stop.rows[0].route_id !== input.routeId || !stop.rows[0].active) {
      throw ApiError.badRequest("Stop does not belong to the assigned route", "VALIDATION_ERROR");
    }
    if (input.vehicleId) {
      const vehicle = await client.query(`SELECT id, status FROM transport_vehicles WHERE id = $1`, [input.vehicleId]);
      if (vehicle.rows.length === 0) throw ApiError.notFound("Vehicle not found");
      if (vehicle.rows[0].status !== "ACTIVE") {
        throw ApiError.badRequest("Vehicle is not active", "VALIDATION_ERROR");
      }
    }
    const existing = await client.query(
      `SELECT id FROM transport_assignments WHERE student_id = $1 AND status = 'ACTIVE'`,
      [profileId],
    );
    if (existing.rows.length > 0) {
      throw ApiError.conflict("Student already has an active transport assignment", "ALLOCATION_CONFLICT");
    }
    let assignmentId: string;
    try {
      const inserted = await client.query(
        `INSERT INTO transport_assignments (student_id, route_id, stop_id, vehicle_id)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [profileId, input.routeId, input.stopId, input.vehicleId ?? null],
      );
      assignmentId = inserted.rows[0].id as string;
    } catch (error) {
      throw pgConflict(error, "Assignment could not be created");
    }
    await createPassForAssignment(client, profileId, assignmentId);
    return assignmentId;
  });
}

export async function endAssignment(assignmentId: string) {
  const rows = await query(
    `UPDATE transport_assignments SET status = 'ENDED', end_date = CURRENT_DATE
     WHERE id = $1 AND status = 'ACTIVE' RETURNING *`,
    [assignmentId],
  );
  if (rows.length === 0) throw ApiError.notFound("Active assignment not found");
  return rows[0];
}

export async function listAssignments(routeId?: string, status?: string): Promise<TransportAssignment[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (routeId) {
    conditions.push(`a.route_id = $${params.length + 1}`);
    params.push(routeId);
  }
  if (status) {
    conditions.push(`a.status = $${params.length + 1}`);
    params.push(status);
  }
  const rows = await query(
    `SELECT a.id, a.student_id, st.student_no, u.name AS student_name,
            a.route_id, r.route_code, r.name AS route_name,
            a.stop_id, s.name AS stop_name, s.scheduled_time,
            a.vehicle_id, v.registration_number AS vehicle_number,
            p.pass_number, p.status AS pass_status,
            a.start_date, a.end_date, a.status
     FROM transport_assignments a
     JOIN students st ON st.id = a.student_id
     JOIN users u ON u.id = st.user_id
     JOIN transport_routes r ON r.id = a.route_id
     JOIN transport_route_stops s ON s.id = a.stop_id
     LEFT JOIN transport_vehicles v ON v.id = a.vehicle_id
     LEFT JOIN LATERAL (
       SELECT pass_number, status FROM transport_passes p
       WHERE p.assignment_id = a.id ORDER BY p.created_at DESC LIMIT 1
     ) p ON true
     ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY u.name ASC LIMIT 200`,
    params,
  );
  return rows.map((row) => ({
    id: row.id as string,
    studentId: row.student_id as string,
    studentNo: row.student_no as string,
    studentName: row.student_name as string,
    routeId: row.route_id as string,
    routeCode: row.route_code as string,
    routeName: row.route_name as string,
    stopId: row.stop_id as string,
    stopName: row.stop_name as string,
    scheduledTime: String(row.scheduled_time).slice(0, 5),
    vehicleId: (row.vehicle_id as string | null) ?? null,
    vehicleNumber: (row.vehicle_number as string | null) ?? null,
    passNumber: (row.pass_number as string | null) ?? null,
    passStatus: (row.pass_status as string | null) ?? null,
    startDate: toLocalDateString(row.start_date as string),
    endDate: row.end_date ? toLocalDateString(row.end_date as string) : null,
    status: row.status as TransportAssignment["status"],
  }));
}

// ------------------------------------------------------------------ passes

export async function getPassForProfile(profileId: string) {
  const rows = await query(
    `SELECT * FROM transport_passes WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [profileId],
  );
  return rows[0] ?? null;
}

// ------------------------------------------------------------------ alerts

export async function listAlerts(routeId?: string, activeOnly = true) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (routeId) {
    conditions.push(`al.route_id = $${params.length + 1}`);
    params.push(routeId);
  }
  if (activeOnly) conditions.push(`al.active = true`);
  const rows = await query(
    `SELECT al.*, r.route_code FROM transport_alerts al
     JOIN transport_routes r ON r.id = al.route_id
     ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY al.created_at DESC LIMIT 100`,
    params,
  );
  return rows.map((row) => ({
    id: row.id as string,
    routeId: row.route_id as string,
    routeCode: row.route_code as string,
    title: row.title as string,
    detail: (row.detail as string) ?? "",
    severity: row.severity as TransportAlert["severity"],
    active: Boolean(row.active),
    createdAt: new Date(row.created_at as string).toISOString(),
  }));
}

export async function createAlert(routeId: string, title: string, detail: string, severity: string, createdBy: string) {
  const route = await queryOne<{ id: string }>(`SELECT id FROM transport_routes WHERE id = $1`, [routeId]);
  if (!route) throw ApiError.notFound("Route not found");
  const rows = await query(
    `INSERT INTO transport_alerts (route_id, title, detail, severity, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [routeId, title.trim(), detail.trim(), severity, createdBy],
  );
  return rows[0];
}

export async function updateAlert(id: string, active: boolean) {
  const rows = await query(`UPDATE transport_alerts SET active = $1 WHERE id = $2 RETURNING *`, [active, id]);
  if (rows.length === 0) throw ApiError.notFound("Alert not found");
  return rows[0];
}

// --------------------------------------------------------------- dashboard

export async function transportDashboard() {
  const [vehicles, routes, counts] = await Promise.all([
    listVehicles(),
    listRoutes(),
    query(
      `SELECT COUNT(DISTINCT CASE WHEN a.status = 'ACTIVE' THEN a.student_id END)::int AS assigned_students,
              COUNT(*) FILTER (WHERE p.status = 'ACTIVE')::int AS active_passes,
              COUNT(*) FILTER (WHERE al.active = true)::int AS active_alerts
       FROM transport_assignments a
       FULL JOIN transport_passes p ON p.assignment_id = a.id
       FULL JOIN transport_alerts al ON true`,
    ),
  ]);
  const c = (counts[0] ?? {}) as Record<string, number>;
  const byStatus = { ACTIVE: 0, MAINTENANCE: 0, INACTIVE: 0 };
  for (const v of vehicles) byStatus[v.status] += 1;
  return {
    fleet: { total: vehicles.length, ...byStatus },
    routes: { total: routes.length, active: routes.filter((r) => r.active).length },
    assignedStudents: Number(c.assigned_students ?? 0),
    activePasses: Number(c.active_passes ?? 0),
    activeAlerts: Number(c.active_alerts ?? 0),
    vehicles,
    routesList: routes,
  };
}

// ----------------------------------------------------------------- student

async function myTransportByProfile(profileId: string): Promise<MyTransport> {
  const assignRows = await query(
    `SELECT a.id, a.start_date, r.id AS route_id, r.route_code, r.name AS route_name,
            s.id AS stop_id, s.name AS stop_name, s.scheduled_time,
            v.id AS vehicle_id, v.registration_number, v.vehicle_type, v.status AS vehicle_status,
            d.name AS driver_name
     FROM transport_assignments a
     JOIN transport_routes r ON r.id = a.route_id
     JOIN transport_route_stops s ON s.id = a.stop_id
     LEFT JOIN transport_vehicles v ON v.id = a.vehicle_id
     LEFT JOIN transport_drivers d ON d.id = v.driver_id
     WHERE a.student_id = $1 AND a.status = 'ACTIVE'
     ORDER BY a.start_date DESC LIMIT 1`,
    [profileId],
  );
  const passRow = await getPassForProfile(profileId);
  if (assignRows.length === 0) {
    return { assignment: null, pass: null, alerts: [], tracking: null };
  }
  const a = assignRows[0];
  const stops = await query(
    `SELECT name, sequence, scheduled_time FROM transport_route_stops
     WHERE route_id = $1 AND active = true ORDER BY sequence ASC`,
    [a.route_id],
  );
  const alertRows = await listAlerts(a.route_id as string, true);
  let transportFeeStatus: string | null = null;
  const feeRows = await query(
    `SELECT status FROM fees WHERE student_id = $1 AND fee_type ILIKE 'Transport%' ORDER BY due_date DESC LIMIT 1`,
    [profileId],
  );
  if (feeRows.length > 0) transportFeeStatus = feeRows[0].status as string;
  const tracking = a.vehicle_id ? await computeVehicleTracking(a.vehicle_id as string) : null;
  return {
    assignment: {
      id: a.id as string,
      route: { id: a.route_id as string, routeCode: a.route_code as string, name: a.route_name as string },
      stop: { id: a.stop_id as string, name: a.stop_name as string, scheduledTime: String(a.scheduled_time).slice(0, 5) },
      vehicle: a.vehicle_id
        ? {
            id: a.vehicle_id as string,
            registrationNumber: a.registration_number as string,
            vehicleType: a.vehicle_type as string,
            status: a.vehicle_status as string,
            driverName: (a.driver_name as string | null) ?? null,
          }
        : null,
      startDate: toLocalDateString(a.start_date as string),
      allStops: stops.map((s) => ({
        name: s.name as string,
        sequence: Number(s.sequence),
        scheduledTime: String(s.scheduled_time).slice(0, 5),
      })),
    },
    pass: passRow
      ? {
          passNumber: passRow.pass_number as string,
          validFrom: toLocalDateString(passRow.valid_from as string),
          validUntil: toLocalDateString(passRow.valid_until as string),
          status: passRow.status as PassStatus,
          transportFeeStatus,
        }
      : null,
    alerts: alertRows.map((al) => ({ title: al.title, detail: al.detail, severity: al.severity })),
    tracking,
  };
}

export async function getMyTransport(userId: string): Promise<MyTransport> {
  const profileId = await requireStudentProfile(userId);
  return myTransportByProfile(profileId);
}

export async function getTransportForParent(parentUserId: string, studentId: string): Promise<MyTransport> {
  const { requireLinkedStudentUserId } = await import("../parent/parent.service");
  const studentUserId = await requireLinkedStudentUserId(parentUserId, studentId);
  const profileId = await requireStudentProfile(studentUserId);
  return myTransportByProfile(profileId);
}

export async function getHostelForParent(parentUserId: string, studentId: string) {
  const { requireLinkedStudentUserId } = await import("../parent/parent.service");
  const studentUserId = await requireLinkedStudentUserId(parentUserId, studentId);
  const { getMyHostel } = await import("../hostel/hostel.service");
  const hostel = await getMyHostel(studentUserId);
  return {
    allocation: hostel.allocation
      ? { hostel: hostel.allocation.hostel, roomNumber: hostel.allocation.room.roomNumber, bedNumber: hostel.allocation.bedNumber, allocatedOn: hostel.allocation.allocatedOn }
      : null,
    roommateCount: hostel.roommates.length,
    fees: hostel.fees,
  };
}

// ------------------------------------------------- live tracking (Phase 15)
//
// Readiness foundation only: accepts staff-reported or simulated GPS points
// and derives deterministic route progress. There is no live hardware feed,
// so every response flags whether the point was simulated and the UI labels
// it "Demo tracking". Route stops carry no coordinates (Phase 9 schema), so
// current/next stop matching keys off the device-reported stop sequence;
// a point without a sequence is stored but yields no progress (never
// guessed). Tracking status derives from point age + speed at read time:
//   MOVING: latest point < 15 min old and speed > 0
//   IDLE:   latest point < 15 min old and speed is 0/unknown
//   OFFLINE: no point, or latest point >= 15 min old.

export const TELEMETRY_OFFLINE_MINUTES = 15;

export interface TelemetryInput {
  vehicleId: string;
  latitude?: number | null;
  longitude?: number | null;
  speedKmh?: number | null;
  headingDeg?: number | null;
  stopSequence?: number | null;
  recordedAt?: string | null;
}

async function requireActiveVehicle(vehicleId: string) {
  const vehicle = await queryOne<{ id: string; registration_number: string; status: string }>(
    `SELECT id, registration_number, status FROM transport_vehicles WHERE id = $1`,
    [vehicleId],
  );
  if (!vehicle) throw ApiError.notFound("Vehicle not found");
  if (vehicle.status !== "ACTIVE") {
    throw ApiError.badRequest(
      `Vehicle ${vehicle.registration_number} is ${vehicle.status}; telemetry is accepted only for ACTIVE vehicles`,
      "VALIDATION_ERROR",
    );
  }
  return vehicle;
}

/** Route a vehicle is serving: route with the most ACTIVE assignments on it. */
async function primaryRouteForVehicle(vehicleId: string) {
  return queryOne<{ id: string; route_code: string; name: string }>(
    `SELECT r.id, r.route_code, r.name
     FROM transport_assignments a
     JOIN transport_routes r ON r.id = a.route_id
     WHERE a.vehicle_id = $1 AND a.status = 'ACTIVE'
     GROUP BY r.id, r.route_code, r.name
     ORDER BY COUNT(*) DESC, r.route_code ASC
     LIMIT 1`,
    [vehicleId],
  );
}

interface StopRow {
  id: string;
  name: string;
  sequence: number;
  scheduled_time: string;
}

function trackingStatusFor(latestAt: Date | null, speedKmh: number | null): TrackingStatus {
  if (!latestAt) return "OFFLINE";
  const ageMin = (Date.now() - latestAt.getTime()) / 60000;
  if (ageMin >= TELEMETRY_OFFLINE_MINUTES) return "OFFLINE";
  return speedKmh != null && speedKmh > 0 ? "MOVING" : "IDLE";
}

function stopView(s: StopRow) {
  return {
    id: s.id,
    name: s.name,
    sequence: s.sequence,
    scheduledTime: String(s.scheduled_time).slice(0, 5),
  };
}

/** Deterministic progress from a reported stop sequence (clamped to route). */
export async function computeVehicleTracking(vehicleId: string): Promise<VehicleTracking> {
  const vehicle = await queryOne<{
    id: string;
    registration_number: string;
    status: string;
  }>(`SELECT id, registration_number, status FROM transport_vehicles WHERE id = $1`, [vehicleId]);
  if (!vehicle) throw ApiError.notFound("Vehicle not found");

  const latest = await queryOne<{
    latitude: number | null;
    longitude: number | null;
    speed_kmh: number | null;
    stop_sequence: number | null;
    recorded_at: Date;
    source: TelemetrySource;
  }>(
    `SELECT latitude, longitude, speed_kmh, stop_sequence, recorded_at, source
     FROM transport_vehicle_telemetry WHERE vehicle_id = $1
     ORDER BY recorded_at DESC, created_at DESC LIMIT 1`,
    [vehicleId],
  );

  const base: VehicleTracking = {
    vehicleId: vehicle.id,
    registrationNumber: vehicle.registration_number,
    vehicleStatus: vehicle.status as VehicleTracking["vehicleStatus"],
    trackingStatus: "OFFLINE",
    simulated: latest ? latest.source !== "DEVICE" : true,
    lastUpdateAt: latest ? new Date(latest.recorded_at).toISOString() : null,
    latitude: latest?.latitude ?? null,
    longitude: latest?.longitude ?? null,
    speedKmh: latest?.speed_kmh != null ? Number(latest.speed_kmh) : null,
    route: null,
    currentStop: null,
    nextStop: null,
    progressPct: null,
  };

  base.trackingStatus = trackingStatusFor(
    latest ? new Date(latest.recorded_at) : null,
    base.speedKmh,
  );

  const route = await primaryRouteForVehicle(vehicleId);
  if (!route) return base;
  base.route = { id: route.id, routeCode: route.route_code, name: route.name };

  const stops = (await query(
    `SELECT id, name, sequence, scheduled_time FROM transport_route_stops
     WHERE route_id = $1 AND active = true ORDER BY sequence ASC`,
    [route.id],
  )) as StopRow[];
  if (stops.length === 0 || latest?.stop_sequence == null) return base;

  const seq = Math.min(Math.max(Number(latest.stop_sequence), 1), stops[stops.length - 1].sequence);
  const current = stops.filter((s) => s.sequence <= seq).pop() ?? stops[0];
  const next = stops.find((s) => s.sequence > current.sequence) ?? null;
  base.currentStop = { id: current.id, name: current.name, sequence: current.sequence };
  base.nextStop = next ? stopView(next) : null;
  base.progressPct = Math.round((current.sequence / stops[stops.length - 1].sequence) * 100);
  return base;
}

async function snapshotProgress(vehicleId: string, tracking: VehicleTracking) {
  if (!tracking.route) return;
  await query(
    `INSERT INTO transport_route_progress
       (vehicle_id, route_id, current_stop_id, next_stop_id, progress_pct, tracking_status, recorded_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      vehicleId,
      tracking.route.id,
      tracking.currentStop?.id ?? null,
      tracking.nextStop?.id ?? null,
      tracking.progressPct ?? 0,
      tracking.trackingStatus,
      tracking.lastUpdateAt ?? new Date().toISOString(),
    ],
  );
}

export async function ingestTelemetry(input: TelemetryInput, source: TelemetrySource) {
  await requireActiveVehicle(input.vehicleId);
  const recordedAt = input.recordedAt ? new Date(input.recordedAt) : new Date();
  if (Number.isNaN(recordedAt.getTime())) throw ApiError.badRequest("recordedAt must be a valid timestamp", "VALIDATION_ERROR");
  if (recordedAt.getTime() > Date.now() + 5 * 60000) {
    throw ApiError.badRequest("recordedAt cannot be in the future", "VALIDATION_ERROR");
  }
  await query(
    `INSERT INTO transport_vehicle_telemetry
       (vehicle_id, latitude, longitude, speed_kmh, heading_deg, stop_sequence, recorded_at, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.vehicleId,
      input.latitude ?? null,
      input.longitude ?? null,
      input.speedKmh ?? null,
      input.headingDeg ?? null,
      input.stopSequence ?? null,
      recordedAt.toISOString(),
      source,
    ],
  );
  const tracking = await computeVehicleTracking(input.vehicleId);
  await snapshotProgress(input.vehicleId, tracking);
  return tracking;
}

/**
 * Deterministic demo simulator (ADMIN-only). Inserts honest now-timestamped
 * points so OFFLINE still derives naturally from age:
 *   START_ROUTE: stop 1, moving at given/default speed
 *   ADVANCE_STOP: next sequence after latest, capped at terminus (then IDLE)
 *   SET_IDLE: same sequence, speed 0
 *   SET_MOVING: same sequence (or 1), given/default speed
 */
export async function simulateTelemetry(
  vehicleId: string,
  action: "START_ROUTE" | "ADVANCE_STOP" | "SET_IDLE" | "SET_MOVING",
  speedKmh?: number | null,
) {
  await requireActiveVehicle(vehicleId);
  const route = await primaryRouteForVehicle(vehicleId);
  if (!route) throw ApiError.badRequest("Vehicle has no active route assignment to simulate", "VALIDATION_ERROR");
  const stops = (await query(
    `SELECT id, name, sequence, scheduled_time FROM transport_route_stops
     WHERE route_id = $1 AND active = true ORDER BY sequence ASC`,
    [route.id],
  )) as StopRow[];
  if (stops.length === 0) throw ApiError.badRequest("Route has no active stops", "VALIDATION_ERROR");

  const latest = await queryOne<{ stop_sequence: number | null; speed_kmh: number | null }>(
    `SELECT stop_sequence, speed_kmh FROM transport_vehicle_telemetry
     WHERE vehicle_id = $1 ORDER BY recorded_at DESC, created_at DESC LIMIT 1`,
    [vehicleId],
  );

  const defaultSpeed = speedKmh ?? 28;
  let seq: number;
  let speed: number;
  if (action === "START_ROUTE") {
    seq = stops[0].sequence;
    speed = defaultSpeed;
  } else if (action === "ADVANCE_STOP") {
    const last = latest?.stop_sequence ?? stops[0].sequence - 1;
    seq = Math.min(Number(last) + 1, stops[stops.length - 1].sequence);
    speed = seq >= stops[stops.length - 1].sequence ? 0 : defaultSpeed;
  } else if (action === "SET_IDLE") {
    seq = Number(latest?.stop_sequence ?? stops[0].sequence);
    speed = 0;
  } else {
    seq = Number(latest?.stop_sequence ?? stops[0].sequence);
    speed = defaultSpeed;
  }

  return ingestTelemetry({ vehicleId, speedKmh: speed, stopSequence: seq }, "SIMULATED");
}

export async function fleetTracking(): Promise<VehicleTracking[]> {
  const vehicles = await query<{ id: string }>(`SELECT id FROM transport_vehicles ORDER BY registration_number ASC`);
  const out: VehicleTracking[] = [];
  for (const v of vehicles) out.push(await computeVehicleTracking(v.id as string));
  return out;
}
