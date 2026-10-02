import { query, queryOne, withTransaction } from "../../config/db";
import { ApiError } from "../../utils/ApiError";
import { toLocalDateString } from "../../utils/date";
import type {
  HostelAllocation,
  HostelComplaint,
  HostelFeeRecord,
  HostelRoom,
  HostelSummary,
  HostelVisitor,
  MyHostel,
  RoomChangeRequest,
} from "./hostel.types";
import type { AllocateInput, CreateHostelInput, CreateRoomInput } from "./hostel.schemas";

async function requireStudentProfile(userId: string): Promise<string> {
  const row = await queryOne<{ id: string }>("SELECT id FROM students WHERE user_id = $1", [userId]);
  if (!row) throw ApiError.notFound("No student profile is linked to this account");
  return row.id;
}

async function requireProfileByNo(studentNo: string): Promise<{ id: string; user_id: string }> {
  const row = await queryOne<{ id: string; user_id: string }>(
    "SELECT id, user_id FROM students WHERE student_no = $1",
    [studentNo.trim()],
  );
  if (!row) throw ApiError.notFound("Student not found");
  return row;
}

function pgConflict(error: unknown, message: string): ApiError {
  const code = (error as { code?: string })?.code;
  if (code === "23505") return ApiError.conflict(message, "DUPLICATE_RESOURCE");
  const text = error instanceof Error ? error.message : String(error);
  if (/full capacity|already occupied|already has an active/i.test(text)) {
    return ApiError.conflict(text, "ALLOCATION_CONFLICT");
  }
  if (/bed number|does not belong|no vacancy/i.test(text)) {
    return ApiError.badRequest(text, "VALIDATION_ERROR");
  }
  throw error;
}

// ------------------------------------------------------------------ hostels

export async function listHostels(): Promise<HostelSummary[]> {
  const rows = await query(
    `SELECT h.id, h.name, h.block, h.category, h.warden_name, h.active,
            COUNT(DISTINCT r.id)::int AS room_count,
            COALESCE(SUM(r.capacity), 0)::int AS bed_capacity,
            COUNT(a.id) FILTER (WHERE a.status = 'ACTIVE')::int AS occupied_beds
     FROM hostels h
     LEFT JOIN hostel_rooms r ON r.hostel_id = h.id
     LEFT JOIN hostel_allocations a ON a.room_id = r.id AND a.status = 'ACTIVE'
     GROUP BY h.id, h.name, h.block, h.category, h.warden_name, h.active
     ORDER BY h.name ASC`,
  );
  return rows.map((row) => {
    const capacity = Number(row.bed_capacity);
    const occupied = Number(row.occupied_beds);
    return {
      id: row.id as string,
      name: row.name as string,
      block: row.block as string,
      category: row.category as string,
      wardenName: (row.warden_name as string | null) ?? null,
      active: Boolean(row.active),
      roomCount: Number(row.room_count),
      bedCapacity: capacity,
      occupiedBeds: occupied,
      occupancyPercentage: capacity > 0 ? Math.round((occupied / capacity) * 1000) / 10 : 0,
    };
  });
}

export async function hostelDashboard() {
  const [hostels, counts] = await Promise.all([
    listHostels(),
    query(
      `SELECT COUNT(DISTINCT r.id)::int AS total_rooms,
              COALESCE(SUM(r.capacity), 0)::int AS bed_capacity,
              COUNT(a.id) FILTER (WHERE a.status = 'ACTIVE')::int AS occupied_beds,
              COUNT(a.id) FILTER (WHERE a.status = 'PENDING')::int AS pending_allocations,
              (SELECT COUNT(*)::int FROM hostel_complaints WHERE status IN ('OPEN','IN_PROGRESS')) AS open_complaints,
              (SELECT COUNT(*)::int FROM hostel_room_change_requests WHERE status = 'PENDING') AS pending_room_changes
       FROM hostel_rooms r
       LEFT JOIN hostel_allocations a ON a.room_id = r.id AND a.status IN ('ACTIVE','PENDING')`,
    ),
  ]);
  const c = (counts[0] ?? {}) as Record<string, number>;
  const capacity = Number(c.bed_capacity ?? 0);
  const occupied = Number(c.occupied_beds ?? 0);
  return {
    hostels,
    totals: {
      totalRooms: Number(c.total_rooms ?? 0),
      occupiedBeds: occupied,
      vacantBeds: Math.max(0, capacity - occupied),
      occupancyPercentage: capacity > 0 ? Math.round((occupied / capacity) * 1000) / 10 : 0,
      pendingAllocations: Number(c.pending_allocations ?? 0),
      openComplaints: Number(c.open_complaints ?? 0),
      pendingRoomChanges: Number(c.pending_room_changes ?? 0),
    },
  };
}

