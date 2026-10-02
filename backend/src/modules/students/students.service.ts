import { query, queryOne } from "../../config/db";
import { ApiError } from "../../utils/ApiError";
import { toDateString, toLocalDateString } from "../../utils/date";
import {
  AttendanceHistory,
  AttendanceSummary,
  FeesSummary,
  StudentMe,
  TimetableDay,
  percentage,
} from "./students.types";

interface StudentRow {
  id: string;
  student_no: string;
  department: string;
  semester: number;
  section: string;
  batch_year: number;
  user_id: string;
  user_name: string;
  user_email: string;
  user_role: string;
}

const STUDENT_SELECT = `
  SELECT s.id, s.student_no, s.department, s.semester, s.section, s.batch_year, s.user_id,
         u.name AS user_name, u.email AS user_email, u.role AS user_role
  FROM students s
  JOIN users u ON u.id = s.user_id
`;

async function requireStudentRow(userId: string): Promise<StudentRow> {
  const row = await queryOne<StudentRow>(`${STUDENT_SELECT} WHERE s.user_id = $1`, [userId]);
  if (!row) {
    throw ApiError.notFound("No student profile is linked to this account");
  }
  return row;
}

export async function getMe(userId: string): Promise<StudentMe> {
  const row = await requireStudentRow(userId);
  return {
    id: row.id,
    studentNo: row.student_no,
    department: row.department,
    semester: row.semester,
    section: row.section,
    batchYear: row.batch_year,
    user: { id: row.user_id, name: row.user_name, email: row.user_email, role: row.user_role },
  };
}

export async function getAttendanceSummary(userId: string): Promise<AttendanceSummary> {
  await requireStudentRow(userId);

  const rows = await query<{
    course_id: string | null;
    code: string | null;
    name: string | null;
    present: number;
    late: number;
    absent: number;
    leave: number;
    total: number;
  }>(
    `SELECT a.course_id,
            c.code,
            c.name,
            count(*) FILTER (WHERE a.status = 'PRESENT')::int AS present,
            count(*) FILTER (WHERE a.status = 'LATE')::int    AS late,
            count(*) FILTER (WHERE a.status = 'ABSENT')::int  AS absent,
            count(*) FILTER (WHERE a.status = 'LEAVE')::int   AS leave,
            count(*)::int                                     AS total
     FROM attendance a
     JOIN students s ON s.id = a.student_id
     JOIN courses c ON c.id = a.course_id
     WHERE s.user_id = $1
     GROUP BY a.course_id, c.code, c.name
     ORDER BY c.code`,
    [userId],
  );

  const byCourse = rows.map((row) => {
    const attended = row.present + row.late;
    return {
      courseId: row.course_id!,
      code: row.code!,
      name: row.name!,
      present: row.present,
      late: row.late,
      absent: row.absent,
      leave: row.leave,
      total: row.total,
      percentage: percentage(attended, row.total),
    };
  });

  const totals = byCourse.reduce(
    (acc, course) => ({
      present: acc.present + course.present,
      late: acc.late + course.late,
      absent: acc.absent + course.absent,
      leave: acc.leave + course.leave,
      total: acc.total + course.total,
    }),
    { present: 0, late: 0, absent: 0, leave: 0, total: 0 },
  );

  return {
    overall: {
      ...totals,
      percentage: percentage(totals.present + totals.late, totals.total),
    },
    byCourse,
  };
}

export async function getAttendanceHistory(
  userId: string,
  limit: number,
): Promise<AttendanceHistory> {
  await requireStudentRow(userId);

  const rows = await query<{
    id: string;
    date: Date;
    status: string;
    code: string;
    name: string;
  }>(
    `SELECT a.id, a.date, a.status, c.code, c.name
       FROM attendance a
       JOIN students s ON s.id = a.student_id
       JOIN courses c ON c.id = a.course_id
      WHERE s.user_id = $1
      ORDER BY a.date DESC, c.code ASC
      LIMIT $2`,
    [userId, limit],
  );

  return {
    records: rows.map((row) => ({
      id: row.id,
      date: toLocalDateString(row.date),
      status: row.status,
      course: { code: row.code, name: row.name },
    })),
  };
}

export async function getFeesSummary(userId: string): Promise<FeesSummary> {
  const student = await requireStudentRow(userId);

  const rows = await query<{
    id: string;
    fee_type: string;
    amount: number;
    amount_paid: number;
    due_date: Date;
  }>(
    `SELECT id, fee_type, amount, amount_paid, due_date
     FROM fees
     WHERE student_id = $1
     ORDER BY due_date ASC`,
    [student.id],
  );

  const records = rows.map((row) => {
    const amount = Number(row.amount);
    const amountPaid = Number(row.amount_paid);
    const balance = Math.max(0, Math.round((amount - amountPaid) * 100) / 100);
    return {
      id: row.id,
      feeType: row.fee_type,
      amount,
      amountPaid,
      balance,
      dueDate: toLocalDateString(row.due_date),
      status: (balance <= 0 ? "PAID" : amountPaid > 0 ? "PARTIAL" : "PENDING") as
        | "PENDING"
        | "PARTIAL"
        | "PAID",
    };
  });

  const totalFees = records.reduce((sum, r) => sum + r.amount, 0);
  const totalPaid = records.reduce((sum, r) => sum + r.amountPaid, 0);
  const totalPending = Math.round((totalFees - totalPaid) * 100) / 100;

  const next = records.find((r) => r.balance > 0) ?? null;

  return {
    totalFees,
    totalPaid,
    totalPending,
    nextDue: next
      ? { feeId: next.id, feeType: next.feeType, amount: next.balance, dueDate: next.dueDate }
      : null,
    records,
  };
}

export async function getTimetable(userId: string, day: string): Promise<TimetableDay> {
  const student = await requireStudentRow(userId);

  const rows = await query<{
    id: string;
    start_time: string;
    end_time: string;
    room: string;
    section: string;
    course_id: string;
    code: string;
    name: string;
    credits: number;
    faculty_id: string | null;
    faculty_name: string | null;
  }>(
    `SELECT t.id, t.start_time, t.end_time, t.room, t.section,
            c.id AS course_id, c.code, c.name, c.credits,
            f.id AS faculty_id, u.name AS faculty_name
     FROM timetable_entries t
     JOIN courses c ON c.id = t.course_id
     JOIN enrollments e ON e.course_id = c.id
     JOIN students s ON s.id = e.student_id AND s.user_id = $1
     LEFT JOIN faculties f ON f.id = t.faculty_id
     LEFT JOIN users u ON u.id = f.user_id
      WHERE t.section = s.section
        AND t.semester = s.semester
        AND t.is_active = true
        AND t.day_of_week = $2
     ORDER BY t.start_time ASC`,
    [userId, day],
  );

  return {
    day,
    date: toDateString(),
    entries: rows.map((row) => ({
      id: row.id,
      startTime: row.start_time,
      endTime: row.end_time,
      room: row.room,
      section: row.section,
      course: { id: row.course_id, code: row.code, name: row.name, credits: row.credits },
      faculty: row.faculty_id && row.faculty_name ? { id: row.faculty_id, name: row.faculty_name } : null,
    })),
  };
}
