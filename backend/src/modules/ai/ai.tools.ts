import { ApiError } from "../../utils/ApiError";
import { addDays, currentWeekday, toDateString } from "../../utils/date";
import * as attendanceService from "../attendance/attendance.service";
import * as feesService from "../fees/fees.service";
import * as studentsService from "../students/students.service";
import * as timetableService from "../timetable/timetable.service";
import type { AiActor, AiSource, IntentRoute, ToolOutcome } from "./ai.types";

/**
 * Allowlisted, read-only retrieval layer.
 *
 * Every function takes the authenticated actor and never accepts an identity
 * (studentId / userId / facultyId) from the message or from the model, so the
 * model cannot be talked into reading somebody else's records. All SQL lives in
 * the existing modules; this file only orchestrates them and minimizes what is
 * handed to the LLM.
 */

type AttendanceSummary = Awaited<ReturnType<typeof studentsService.getAttendanceSummary>>;
type FeesSummary = Awaited<ReturnType<typeof studentsService.getFeesSummary>>;
type StudentDay = Awaited<ReturnType<typeof studentsService.getTimetable>>;
type ClassSummary = Awaited<ReturnType<typeof attendanceService.listClasses>>[number];
type ClassState = Awaited<ReturnType<typeof attendanceService.getClassState>>;
type FeePaymentsView = Awaited<ReturnType<typeof feesService.getPayments>>;

const MAX_FEE_LOOKUPS = 6;
const MAX_PAYMENT_RECORDS = 20;
const MAX_CLASSES_PER_QUESTION = 5;

export async function retrieve(actor: AiActor, route: IntentRoute, message = ""): Promise<ToolOutcome> {
  if (route.intent === "GENERAL") {
    return { sources: [], context: {}, noData: false };
  }

  switch (actor.role) {
    case "STUDENT":
      return studentRetrieve(actor, route);
    case "FACULTY":
      return facultyRetrieve(actor, route);
    case "ADMIN":
      return adminRetrieve(actor, route);
    case "PARENT":
      return parentRetrieve(actor, route, message);
    default:
      return noData([], "This assistant is available to students, faculty, administrators and parents.", {});
  }
}

// ------------------------------------------------------------------- helpers

function userContext(actor: AiActor): Record<string, unknown> {
  return { user: { name: actor.name, role: actor.role } };
}

function noData(
  sources: AiSource[],
  note: string,
  extra: Record<string, unknown>,
): ToolOutcome {
  return { sources, context: { ...extra, note }, noData: true };
}

/** A student-scoped service call can 404 when the account has no profile. */
function profileMissing(error: unknown, sources: AiSource[], extra: Record<string, unknown>): ToolOutcome {
  if (error instanceof ApiError && error.statusCode === 404) {
    return noData(sources, "No student profile is linked to this account.", extra);
  }
  throw error;
}

function matchCourse<T extends { code: string; name: string }>(courses: T[], query: string): T | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  return (
    courses.find((c) => c.code.toLowerCase() === q || c.name.toLowerCase() === q) ??
    courses.find((c) => c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase())) ??
    courses.find((c) => c.code.toLowerCase().includes(q) || q.includes(c.code.toLowerCase()))
  );
}

interface ScheduleItem {
  day: string;
  startTime: string;
  endTime: string;
  room: string;
  section: string;
  course: { code: string; name: string };
}

function pickNext(
  items: ScheduleItem[],
  from: Date = new Date(),
): { item: ScheduleItem; date: string; isToday: boolean } | null {
  const nowHM = `${String(from.getHours()).padStart(2, "0")}:${String(from.getMinutes()).padStart(2, "0")}`;
  for (let offset = 0; offset <= 7; offset += 1) {
    const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset);
    const day = currentWeekday(date);
    const candidates = items
      .filter((item) => item.day === day && (offset > 0 || item.startTime > nowHM))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (candidates.length > 0) {
      return { item: candidates[0], date: toDateString(date), isToday: offset === 0 };
    }
  }
  return null;
}

function minCourse(course: AttendanceSummary["byCourse"][number]) {
  return {
    code: course.code,
    name: course.name,
    present: course.present,
    late: course.late,
    absent: course.absent,
    leave: course.leave,
    total: course.total,
    percentage: course.percentage,
  };
}