export async function createHostel(input: CreateHostelInput) {
  try {
    const rows = await query(
      `INSERT INTO hostels (name, block, category, warden_name) VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.name.trim(), input.block.trim(), input.category, input.wardenName?.trim() || null],
    );
    return rows[0];
  } catch (error) {
    throw pgConflict(error, "A hostel with this name already exists");
  }
}

// -------------------------------------------------------------------- rooms

export async function listRooms(hostelId?: string, status?: string): Promise<HostelRoom[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (hostelId) {
    conditions.push(`r.hostel_id = $${params.length + 1}`);
    params.push(hostelId);
  }
  if (status) {
    conditions.push(`r.status = $${params.length + 1}`);
    params.push(status);
  }
  const rows = await query(
    `SELECT r.id, r.hostel_id, h.name AS hostel_name, r.room_number, r.floor,
            r.room_type, r.capacity, r.status,
            COUNT(a.id) FILTER (WHERE a.status = 'ACTIVE')::int AS occupied_beds,
            COALESCE(json_agg(json_build_object(
              'studentId', st.id, 'studentNo', st.student_no, 'name', u.name, 'bedNumber', a.bed_number
            ) ORDER BY a.bed_number) FILTER (WHERE a.status = 'ACTIVE'), '[]') AS occupants
     FROM hostel_rooms r
     JOIN hostels h ON h.id = r.hostel_id
     LEFT JOIN hostel_allocations a ON a.room_id = r.id AND a.status = 'ACTIVE'
     LEFT JOIN students st ON st.id = a.student_id
     LEFT JOIN users u ON u.id = st.user_id
     ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
     GROUP BY r.id, r.hostel_id, h.name, r.room_number, r.floor, r.room_type, r.capacity, r.status
     ORDER BY h.name ASC, r.room_number ASC
     LIMIT 200`,
    params,
  );
  return rows.map((row) => ({
    id: row.id as string,
    hostelId: row.hostel_id as string,
    hostelName: row.hostel_name as string,
    roomNumber: row.room_number as string,
    floor: Number(row.floor),
    roomType: row.room_type as HostelRoom["roomType"],
    capacity: Number(row.capacity),
    status: row.status as HostelRoom["status"],
    occupiedBeds: Number(row.occupied_beds),
    occupants: (row.occupants as HostelRoom["occupants"]) ?? [],
  }));
}

export async function createRoom(input: CreateRoomInput) {
  try {
    const rows = await query(
      `INSERT INTO hostel_rooms (hostel_id, room_number, floor, room_type, capacity)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [input.hostelId, input.roomNumber.trim(), input.floor, input.roomType, input.capacity],
    );
    return rows[0];
  } catch (error) {
    throw pgConflict(error, "This room number already exists in the hostel");
  }
}

// -------------------------------------------------------------- allocations

async function allocateInTx(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  profileId: string,
  roomId: string,
  bedNumber: number,
) {
  const room = await client.query(`SELECT id, capacity FROM hostel_rooms WHERE id = $1 FOR UPDATE`, [roomId]);
  if (room.rows.length === 0) throw ApiError.notFound("Room not found");
  const existing = await client.query(
    `SELECT id FROM hostel_allocations WHERE student_id = $1 AND status = 'ACTIVE'`,
    [profileId],
  );
  if (existing.rows.length > 0) {
    throw ApiError.conflict("Student already has an active hostel allocation", "ALLOCATION_CONFLICT");
  }
  try {
    const inserted = await client.query(
      `INSERT INTO hostel_allocations (room_id, student_id, bed_number, status)
       VALUES ($1, $2, $3, 'ACTIVE') RETURNING *`,
      [roomId, profileId, bedNumber],
    );
    return inserted.rows[0];
  } catch (error) {
    throw pgConflict(error, "Bed is already occupied");
  }
}

export async function allocateStudent(input: AllocateInput) {
  const profile = await requireProfileByNo(input.studentNo);
  return withTransaction(async (client) => allocateInTx(client, profile.id, input.roomId, input.bedNumber));
}

