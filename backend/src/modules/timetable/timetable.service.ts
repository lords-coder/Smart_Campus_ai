import type { PoolClient } from "pg";
import { query, queryOne, withTransaction } from "../../config/db";
import { ApiError } from "../../utils/ApiError";
import type { Role } from "../../utils/roles";
import type {
  CreateTimetableInput,
  TimetableListQuery,
  UpdateTimetableInput,
} from "./timetable.schemas";
import {
  TimetableArchiveResult,
  TimetableConflict,
  TimetableDeleteResult,
  TimetableEntryView,
  TimetableList,
  TimetableOptions,
  TimetableDayName,
} from "./timetable.types";

export interface ActingUser {
  id: string;
  role: Role;
}

interface EntryRow {
  id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  room: string;
  section: string;
  semester: number;
  department: string;
  is_active: boolean;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
  course_id: string;
  code: string;
  name: string;
  credits: number;
  faculty_id: string | null;
  faculty_name: string | null;
  student_count: number;
  attendance_count: number;
}

interface ConflictRow {
  id: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  room: string;
  section: string;
  semester: number;
  faculty_id: string | null;
  code: string;
  name: string;
  faculty_name: string | null;
}

interface CourseRow {
  id: string;
  code: string;
  name: string;
  credits: number;
  semester: number;
  department: string;
}

/**
 * Single session-scoped key: every timetable write (create/update/archive)
 * takes this advisory lock inside its transaction, so two concurrent requests
 * can never both pass the conflict check and then both write. Writes are rare,
 * so serialising them is the simplest correct choice at this scale.
 */
const TIMETABLE_WRITE_LOCK = 772_003;

const DAY_ORDER = `CASE t.day_of_week
  WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
  WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 ELSE 7 END`;

const ENTRY_SELECT = `
  SELECT t.id, t.day_of_week, t.start_time, t.end_time, t.room, t.section, t.semester,
         t.department, t.is_active, t.archived_at, t.created_at, t.updated_at,
         t.course_id, c.code, c.name, c.credits,
         t.faculty_id, u.name AS faculty_name,
         (SELECT count(*)::int
            FROM enrollments e
            JOIN students s ON s.id = e.student_id
           WHERE e.course_id = t.course_id
             AND e.status = 'ACTIVE'
             AND s.section = t.section
             AND s.semester = t.semester) AS student_count,
         (SELECT count(*)::int
            FROM attendance a
            JOIN students s ON s.id = a.student_id
           WHERE a.course_id = t.course_id
             AND s.section = t.section
             AND s.semester = t.semester) AS attendance_count
    FROM timetable_entries t
    JOIN courses c ON c.id = t.course_id
    LEFT JOIN faculties f ON f.id = t.faculty_id
    LEFT JOIN users u ON u.id = f.user_id
`;

const hhmm = (value: string): string => value.slice(0, 5);