/** Postgres TIME columns arrive as "HH:MM:SS"; the assistant speaks "HH:MM". */
function hhmm(value: string): string {
  return value.slice(0, 5);
}

function minClass(cls: ClassSummary) {
  return {
    day: cls.day,
    startTime: hhmm(cls.startTime),
    endTime: hhmm(cls.endTime),
    room: cls.room,
    section: cls.section,
    semester: cls.semester,
    studentCount: cls.studentCount,
    course: { code: cls.course.code, name: cls.course.name },
    faculty: cls.faculty?.name ?? null,
  };
}

function minStudentEntry(entry: StudentDay["entries"][number]) {
  return {
    startTime: hhmm(entry.startTime),
    endTime: hhmm(entry.endTime),
    room: entry.room,
    section: entry.section,
    course: { code: entry.course.code, name: entry.course.name },
    faculty: entry.faculty?.name ?? null,
  };
}

function minRegisterEntry(entry: { day: string; startTime: string; endTime: string; room: string; section: string; studentCount: number; course: { code: string; name: string }; faculty: { name: string } | null }) {
  return {
    day: entry.day,
    startTime: hhmm(entry.startTime),
    endTime: hhmm(entry.endTime),
    room: entry.room,
    section: entry.section,
    studentCount: entry.studentCount,
    course: { code: entry.course.code, name: entry.course.name },
    faculty: entry.faculty?.name ?? null,
  };
}

function countByDay(items: Array<{ day: string }>): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item.day] = (acc[item.day] ?? 0) + 1;
    return acc;
  }, {});
}

// ------------------------------------------------------------------- student

async function studentRetrieve(actor: AiActor, route: IntentRoute): Promise<ToolOutcome> {
  const base = userContext(actor);
  switch (route.intent) {
    case "ATTENDANCE":
    case "COURSE_ATTENDANCE":
      return studentAttendance(actor, route, base);
    case "FEES":
      return studentFees(actor, base);
    case "FEE_HISTORY":
      return studentFeePayments(actor, base);
    case "TIMETABLE":
      return studentTimetable(actor, route, base);
    case "NEXT_CLASS":
      return studentNextClass(actor, base);
    default:
      return noData([], "This question is outside the assistant's campus-data scope.", base);
  }
}

async function studentAttendance(
  actor: AiActor,
  route: IntentRoute,
  base: Record<string, unknown>,
): Promise<ToolOutcome> {
  let summary: AttendanceSummary;
  try {
    summary = await studentsService.getAttendanceSummary(actor.id);
  } catch (error) {
    return profileMissing(error, ["attendance"], base);
  }

  if (summary.byCourse.length === 0) {
    return noData(["attendance"], "No attendance has been recorded for your account yet.", base);
  }

  const courses = summary.byCourse.map(minCourse);

  if (route.intent === "COURSE_ATTENDANCE") {
    const query = route.courseQuery ?? "";
    const match = matchCourse(courses, query);
    if (!match) {
      const list = courses.map((c) => `${c.code} ${c.name}`).join(", ");
      return noData(
        ["attendance"],
        `I couldn't find a course matching "${query}". Your enrolled courses are: ${list}.`,
        base,
      );
    }
    return {
      sources: ["attendance"],
      noData: false,
      context: { ...base, attendance: { course: match } },
    };
  }

  return {
    sources: ["attendance"],
    noData: false,
    context: { ...base, attendance: { overall: summary.overall, byCourse: courses } },
  };
}

async function studentFees(actor: AiActor, base: Record<string, unknown>): Promise<ToolOutcome> {
  let fees: FeesSummary;
  try {
    fees = await studentsService.getFeesSummary(actor.id);
  } catch (error) {
    return profileMissing(error, ["fees"], base);
  }

  if (fees.records.length === 0) {
    return noData(["fees"], "No fee records exist for your account.", base);
  }

  return {
    sources: ["fees"],
    noData: false,
    context: {
      ...base,
      fees: {
        totalFees: fees.totalFees,
        totalPaid: fees.totalPaid,
        totalPending: fees.totalPending,
        nextDue: fees.nextDue
          ? {
              feeType: fees.nextDue.feeType,
              amount: fees.nextDue.amount,
              dueDate: fees.nextDue.dueDate,
            }
          : null,
        records: fees.records.map((record) => ({
          feeType: record.feeType,
          amount: record.amount,
          amountPaid: record.amountPaid,
          balance: record.balance,
          dueDate: record.dueDate,
          status: record.status,
        })),
      },
    },
  };
}