export async function vacateAllocation(allocationId: string) {
  const rows = await query(
    `UPDATE hostel_allocations SET status = 'VACATED', vacated_on = CURRENT_DATE
     WHERE id = $1 AND status = 'ACTIVE' RETURNING *`,
    [allocationId],
  );
  if (rows.length === 0) throw ApiError.notFound("Active allocation not found");
  return rows[0];
}

export async function transferAllocation(allocationId: string, roomId: string, bedNumber: number) {
  return withTransaction(async (client) => {
    const current = await client.query(`SELECT * FROM hostel_allocations WHERE id = $1 FOR UPDATE`, [allocationId]);
    if (current.rows.length === 0 || current.rows[0].status !== "ACTIVE") {
      throw ApiError.notFound("Active allocation not found");
    }
    const profileId = current.rows[0].student_id as string;
    await client.query(
      `UPDATE hostel_allocations SET status = 'VACATED', vacated_on = CURRENT_DATE WHERE id = $1`,
      [allocationId],
    );
    try {
      return await allocateInTx(client, profileId, roomId, bedNumber);
    } catch (error) {
      throw error;
    }
  });
}

export async function listAllocations(hostelId?: string, status?: string): Promise<HostelAllocation[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (hostelId) {
    conditions.push(`r.hostel_id = $${params.length + 1}`);
    params.push(hostelId);
  }
  if (status) {
    conditions.push(`a.status = $${params.length + 1}`);
    params.push(status);
  }
  const rows = await query(
    `SELECT a.id, a.room_id, r.room_number, r.hostel_id, h.name AS hostel_name,
            a.student_id, st.student_no, u.name AS student_name,
            a.bed_number, a.allocated_on, a.vacated_on, a.status
     FROM hostel_allocations a
     JOIN hostel_rooms r ON r.id = a.room_id
     JOIN hostels h ON h.id = r.hostel_id
     JOIN students st ON st.id = a.student_id
     JOIN users u ON u.id = st.user_id
     ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY a.allocated_on DESC, u.name ASC
     LIMIT 200`,
    params,
  );
  return rows.map((row) => ({
    id: row.id as string,
    roomId: row.room_id as string,
    roomNumber: row.room_number as string,
    hostelId: row.hostel_id as string,
    hostelName: row.hostel_name as string,
    studentId: row.student_id as string,
    studentNo: row.student_no as string,
    studentName: row.student_name as string,
    bedNumber: Number(row.bed_number),
    allocatedOn: toLocalDateString(row.allocated_on as string),
    vacatedOn: row.vacated_on ? toLocalDateString(row.vacated_on as string) : null,
    status: row.status as HostelAllocation["status"],
  }));
}

/** Privacy-safe room list for students: vacancy info only, no occupant names. */
export async function listRoomsForStudents(hostelId?: string, status?: string) {
  const rooms = await listRooms(hostelId, status);
  return rooms.map((room) => ({
    id: room.id,
    hostelId: room.hostelId,
    hostelName: room.hostelName,
    roomNumber: room.roomNumber,
    floor: room.floor,
    roomType: room.roomType,
    capacity: room.capacity,
    status: room.status,
    occupiedBeds: room.occupiedBeds,
    vacantBeds: Math.max(0, room.capacity - room.occupiedBeds),
  }));
}

// ------------------------------------------------------------------ student

