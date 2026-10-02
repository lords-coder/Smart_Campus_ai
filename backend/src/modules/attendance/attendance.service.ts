import { query, queryOne, withTransaction } from "../../config/db";
import { ApiError } from "../../utils/ApiError";
import { toDateString } from "../../utils/date";
import type { Role } from "../../utils/roles";
import type { SubmitAttendanceInput } from "./attendance.schemas";
import {
  AttendanceSubmitResult,
  ClassAttendanceState,
  ClassSummary,
  RosterStudent,
  countBy,
} from "./attendance.types";

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
  is_active: boolean;
  faculty_id: string | null;
  course_id: string;
  code: string;
  name: string;
  faculty_name: string | null;
  student_count: number;
}

const DAY_ORDER = `CASE t.day_of_week
    WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
    WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 ELSE 7 END`;

const ENTRY_SELECT = `
  SELECT t.id, t.day_of_week, t.start_time, t.end_time, t.room, t.section, t.semester,
         t.is_active, t.faculty_id, c.id AS course_id, c.code, c.name,
         u.name AS faculty_name,
         (SELECT count(*)::int
            FROM enrollments e
            JOIN students s ON s.id = e.student_id
           WHERE e.course_id = c.id
             AND e.status = 'ACTIVE'
             AND s.section = t.section
             AND s.semester = t.semester) AS student_count
    FROM timetable_entries t
    JOIN courses c ON c.id = t.course_id
    LEFT JOIN faculties f ON f.id = t.faculty_id
    LEFT JOIN users u ON u.id = f.user_id
`;

function toClassSummary(row: EntryRow): ClassSummary {
  return {
    id: row.id,
    day: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    room: row.room,
    section: row.section,
    semester: row.semester,
    studentCount: row.student_count,
    course: { id: row.course_id, code: row.code, name: row.name },
    faculty: row.faculty_id && row.faculty_name ? { id: row.faculty_id, name: row.faculty_name } : null,
  };
}

async function facultyProfileId(userId: string): Promise<string | null> {
  const row = await queryOne<{ id: string }>("SELECT id FROM faculties WHERE user_id = $1", [userId]);
  return row?.id ?? null;
}

/**
 * Central authorization gate for both reads and writes.
 * FACULTY may only touch sessions whose timetable entry is assigned to them;
 * ADMIN may manage every session. Students are rejected before this runs.
 */
async function loadEntryForUser(entryId: string, user: ActingUser): Promise<EntryRow> {
  const row = await queryOne<EntryRow>(`${ENTRY_SELECT} WHERE t.id = $1`, [entryId]);
  if (!row) {
    throw ApiError.notFound("Class session not found");
  }
  if (!row.is_active) {
    // Archived by an administrator: the class no longer exists for attendance.
    throw ApiError.notFound("Class session not found");
  }
  if (user.role === "ADMIN") return row;
  if (user.role !== "FACULTY") {
    throw ApiError.forbidden("Only faculty and administrators can manage attendance");
  }
  const profileId = await facultyProfileId(user.id);
  if (!profileId || !row.faculty_id || row.faculty_id !== profileId) {
    throw ApiError.forbidden("You are not assigned to this class session");
  }
  return row;
}

export async function listClasses(user: ActingUser): Promise<ClassSummary[]> {
  let rows: EntryRow[];
  if (user.role === "ADMIN") {
    rows = await query<EntryRow>(`${ENTRY_SELECT} WHERE t.is_active = true ORDER BY ${DAY_ORDER}, t.start_time`);
  } else {
    const profileId = await facultyProfileId(user.id);
    if (!profileId) return [];
    rows = await query<EntryRow>(
      `${ENTRY_SELECT} WHERE t.faculty_id = $1 AND t.is_active = true ORDER BY ${DAY_ORDER}, t.start_time`,
      [profileId],
    );
  }
  return rows.map(toClassSummary);
}