function toEntry(row: EntryRow): TimetableEntryView {
  return {
    id: row.id,
    day: row.day_of_week as TimetableDayName,
    startTime: hhmm(row.start_time),
    endTime: hhmm(row.end_time),
    room: row.room,
    section: row.section,
    semester: row.semester,
    department: row.department,
    isActive: row.is_active,
    archivedAt: row.archived_at ? row.archived_at.toISOString() : null,
    studentCount: row.student_count,
    attendanceRecordCount: row.attendance_count,
    course: { id: row.course_id, code: row.code, name: row.name, credits: row.credits },
    faculty: row.faculty_id && row.faculty_name ? { id: row.faculty_id, name: row.faculty_name } : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function facultyProfileId(userId: string): Promise<string | null> {
  const row = await queryOne<{ id: string }>("SELECT id FROM faculties WHERE user_id = $1", [userId]);
  return row?.id ?? null;
}

async function loadEntryRow(entryId: string, client?: PoolClient): Promise<EntryRow | null> {
  const sql = `${ENTRY_SELECT} WHERE t.id = $1`;
  if (client) {
    const result = await client.query<EntryRow>(sql, [entryId]);
    return result.rows[0] ?? null;
  }
  return queryOne<EntryRow>(sql, [entryId]);
}

async function loadCourse(client: PoolClient, courseId: string): Promise<CourseRow> {
  const result = await client.query<CourseRow>(
    "SELECT id, code, name, credits, semester, department FROM courses WHERE id = $1",
    [courseId],
  );
  const course = result.rows[0];
  if (!course) {
    throw ApiError.notFound("Course not found");
  }
  return course;
}

async function loadFaculty(client: PoolClient, facultyId: string): Promise<{ id: string; name: string }> {
  const result = await client.query<{ id: string; name: string }>(
    `SELECT f.id, u.name FROM faculties f JOIN users u ON u.id = f.user_id WHERE f.id = $1`,
    [facultyId],
  );
  const faculty = result.rows[0];
  if (!faculty) {
    throw ApiError.notFound("Faculty member not found");
  }
  return faculty;
}

/**
 * A timetable entry must point at a real class: there have to be students in
 * that section for the course's semester (student timetables and attendance
 * rosters are both keyed by section + semester).
 */
async function assertSectionExists(client: PoolClient, section: string, semester: number): Promise<void> {
  const result = await client.query<{ ok: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM students WHERE section = $1 AND semester = $2) AS ok",
    [section, semester],
  );
  if (!result.rows[0]?.ok) {
    throw ApiError.badRequest(
      `No students are enrolled in section ${section} for semester ${semester}`,
      "INVALID_SECTION",
      { section, semester },
    );
  }
}

function assertTimeOrder(startTime: string, endTime: string): void {
  if (startTime >= endTime) {
    throw ApiError.badRequest("End time must be after the start time", "VALIDATION_ERROR", {
      path: "endTime",
    });
  }
}

interface Candidate {
  day: string;
  startTime: string;
  endTime: string;
  room: string;
  section: string;
  semester: number;
  facultyId: string | null;
}

/**
 * Overlap: start_time < newEnd AND end_time > newStart (touching slots such as
 * 10:00-11:00 and 11:00-12:00 are allowed). Archived entries never conflict.
 * `excludeId` lets an update skip itself so editing a slot cannot conflict with
 * the very row being edited.
 */
async function findConflicts(
  client: PoolClient,
  candidate: Candidate,
  excludeId: string | null,
): Promise<TimetableConflict[]> {
  const result = await client.query<ConflictRow>(
    `SELECT t.id, t.day_of_week, t.start_time, t.end_time, t.room, t.section, t.semester,
            t.faculty_id, c.code, c.name, u.name AS faculty_name
       FROM timetable_entries t
       JOIN courses c ON c.id = t.course_id
       LEFT JOIN faculties f ON f.id = t.faculty_id
       LEFT JOIN users u ON u.id = f.user_id
      WHERE t.is_active = true
        AND t.day_of_week = $1
        AND t.start_time < $2::time
        AND t.end_time > $3::time
        AND ($4::uuid IS NULL OR t.id <> $4)
        AND (
             ($5::uuid IS NOT NULL AND t.faculty_id = $5)
          OR lower(btrim(t.room)) = lower(btrim($6::text))
          OR (t.section = $7 AND t.semester = $8)
        )
      ORDER BY t.start_time`,
    [
      candidate.day,
      candidate.endTime,
      candidate.startTime,
      excludeId,
      candidate.facultyId,
      candidate.room,
      candidate.section,
      candidate.semester,
    ],
  );

  const conflicts: TimetableConflict[] = [];

  for (const row of result.rows) {
    const base = {
      entryId: row.id,
      day: row.day_of_week as TimetableDayName,
      startTime: hhmm(row.start_time),
      endTime: hhmm(row.end_time),
      room: row.room,
      section: row.section,
      courseCode: row.code,
      facultyName: row.faculty_name,
    };

    if (candidate.facultyId && row.faculty_id === candidate.facultyId) {
      conflicts.push({
        ...base,
        type: "FACULTY",
        message: `${row.faculty_name ?? "This faculty member"} already teaches ${row.code} on ${row.day_of_week} ${hhmm(row.start_time)}-${hhmm(row.end_time)} (Section ${row.section})`,
      });
    }
    if (row.room.trim().toLowerCase() === candidate.room.trim().toLowerCase()) {
      conflicts.push({
        ...base,
        type: "ROOM",
        message: `Room ${row.room} is already booked on ${row.day_of_week} ${hhmm(row.start_time)}-${hhmm(row.end_time)} by ${row.code} (Section ${row.section})`,
      });
    }
    if (row.section === candidate.section && row.semester === candidate.semester) {
      conflicts.push({
        ...base,
        type: "SECTION",
        message: `Section ${row.section} already has ${row.code} on ${row.day_of_week} ${hhmm(row.start_time)}-${hhmm(row.end_time)} in ${row.room}`,
      });
    }
  }

  return conflicts;
}

function throwConflicts(conflicts: TimetableConflict[]): never {
  const conflictTypes = [...new Set(conflicts.map((conflict) => conflict.type))];
  const shown = conflicts.slice(0, 3).map((conflict) => conflict.message);
  const suffix = conflicts.length > 3 ? ` (+${conflicts.length - 3} more)` : "";
  throw ApiError.conflict(`${shown.join(" · ")}${suffix}`, "TIMETABLE_CONFLICT", {
    conflictTypes,
    conflicts,
  });
}

async function exactDuplicate(
  client: PoolClient,
  courseId: string,
  day: string,
  startTime: string,
  section: string,
): Promise<{ id: string; is_active: boolean } | null> {
  const result = await client.query<{ id: string; is_active: boolean }>(
    `SELECT id, is_active FROM timetable_entries
      WHERE course_id = $1 AND day_of_week = $2 AND start_time = $3::time AND section = $4
      LIMIT 1`,
    [courseId, day, startTime, section],
  );
  return result.rows[0] ?? null;
}

async function writeEntry(
  client: PoolClient,
  values: {
    courseId: string;
    facultyId: string | null;
    section: string;
    room: string;
    day: string;
    startTime: string;
    endTime: string;
    semester: number;
    department: string;
    isActive: boolean;
  },
): Promise<EntryRow> {
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO timetable_entries
       (course_id, faculty_id, room, day_of_week, start_time, end_time, section, semester, department, is_active)
     VALUES ($1, $2, $3, $4, $5::time, $6::time, $7, $8, $9, $10)
     RETURNING id`,
    [
      values.courseId,
      values.facultyId,
      values.room,
      values.day,
      values.startTime,
      values.endTime,
      values.section,
      values.semester,
      values.department,
      values.isActive,
    ],
  );
  const row = await loadEntryRow(inserted.rows[0].id, client);
  if (!row) throw ApiError.notFound("Timetable entry not found");
  return row;
}

export async function listEntries(
  user: ActingUser,
  filters: TimetableListQuery,
): Promise<TimetableList> {
  if (user.role === "STUDENT") {
    throw ApiError.forbidden("Students cannot read the timetable register");
  }

  const params: unknown[] = [];
  const where: string[] = [];
  const add = (clause: string, value: unknown): void => {
    params.push(value);
    where.push(clause.replace("$n", `$${params.length}`));
  };

  if (user.role === "FACULTY") {
    // Faculty only ever see their own classes; a crafted facultyId filter is ignored.
    const profileId = await facultyProfileId(user.id);
    if (!profileId) return { entries: [], total: 0 };
    add("t.faculty_id = $n", profileId);
  } else if (filters.facultyId) {
    add("t.faculty_id = $n", filters.facultyId);
  }

  if (filters.day) add("t.day_of_week = $n", filters.day);
  if (filters.courseId) add("t.course_id = $n", filters.courseId);
  if (filters.section) add("t.section = $n", filters.section);
  if (filters.room) add("lower(t.room) LIKE $n", `%${filters.room.toLowerCase()}%`);
  if (filters.status === "ACTIVE") where.push("t.is_active = true");
  if (filters.status === "ARCHIVED") where.push("t.is_active = false");

  const rows = await query<EntryRow>(
    `${ENTRY_SELECT}
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY ${DAY_ORDER}, t.start_time, t.room
     LIMIT 1000`,
    params,
  );

  return { entries: rows.map(toEntry), total: rows.length };
}

export async function getEntry(user: ActingUser, entryId: string): Promise<TimetableEntryView> {
  if (user.role === "STUDENT") {
    throw ApiError.forbidden("Students cannot read timetable records");
  }

  const row = await loadEntryRow(entryId);
  if (!row) throw ApiError.notFound("Timetable entry not found");

  if (user.role === "FACULTY") {
    const profileId = await facultyProfileId(user.id);
    if (!profileId || row.faculty_id !== profileId) {
      throw ApiError.forbidden("You are not assigned to this timetable entry");
    }
  }

  return toEntry(row);
}

export async function getOptions(): Promise<TimetableOptions> {
  const [courses, faculties, sections] = await Promise.all([
    query<CourseRow>(
      `SELECT id, code, name, credits, semester, department
         FROM courses ORDER BY code`,
    ),
    query<{ id: string; name: string; department: string }>(
      `SELECT f.id, u.name, f.department
         FROM faculties f JOIN users u ON u.id = f.user_id
        ORDER BY u.name`,
    ),
    query<{ section: string; semester: number; student_count: number }>(
      `SELECT section, semester, count(*)::int AS student_count
         FROM students
        GROUP BY section, semester
        ORDER BY semester, section`,
    ),
  ]);

  return {
    courses: courses.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      credits: row.credits,
      semester: row.semester,
      department: row.department,
    })),
    faculties: faculties.map((row) => ({ id: row.id, name: row.name, department: row.department })),
    sections: sections.map((row) => ({
      section: row.section,
      semester: row.semester,
      studentCount: row.student_count,
    })),
  };
}

export async function createEntry(input: CreateTimetableInput): Promise<TimetableEntryView> {
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [TIMETABLE_WRITE_LOCK]);

    const course = await loadCourse(client, input.courseId);
    await loadFaculty(client, input.facultyId);
    await assertSectionExists(client, input.section, course.semester);
    assertTimeOrder(input.startTime, input.endTime);

    const candidate: Candidate = {
      day: input.day,
      startTime: input.startTime,
      endTime: input.endTime,
      room: input.room,
      section: input.section,
      semester: course.semester,
      facultyId: input.facultyId,
    };

    const conflicts = await findConflicts(client, candidate, null);
    if (conflicts.length > 0) throwConflicts(conflicts);

    const duplicate = await exactDuplicate(
      client,
      input.courseId,
      input.day,
      input.startTime,
      input.section,
    );

    if (duplicate && duplicate.is_active) {
      // Unreachable in practice (an active twin is a SECTION conflict) but never
      // let the DB unique constraint surface as a raw error.
      throw ApiError.conflict(
        "An identical timetable slot already exists for this course, day and time",
        "TIMETABLE_CONFLICT",
        { conflictTypes: ["SECTION"], entryId: duplicate.id },
      );
    }

    if (duplicate) {
      // Revive the archived twin instead of failing on UNIQUE(course, day, start, section).
      await client.query(
        `UPDATE timetable_entries
            SET course_id = $1, faculty_id = $2, room = $3, day_of_week = $4,
                start_time = $5::time, end_time = $6::time, section = $7, semester = $8,
                department = $9, is_active = true, archived_at = NULL
          WHERE id = $10`,
        [
          input.courseId,
          input.facultyId,
          input.room,
          input.day,
          input.startTime,
          input.endTime,
          input.section,
          course.semester,
          course.department,
          duplicate.id,
        ],
      );
      const revived = await loadEntryRow(duplicate.id, client);
      if (!revived) throw ApiError.notFound("Timetable entry not found");
      return toEntry(revived);
    }

    const created = await writeEntry(client, {
      courseId: input.courseId,
      facultyId: input.facultyId,
      section: input.section,
      room: input.room,
      day: input.day,
      startTime: input.startTime,
      endTime: input.endTime,
      semester: course.semester,
      department: course.department,
      isActive: true,
    });
    return toEntry(created);
  });
}

export async function updateEntry(
  entryId: string,
  patch: UpdateTimetableInput,
): Promise<TimetableEntryView> {
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [TIMETABLE_WRITE_LOCK]);

    const lock = await client.query("SELECT id FROM timetable_entries WHERE id = $1 FOR UPDATE", [entryId]);
    if (!lock.rows[0]) throw ApiError.notFound("Timetable entry not found");

    const current = await loadEntryRow(entryId, client);
    if (!current) throw ApiError.notFound("Timetable entry not found");

    const courseId = patch.courseId ?? current.course_id;
    const course =
      courseId === current.course_id
        ? {
            id: current.course_id,
            code: current.code,
            name: current.name,
            credits: current.credits,
            semester: current.semester,
            department: current.department,
          }
        : await loadCourse(client, courseId);

    const facultyId =
      patch.facultyId !== undefined ? patch.facultyId : current.faculty_id;
    if (facultyId) await loadFaculty(client, facultyId);

    const section = patch.section ?? current.section;
    const room = patch.room ?? current.room;
    const day = patch.day ?? current.day_of_week;
    const startTime = patch.startTime ?? hhmm(current.start_time);
    const endTime = patch.endTime ?? hhmm(current.end_time);
    const isActive = patch.isActive ?? current.is_active;

    await assertSectionExists(client, section, course.semester);
    assertTimeOrder(startTime, endTime);

    const candidate: Candidate = {
      day,
      startTime,
      endTime,
      room,
      section,
      semester: course.semester,
      facultyId,
    };

    const conflicts = await findConflicts(client, candidate, entryId);
    if (conflicts.length > 0) throwConflicts(conflicts);

    const duplicate = await exactDuplicate(client, courseId, day, startTime, section);
    if (duplicate && duplicate.id !== entryId) {
      throw ApiError.conflict(
        duplicate.is_active
          ? "An identical timetable slot already exists for this course, day and time"
          : "An archived timetable slot already uses this course, day, time and section",
        "TIMETABLE_CONFLICT",
        { conflictTypes: ["SECTION"], entryId: duplicate.id },
      );
    }

    await client.query(
      `UPDATE timetable_entries
          SET course_id = $1, faculty_id = $2, room = $3, day_of_week = $4,
              start_time = $5::time, end_time = $6::time, section = $7, semester = $8,
              department = $9, is_active = $10,
              archived_at = CASE
                WHEN $10 = true THEN NULL
                WHEN archived_at IS NULL THEN now()
                ELSE archived_at
              END
        WHERE id = $11`,
      [
        courseId,
        facultyId,
        room,
        day,
        startTime,
        endTime,
        section,
        course.semester,
        course.department,
        isActive,
        entryId,
      ],
    );

    const updated = await loadEntryRow(entryId, client);
    if (!updated) throw ApiError.notFound("Timetable entry not found");
    return toEntry(updated);
  });
}

/**
 * DELETE is an archive by default: attendance rows are NOT foreign-keyed to
 * timetable_entries, so history never breaks - but archiving keeps the slot
 * restorable and immediately hides it from students, faculty and attendance.
 * Permanent deletion is only allowed when no attendance history relates to the
 * class (course + section + semester); otherwise DEPENDENCY_CONFLICT explains why.
 */
export async function archiveOrDelete(
  entryId: string,
  permanent: boolean,
): Promise<TimetableArchiveResult | TimetableDeleteResult> {
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [TIMETABLE_WRITE_LOCK]);

    const lock = await client.query("SELECT id FROM timetable_entries WHERE id = $1 FOR UPDATE", [entryId]);
    if (!lock.rows[0]) throw ApiError.notFound("Timetable entry not found");

    const current = await loadEntryRow(entryId, client);
    if (!current) throw ApiError.notFound("Timetable entry not found");

    const relatedAttendance = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM attendance a
         JOIN students s ON s.id = a.student_id
        WHERE a.course_id = $1 AND s.section = $2 AND s.semester = $3`,
      [current.course_id, current.section, current.semester],
    );
    const attendanceRecords = relatedAttendance.rows[0]?.count ?? 0;

    if (permanent) {
      if (attendanceRecords > 0) {
        throw ApiError.conflict(
          `This class has ${attendanceRecords} attendance records. Archive it instead so history is preserved.`,
          "DEPENDENCY_CONFLICT",
          { attendanceRecords, remediation: "ARCHIVE" },
        );
      }
      await client.query("DELETE FROM timetable_entries WHERE id = $1", [entryId]);
      return { entryId, deleted: true as const };
    }

    if (current.is_active) {
      await client.query(
        "UPDATE timetable_entries SET is_active = false, archived_at = now() WHERE id = $1",
        [entryId],
      );
    }

    const archived = await loadEntryRow(entryId, client);
    if (!archived) throw ApiError.notFound("Timetable entry not found");

    return {
      entry: toEntry(archived),
      archived: true as const,
      preservedAttendanceRecords: attendanceRecords,
    };
  });
}