async function studentFeePayments(
  actor: AiActor,
  base: Record<string, unknown>,
): Promise<ToolOutcome> {
  let fees: FeesSummary;
  try {
    fees = await studentsService.getFeesSummary(actor.id);
  } catch (error) {
    return profileMissing(error, ["fees"], base);
  }

  if (fees.records.length === 0) {
    return noData(["fees"], "No fee records exist for your account.", base);
  }

  const payments: Array<{
    feeType: string;
    amount: number;
    paymentMethod: string;
    reference: string | null;
    recordedAt: string;
  }> = [];
  let totalPaid = 0;

  // Reuses the IDOR-safe per-fee service: it re-checks ownership on every call.
  for (const record of fees.records.slice(0, MAX_FEE_LOOKUPS)) {
    let view: FeePaymentsView;
    try {
      view = await feesService.getPayments({ id: actor.id, role: actor.role }, record.id);
    } catch (error) {
      if (error instanceof ApiError && (error.statusCode === 404 || error.statusCode === 403)) continue;
      throw error;
    }
    for (const payment of view.payments) {
      payments.push({
        feeType: view.fee.feeType,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        reference: payment.reference,
        recordedAt: payment.createdAt,
      });
      totalPaid += payment.amount;
    }
  }

  payments.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  const capped = payments.slice(0, MAX_PAYMENT_RECORDS);

  if (capped.length === 0) {
    return noData(["fees"], "No payments have been recorded for your fees yet.", base);
  }

  return {
    sources: ["fees"],
    noData: false,
    context: {
      ...base,
      feePayments: {
        paymentCount: payments.length,
        totalPaid: Math.round(totalPaid * 100) / 100,
        payments: capped,
      },
    },
  };
}

async function studentTimetable(
  actor: AiActor,
  route: IntentRoute,
  base: Record<string, unknown>,
): Promise<ToolOutcome> {
  const day = route.day ?? currentWeekday();
  let timetable: StudentDay;
  try {
    timetable = await studentsService.getTimetable(actor.id, day);
  } catch (error) {
    return profileMissing(error, ["timetable"], base);
  }

  const classes = timetable.entries.map(minStudentEntry);
  if (classes.length === 0) {
    return noData(["timetable"], `You have no classes scheduled on ${day}.`, base);
  }

  return {
    sources: ["timetable"],
    noData: false,
    context: {
      ...base,
      timetable: { day, date: timetable.date, classCount: classes.length, classes },
    },
  };
}

async function studentNextClass(
  actor: AiActor,
  base: Record<string, unknown>,
): Promise<ToolOutcome> {
  const from = new Date();
  const nowHM = `${String(from.getHours()).padStart(2, "0")}:${String(from.getMinutes()).padStart(2, "0")}`;

  for (let offset = 0; offset <= 7; offset += 1) {
    const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset);
    const day = currentWeekday(date);
    let timetable: StudentDay;
    try {
      timetable = await studentsService.getTimetable(actor.id, day);
    } catch (error) {
      return profileMissing(error, ["timetable"], base);
    }

    const candidates = timetable.entries
      .filter((entry) => offset > 0 || entry.startTime > nowHM)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    if (candidates.length > 0) {
      const first = candidates[0];
      return {
        sources: ["timetable"],
        noData: false,
        context: {
          ...base,
          nextClass: {
            ...minStudentEntry(first),
            day,
            date: toDateString(date),
            isToday: offset === 0,
          },
        },
      };
    }
  }

  return noData(["timetable"], "You have no classes scheduled in the next 7 days.", base);
}

// ------------------------------------------------------------------- faculty

async function facultyRetrieve(actor: AiActor, route: IntentRoute): Promise<ToolOutcome> {
  const base = userContext(actor);
  switch (route.intent) {
    case "ATTENDANCE":
    case "COURSE_ATTENDANCE":
      return facultyClassAttendance(actor, route, base);
    case "FEES":
    case "FEE_HISTORY":
      return noData(["fees"], "Faculty accounts cannot view fee records.", base);
    case "TIMETABLE":
      return facultySchedule(actor, route, base);
    case "NEXT_CLASS":
      return facultyNextClass(actor, base);
    default:
      return noData([], "This question is outside the assistant's campus-data scope.", base);
  }
}