export async function getClassState(
  user: ActingUser,
  entryId: string,
  date: string,
): Promise<ClassAttendanceState> {
  const entry = await loadEntryForUser(entryId, user);
  assertUsableDate(date);

  const rows = await query<{ id: string; student_no: string; name: string; status: string | null }>(
    `SELECT s.id, s.student_no, u.name, a.status
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       JOIN users u ON u.id = s.user_id
       LEFT JOIN attendance a
              ON a.student_id = s.id AND a.course_id = $1 AND a.date = $2
      WHERE e.course_id = $1
        AND e.status = 'ACTIVE'
        AND s.section = $3
        AND s.semester = $4
      ORDER BY u.name ASC`,
    [entry.course_id, date, entry.section, entry.semester],
  );

  const students: RosterStudent[] = rows.map((row) => ({
    studentId: row.id,
    studentNo: row.student_no,
    name: row.name,
    status: (row.status as RosterStudent["status"]) ?? null,
  }));

  return {
    class: toClassSummary(entry),
    date,
    alreadySubmitted: students.some((student) => student.status !== null),
    recordedCount: students.filter((student) => student.status !== null).length,
    students,
  };
}

function assertUsableDate(date: string): void {
  const today = toDateString();
  if (date > today) {
    throw ApiError.badRequest("Attendance cannot be recorded for a future date", "FUTURE_DATE");
  }
  if (date < "2000-01-01") {
    throw ApiError.badRequest("Attendance date is out of range", "INVALID_DATE");
  }
}

export async function submitAttendance(
  user: ActingUser,
  input: SubmitAttendanceInput,
): Promise<AttendanceSubmitResult> {
  const entry = await loadEntryForUser(input.timetableEntryId, user);
  assertUsableDate(input.date);

  const roster = await query<{ id: string; status: string | null }>(
    `SELECT s.id, a.status
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       LEFT JOIN attendance a
              ON a.student_id = s.id AND a.course_id = $1 AND a.date = $2
      WHERE e.course_id = $1
        AND e.status = 'ACTIVE'
        AND s.section = $3
        AND s.semester = $4`,
    [entry.course_id, input.date, entry.section, entry.semester],
  );

  if (roster.length === 0) {
    throw ApiError.badRequest("No enrolled students found for this class", "EMPTY_ROSTER");
  }

  const rosterIds = new Set(roster.map((row) => row.id));
  const seen = new Set<string>();
  const duplicates: string[] = [];
  const outsiders: string[] = [];

  for (const item of input.attendance) {
    if (seen.has(item.studentId)) duplicates.push(item.studentId);
    seen.add(item.studentId);
    if (!rosterIds.has(item.studentId)) outsiders.push(item.studentId);
  }

  if (duplicates.length > 0) {
    throw ApiError.badRequest(
      "The same student appears more than once in this submission",
      "DUPLICATE_STUDENT",
      { studentIds: [...new Set(duplicates)] },
    );
  }
  if (outsiders.length > 0) {
    throw ApiError.badRequest(
      "One or more students are not enrolled in this class",
      "STUDENT_NOT_IN_CLASS",
      { studentIds: outsiders },
    );
  }

  const isUpdate = roster.some((row) => row.status !== null);
  const recorderId = user.role === "FACULTY" ? await facultyProfileId(user.id) : null;
  const statuses = input.attendance.map((item) => item.status);

  await withTransaction(async (client) => {
    for (const item of input.attendance) {
      await client.query(
        `INSERT INTO attendance (student_id, course_id, date, status, recorded_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (student_id, course_id, date)
         DO UPDATE SET status = EXCLUDED.status,
                       recorded_by = COALESCE(EXCLUDED.recorded_by, attendance.recorded_by)`,
        [item.studentId, entry.course_id, input.date, item.status, recorderId],
      );
    }
  });

  return {
    timetableEntryId: entry.id,
    date: input.date,
    courseCode: entry.code,
    section: entry.section,
    submitted: input.attendance.length,
    inserted: input.attendance.length,
    updated: isUpdate ? input.attendance.length : 0,
    isUpdate,
    counts: countBy(statuses),
  };
}