export async function getMyHostel(userId: string): Promise<MyHostel> {
  const profileId = await requireStudentProfile(userId);
  const alloc = await queryOne<{
    id: string;
    bed_number: number;
    allocated_on: string;
    room_id: string;
    room_number: string;
    floor: number;
    room_type: HostelRoom["roomType"];
    capacity: number;
    hostel_id: string;
    hostel_name: string;
    block: string;
    warden_name: string | null;
  }>(
    `SELECT a.id, a.bed_number, a.allocated_on,
            r.id AS room_id, r.room_number, r.floor, r.room_type, r.capacity,
            h.id AS hostel_id, h.name AS hostel_name, h.block, h.warden_name
     FROM hostel_allocations a
     JOIN hostel_rooms r ON r.id = a.room_id
     JOIN hostels h ON h.id = r.hostel_id
     WHERE a.student_id = $1 AND a.status = 'ACTIVE'`,
    [profileId],
  );
  const feeRows = await query(
    `SELECT id, fee_type, amount, amount_paid, due_date, status FROM fees
     WHERE student_id = $1 AND fee_type ILIKE 'Hostel%' ORDER BY due_date ASC`,
    [profileId],
  );
  const fees: HostelFeeRecord[] = feeRows.map((row) => {
    const amount = Number(row.amount);
    const paid = Number(row.amount_paid);
    return {
      id: row.id as string,
      feeType: row.fee_type as string,
      amount,
      amountPaid: paid,
      balance: Math.max(0, Math.round((amount - paid) * 100) / 100),
      dueDate: toLocalDateString(row.due_date as string),
      status: row.status as string,
    };
  });
  if (!alloc) return { allocation: null, roommates: [], fees };
  const mateRows = await query(
    `SELECT st.student_no, u.name, a.bed_number
     FROM hostel_allocations a
     JOIN students st ON st.id = a.student_id
     JOIN users u ON u.id = st.user_id
     WHERE a.room_id = $1 AND a.status = 'ACTIVE' AND a.student_id <> $2
     ORDER BY a.bed_number ASC`,
    [alloc.room_id, profileId],
  );
  return {
    allocation: {
      id: alloc.id,
      bedNumber: Number(alloc.bed_number),
      allocatedOn: toLocalDateString(alloc.allocated_on),
      room: { id: alloc.room_id, roomNumber: alloc.room_number, floor: Number(alloc.floor), roomType: alloc.room_type, capacity: Number(alloc.capacity) },
      hostel: { id: alloc.hostel_id, name: alloc.hostel_name, block: alloc.block, wardenName: alloc.warden_name },
    },
    roommates: mateRows.map((row) => ({
      studentNo: row.student_no as string,
      name: row.name as string,
      bedNumber: Number(row.bed_number),
    })),
    fees,
  };
}

// --------------------------------------------------------------- complaints