async function facultySchedule(
  actor: AiActor,
  route: IntentRoute,
  base: Record<string, unknown>,
): Promise<ToolOutcome> {
  // listClasses already restricts FACULTY to its own assigned entries.
  const classes = (await attendanceService.listClasses(actor)).map(minClass);
  const day = route.day ?? currentWeekday();
  const forDay = classes.filter((cls) => cls.day === day);

  if (classes.length === 0) {
    return noData(["timetable"], "You have no assigned classes.", base);
  }
  if (forDay.length === 0) {
    return noData(["timetable"], `You have no classes scheduled on ${day}.`, {
      ...base,
      assignedClassCount: classes.length,
    });
  }

  return {
    sources: ["timetable"],
    noData: false,
    context: {
      ...base,
      assignedClassCount: classes.length,
      timetable: { day, classCount: forDay.length, classes: forDay },
    },
  };
}

async function facultyNextClass(actor: AiActor, base: Record<string, unknown>): Promise<ToolOutcome> {
  const classes = (await attendanceService.listClasses(actor)).map(minClass);
  if (classes.length === 0) {
    return noData(["timetable"], "You have no assigned classes.", base);
  }

  const next = pickNext(classes);
  if (!next) {
    return noData(["timetable"], "You have no classes scheduled in the next 7 days.", base);
  }

  return {
    sources: ["timetable"],
    noData: false,
    context: {
      ...base,
      nextClass: {
        day: next.item.day,
        date: next.date,
        isToday: next.isToday,
        startTime: next.item.startTime,
        endTime: next.item.endTime,
        room: next.item.room,
        section: next.item.section,
        course: next.item.course,
        faculty: null,
      },
    },
  };
}

async function facultyClassAttendance(
  actor: AiActor,
  route: IntentRoute,
  base: Record<string, unknown>,
): Promise<ToolOutcome> {
  const classes = await attendanceService.listClasses(actor);
  const pool = route.courseQuery
    ? classes.filter((cls) => matchCourse([cls.course], route.courseQuery as string))
    : classes;

  if (pool.length === 0) {
    const detail = route.courseQuery ? ` matching "${route.courseQuery}"` : "";
    return noData(["attendance"], `You have no assigned classes${detail}.`, base);
  }

  const dates = [toDateString(), addDays(-1)];
  const results: Array<Record<string, unknown>> = [];

  for (const cls of pool.slice(0, MAX_CLASSES_PER_QUESTION)) {
    for (const date of dates) {
      let state: ClassState;
      try {
        state = await attendanceService.getClassState(actor, cls.id, date);
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 400) continue;
        if (error instanceof ApiError && error.statusCode === 404) continue;
        throw error;
      }
      if (!state.alreadySubmitted) continue;

      const counts = { present: 0, absent: 0, late: 0, leave: 0, recorded: 0 };
      for (const student of state.students) {
        if (!student.status) continue;
        counts.recorded += 1;
        if (student.status === "PRESENT") counts.present += 1;
        else if (student.status === "ABSENT") counts.absent += 1;
        else if (student.status === "LATE") counts.late += 1;
        else if (student.status === "LEAVE") counts.leave += 1;
      }

      results.push({
        course: { code: cls.course.code, name: cls.course.name },
        day: cls.day,
        startTime: cls.startTime,
        date,
        students: state.students.length,
        ...counts,
      });
      break;
    }
  }

  if (results.length === 0) {
    return noData(
      ["attendance"],
      "No attendance has been recorded for your assigned classes in the last two days.",
      base,
    );
  }

  return { sources: ["attendance"], noData: false, context: { ...base, classAttendance: results } };
}

// --------------------------------------------------------------------- admin