export async function createComplaint(userId: string, category: string, description: string, priority: string) {
  const profileId = await requireStudentProfile(userId);
  const alloc = await queryOne<{ room_id: string }>(
    `SELECT room_id FROM hostel_allocations WHERE student_id = $1 AND status = 'ACTIVE'`,
    [profileId],
  );
  const rows = await query(
    `INSERT INTO hostel_complaints (student_id, room_id, category, description, priority)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [profileId, alloc?.room_id ?? null, category, description.trim(), priority],
  );
  return rows[0];
}

export async function listMyComplaints(userId: string): Promise<HostelComplaint[]> {
  const profileId = await requireStudentProfile(userId);
  return listComplaints({ studentId: profileId });
}

export async function listComplaints(filter: { status?: string; studentId?: string } = {}): Promise<HostelComplaint[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    conditions.push(`c.status = $${params.length + 1}`);
    params.push(filter.status);
  }
  if (filter.studentId) {
    conditions.push(`c.student_id = $${params.length + 1}`);
    params.push(filter.studentId);
  }
  const rows = await query(
    `SELECT c.*, st.student_no, u.name AS student_name, r.room_number
     FROM hostel_complaints c
     JOIN students st ON st.id = c.student_id
     JOIN users u ON u.id = st.user_id
     LEFT JOIN hostel_rooms r ON r.id = c.room_id
     ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY c.created_at DESC LIMIT 200`,
    params,
  );
  return rows.map(mapComplaint);
}

function mapComplaint(row: Record<string, unknown>): HostelComplaint {
  return {
    id: row.id as string,
    studentId: row.student_id as string,
    studentNo: row.student_no as string | undefined,
    studentName: row.student_name as string | undefined,
    roomId: (row.room_id as string | null) ?? null,
    roomNumber: (row.room_number as string | null) ?? null,
    category: row.category as HostelComplaint["category"],
    description: row.description as string,
    status: row.status as HostelComplaint["status"],
    priority: row.priority as HostelComplaint["priority"],
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

export async function updateComplaint(id: string, updates: { status?: string; priority?: string }) {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (updates.status !== undefined) {
    sets.push(`status = $${params.length + 1}`);
    params.push(updates.status);
  }
  if (updates.priority !== undefined) {
    sets.push(`priority = $${params.length + 1}`);
    params.push(updates.priority);
  }
  if (sets.length === 0) throw ApiError.badRequest("No fields to update", "VALIDATION_ERROR");
  if (updates.status === "RESOLVED" || updates.status === "CLOSED") {
    sets.push(`resolved_at = now()`);
  }
  params.push(id);
  const rows = await query(
    `UPDATE hostel_complaints SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  if (rows.length === 0) throw ApiError.notFound("Complaint not found");
  return rows[0];
}

// ------------------------------------------------------------ room changes

export async function createRoomChange(userId: string, requestedRoomId: string | null, reason: string) {
  const profileId = await requireStudentProfile(userId);
  const alloc = await queryOne<{ room_id: string }>(
    `SELECT room_id FROM hostel_allocations WHERE student_id = $1 AND status = 'ACTIVE'`,
    [profileId],
  );
  if (!alloc) throw ApiError.badRequest("Only students with an active allocation can request a room change", "VALIDATION_ERROR");
  if (requestedRoomId) {
    const room = await queryOne<{ id: string }>(`SELECT id FROM hostel_rooms WHERE id = $1`, [requestedRoomId]);
    if (!room) throw ApiError.notFound("Requested room not found");
    if (requestedRoomId === alloc.room_id) {
      throw ApiError.badRequest("Requested room is the current room", "VALIDATION_ERROR");
    }
  }
  const pending = await queryOne<{ id: string }>(
    `SELECT id FROM hostel_room_change_requests WHERE student_id = $1 AND status = 'PENDING'`,
    [profileId],
  );
  if (pending) throw ApiError.conflict("A pending room-change request already exists", "DUPLICATE_RESOURCE");
  const rows = await query(
    `INSERT INTO hostel_room_change_requests (student_id, current_room_id, requested_room_id, reason)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [profileId, alloc.room_id, requestedRoomId, reason.trim()],
  );
  return rows[0];
}

export async function listMyRoomChanges(userId: string): Promise<RoomChangeRequest[]> {
  const profileId = await requireStudentProfile(userId);
  return listRoomChanges({ studentId: profileId });
}

export async function listRoomChanges(filter: { status?: string; studentId?: string } = {}): Promise<RoomChangeRequest[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    conditions.push(`rc.status = $${params.length + 1}`);
    params.push(filter.status);
  }
  if (filter.studentId) {
    conditions.push(`rc.student_id = $${params.length + 1}`);
    params.push(filter.studentId);
  }
  const rows = await query(
    `SELECT rc.*, st.student_no, u.name AS student_name, r1.room_number AS current_room_number,
            r2.room_number AS requested_room_number
     FROM hostel_room_change_requests rc
     JOIN students st ON st.id = rc.student_id
     JOIN users u ON u.id = st.user_id
     JOIN hostel_rooms r1 ON r1.id = rc.current_room_id
     LEFT JOIN hostel_rooms r2 ON r2.id = rc.requested_room_id
     ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY rc.created_at DESC LIMIT 200`,
    params,
  );
  return rows.map((row) => ({
    id: row.id as string,
    studentId: row.student_id as string,
    studentNo: row.student_no as string | undefined,
    studentName: row.student_name as string | undefined,
    currentRoomId: row.current_room_id as string,
    currentRoomNumber: row.current_room_number as string | undefined,
    requestedRoomId: (row.requested_room_id as string | null) ?? null,
    requestedRoomNumber: (row.requested_room_number as string | null) ?? null,
    reason: row.reason as string,
    status: row.status as RoomChangeRequest["status"],
    createdAt: new Date(row.created_at as string).toISOString(),
  }));
}

async function freeBedInTx(
  client: { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  roomId: string,
): Promise<number> {
  const room = await client.query(`SELECT capacity FROM hostel_rooms WHERE id = $1 FOR UPDATE`, [roomId]);
  if (room.rows.length === 0) throw ApiError.notFound("Requested room not found");
  const capacity = Number(room.rows[0].capacity);
  const taken = await client.query(
    `SELECT bed_number FROM hostel_allocations WHERE room_id = $1 AND status = 'ACTIVE' ORDER BY bed_number ASC`,
    [roomId],
  );
  const used = new Set(taken.rows.map((r) => Number(r.bed_number)));
  for (let bed = 1; bed <= capacity; bed += 1) {
    if (!used.has(bed)) return bed;
  }
  throw ApiError.conflict("Requested room has no vacant bed", "ALLOCATION_CONFLICT");
}

export async function reviewRoomChange(requestId: string, reviewerId: string, status: "APPROVED" | "REJECTED") {
  return withTransaction(async (client) => {
    const found = await client.query(`SELECT * FROM hostel_room_change_requests WHERE id = $1 FOR UPDATE`, [requestId]);
    if (found.rows.length === 0) throw ApiError.notFound("Room-change request not found");
    const request = found.rows[0];
    if (request.status !== "PENDING") throw ApiError.badRequest("Request has already been reviewed", "VALIDATION_ERROR");
    if (status === "REJECTED") {
      const updated = await client.query(
        `UPDATE hostel_room_change_requests SET status = 'REJECTED', reviewed_by = $1 WHERE id = $2 RETURNING *`,
        [reviewerId, requestId],
      );
      return updated.rows[0];
    }
    // APPROVED: backend executes the move — never the student.
    const profileId = request.student_id as string;
    let targetRoomId = request.requested_room_id as string | null;
    if (!targetRoomId) {
      // "Any room": first room with vacancy in the same hostel as current room.
      const current = await client.query(
        `SELECT hostel_id FROM hostel_rooms WHERE id = $1`,
        [request.current_room_id],
      );
      const candidates = await client.query(
        `SELECT r.id FROM hostel_rooms r
         WHERE r.hostel_id = $1 AND r.status = 'AVAILABLE'
           AND (SELECT count(*) FROM hostel_allocations a WHERE a.room_id = r.id AND a.status = 'ACTIVE') < r.capacity
         ORDER BY r.room_number ASC LIMIT 1`,
        [current.rows[0]?.hostel_id],
      );
      if (candidates.rows.length === 0) throw ApiError.conflict("No vacant room available", "ALLOCATION_CONFLICT");
      targetRoomId = candidates.rows[0].id as string;
    }
    const active = await client.query(
      `SELECT id FROM hostel_allocations WHERE student_id = $1 AND status = 'ACTIVE' FOR UPDATE`,
      [profileId],
    );
    if (active.rows.length === 0) throw ApiError.badRequest("Student has no active allocation to move", "VALIDATION_ERROR");
    const bed = await freeBedInTx(client, targetRoomId);
    await client.query(
      `UPDATE hostel_allocations SET status = 'VACATED', vacated_on = CURRENT_DATE WHERE id = $1`,
      [active.rows[0].id],
    );
    await client.query(
      `INSERT INTO hostel_allocations (room_id, student_id, bed_number, status) VALUES ($1, $2, $3, 'ACTIVE')`,
      [targetRoomId, profileId, bed],
    );
    const updated = await client.query(
      `UPDATE hostel_room_change_requests SET status = 'APPROVED', reviewed_by = $1 WHERE id = $2 RETURNING *`,
      [reviewerId, requestId],
    );
    return updated.rows[0];
  });
}

// ---------------------------------------------------------------- visitors

export async function createVisitor(userId: string, visitorName: string, relation: string, visitDate: string, visitTime: string | null) {
  const profileId = await requireStudentProfile(userId);
  const visit = new Date(`${visitDate}T00:00:00`);
  if (Number.isNaN(visit.getTime())) throw ApiError.badRequest("Invalid visit date", "VALIDATION_ERROR");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (visit < today) throw ApiError.badRequest("Visit date cannot be in the past", "VALIDATION_ERROR");
  const rows = await query(
    `INSERT INTO hostel_visitors (student_id, visitor_name, relation, visit_date, visit_time)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [profileId, visitorName.trim(), relation.trim() || "Family", visitDate, visitTime || null],
  );
  return rows[0];
}

export async function listMyVisitors(userId: string) {
  const profileId = await requireStudentProfile(userId);
  return listVisitors({ studentId: profileId });
}

export async function listVisitors(filter: { status?: string; studentId?: string } = {}) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    conditions.push(`v.status = $${params.length + 1}`);
    params.push(filter.status);
  }
  if (filter.studentId) {
    conditions.push(`v.student_id = $${params.length + 1}`);
    params.push(filter.studentId);
  }
  const rows = await query(
    `SELECT v.*, st.student_no, u.name AS student_name
     FROM hostel_visitors v
     JOIN students st ON st.id = v.student_id
     JOIN users u ON u.id = st.user_id
     ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY v.visit_date DESC, v.created_at DESC LIMIT 200`,
    params,
  );
  return rows.map((row) => ({
    id: row.id as string,
    studentId: row.student_id as string,
    studentNo: row.student_no as string | undefined,
    studentName: row.student_name as string | undefined,
    visitorName: row.visitor_name as string,
    relation: row.relation as string,
    visitDate: toLocalDateString(row.visit_date as string),
    visitTime: (row.visit_time as string | null) ? String(row.visit_time).slice(0, 5) : null,
    status: row.status as HostelVisitor["status"],
    createdAt: new Date(row.created_at as string).toISOString(),
  }));
}

export async function updateVisitor(id: string, status: string) {
  const rows = await query(`UPDATE hostel_visitors SET status = $1 WHERE id = $2 RETURNING *`, [status, id]);
  if (rows.length === 0) throw ApiError.notFound("Visitor request not found");
  return rows[0];
}