async function adminRetrieve(actor: AiActor, route: IntentRoute): Promise<ToolOutcome> {
  const base = userContext(actor);
  switch (route.intent) {
    case "FEES":
      return adminFeeRegister(base, false);
    case "FEE_HISTORY":
      return adminFeeRegister(base, true);
    case "TIMETABLE":
      return adminSchedule(actor, route, base);
    case "NEXT_CLASS":
      return noData(
        ["timetable"],
        "Next-class questions apply to students and faculty; administrators get the institute schedule instead.",
        base,
      );
    case "ATTENDANCE":
    case "COURSE_ATTENDANCE":
      return noData(
        ["attendance"],
        "Per-student attendance reports are not available through the assistant. You can ask about the class schedule or the fee register.",
        base,
      );
    default:
      return noData([], "This question is outside the assistant's campus-data scope.", base);
  }
}

// -------------------------------------------------------------------- parent
//
// Parents ask about a linked child ("What is my child's attendance?", "What
// fees are pending for Aarav?"). The target child is resolved server-side:
// an explicitly named *linked* child wins, otherwise the first link is used.
// A named *unlinked* student never leaks — the answer covers the default
// linked child plus an explicit scope note.

async function parentRetrieve(actor: AiActor, route: IntentRoute, message: string): Promise<ToolOutcome> {
  const { getLinkedStudents } = await import("../parent/parent.service");
  const links = await getLinkedStudents(actor.id);
  if (links.length === 0) {
    return noData([], "No student is linked to this parent account yet.", userContext(actor));
  }

  const lowered = message.toLowerCase();
  const named = links.find((link) => {
    const first = link.name.split(/\s+/)[0]?.toLowerCase() ?? "";
    return first.length > 2 && new RegExp(`\\b${first}\\b`).test(lowered);
  });
  const target = named ?? links[0];
  const scopedNote = named
    ? `Showing ${target.name}, your linked child.`
    : "Showing your linked child's records. I can only show children linked to your account.";

  // Proxy actor: services read the *student's* records; identity stays parent-scoped.
  const { getStudentUserId } = await import("../parent/parent.service");
  const studentUserId = await getStudentUserId(target.studentId);
  const studentActor: AiActor = { ...actor, id: studentUserId, role: "STUDENT" };
  const base = { ...userContext(actor), childName: target.name, scopeNote: scopedNote };
  const outcome = await studentRetrieve(studentActor, route);
  return { ...outcome, context: { ...outcome.context, ...base } };
}

async function adminFeeRegister(
  base: Record<string, unknown>,
  forHistory: boolean,
): Promise<ToolOutcome> {
  const register = await feesService.listFees({});
  const summary = register.summary;

  if (forHistory) {
    const outstanding = Math.round((summary.totalAmount - summary.totalPaid) * 100) / 100;
    return {
      sources: ["fees"],
      noData: false,
      context: {
        ...base,
        feeRegister: { summary },
        note:
          `Payment history is shown per fee record in the fee register. ` +
          `Institute totals: ${summary.feeCount} fee records, ` +
          `₹${outstanding.toLocaleString("en-IN")} outstanding, ` +
          `${summary.openFeeCount} still open.`,
      },
    };
  }

  if (summary.feeCount === 0) {
    return noData(["fees"], "The fee register is empty.", base);
  }

  return { sources: ["fees"], noData: false, context: { ...base, feeRegister: { summary } } };
}

async function adminSchedule(
  actor: AiActor,
  route: IntentRoute,
  base: Record<string, unknown>,
): Promise<ToolOutcome> {
  const list = await timetableService.listEntries(actor, { status: "ACTIVE" });
  const entries = list.entries.map(minRegisterEntry);

  if (entries.length === 0) {
    return noData(["timetable"], "There are no active timetable entries.", base);
  }

  const dayCounts = countByDay(entries);

  if (route.day) {
    const forDay = entries.filter((entry) => entry.day === route.day);
    if (forDay.length === 0) {
      return noData(["timetable"], `There are no classes scheduled on ${route.day}.`, {
        ...base,
        classSchedule: { total: entries.length, dayCounts },
      });
    }
    return {
      sources: ["timetable"],
      noData: false,
      context: {
        ...base,
        classSchedule: {
          total: entries.length,
          day: route.day,
          dayCounts,
          classCount: forDay.length,
          classes: forDay,
        },
      },
    };
  }

  return {
    sources: ["timetable"],
    noData: false,
    context: { ...base, classSchedule: { total: entries.length, dayCounts } },
  };
}
