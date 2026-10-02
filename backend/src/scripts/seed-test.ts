import crypto from "crypto";
import bcrypt from "bcryptjs";
import { pool } from "../config/db";
import { migrate } from "./migrate";
import { env } from "../config/env";
import { addDays, toDateString, WEEKDAYS } from "../utils/date";
import { bootstrapSuperAdmin } from "./bootstrap-super-admin";

/**
 * Deterministic TEST FIXTURES for automated tests only.
 * Run: npm run seed:test   (rebuilds all demo data from scratch)
 * DO NOT USE IN PRODUCTION.
 * Creates: 18 demo users, courses, timetable, attendance, fees, payments,
 * and all phase demo data (hostel, transport, certificates, library, etc.)
 */

const DEMO_PASSWORD = "SmartCampus@2026";
const DEPARTMENT = "Computer Science and Engineering";

const uuid = () => crypto.randomUUID();

function mulberry32(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function insertBulk(table: string, columns: string[], rows: unknown[][]): Promise<void> {
  if (rows.length === 0) return;
  const params: unknown[] = [];
  const tuples = rows.map((row, rowIndex) => {
    const placeholders = row.map((value, colIndex) => {
      params.push(value);
      return `$${rowIndex * columns.length + colIndex + 1}`;
    });
    return `(${placeholders.join(", ")})`;
  });
  const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${tuples.join(", ")}`;
  await pool.query(sql, params);
}

async function main() {
  await migrate();

  console.log("[seed:test] clearing existing data...");
  await pool.query(`
    TRUNCATE TABLE
      fee_payments, attendance, fees, timetable_entries, enrollments,
      courses, students, faculties, users,
      hostel_visitors, hostel_room_change_requests, hostel_complaints,
      hostel_allocations, hostel_rooms, hostels,
      transport_alerts, transport_passes, transport_assignments,
      transport_route_stops, transport_routes, transport_vehicles,
      transport_drivers, transport_vehicle_telemetry, transport_route_progress,
      risk_snapshots, interventions,
      learning_resources, parent_invitations, parent_student_links,
      assessments, assignments, certificates, certificate_requests,
      library_reservations, library_loans, book_copies, books,
      placement_offers, placement_interviews, placement_applications,
      placement_drives, companies, alumni_contributions, alumni_campaigns,
      alumni_event_registrations, alumni_events, alumni_mentorships,
      alumni_profiles, mess_feedback, canteen_order_items, canteen_orders,
      canteen_items, meal_attendance, mess_menu, mess_enrollments, mess_plans,
      registrations, password_help_requests, password_reset_tokens
    RESTART IDENTITY CASCADE
  `);
  await pool.query("SELECT setval('student_no_seq', 1, false)");
  await pool.query("SELECT setval('faculty_no_seq', 1, false)");

  // Ensure SUPER_ADMIN exists after truncation
  await bootstrapSuperAdmin();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, env.bcryptRounds);

  // ---------------------------------------------------------------- users
  const adminId = uuid();
  const facultyIds = { ananya: uuid(), rajesh: uuid(), priya: uuid() };
  const facultyProfileIds = { ananya: uuid(), rajesh: uuid(), priya: uuid() };
  const studentIds = {
    aarav: uuid(),
    diya: uuid(),
    rohan: uuid(),
    sneha: uuid(),
    karthik: uuid(),
    ishita: uuid(),
  };

  await pool.query(
    `INSERT INTO users (id, name, email, password_hash, role, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, now() - interval '2 years', now() - interval '2 years')`,
    [adminId, "Meera Iyer", "admin@smartcampus.edu", passwordHash, "ADMIN"],
  );

  const facultyUsers: Array<[string, string, string]> = [
    [facultyIds.ananya, "Dr. Ananya Sharma", "ananya.sharma@smartcampus.edu"],
    [facultyIds.rajesh, "Prof. Rajesh Menon", "rajesh.menon@smartcampus.edu"],
    [facultyIds.priya, "Dr. Priya Nair", "priya.nair@smartcampus.edu"],
  ];
  await pool.query(
    `INSERT INTO users (id, name, email, password_hash, role)
     SELECT u.id, u.name, u.email, $1, 'FACULTY'
     FROM (VALUES ${facultyUsers.map((_, i) => `($${i * 3 + 2}::uuid, $${i * 3 + 3}::text, $${i * 3 + 4}::text)`).join(", ")})
       AS u(id, name, email)`,
    [passwordHash, ...facultyUsers.flatMap(([id, name, email]) => [id, name, email])],
  );

  const studentUsers: Array<{ id: string; profileId: string; name: string; email: string; studentNo: string; section: string; attendanceRate: number }> = [
    { id: studentIds.aarav, profileId: uuid(), name: "Aarav Sharma", email: "aarav.sharma@smartcampus.edu", studentNo: "SC2025-001", section: "A", attendanceRate: 0.93 },
    { id: studentIds.diya, profileId: uuid(), name: "Diya Krishnan", email: "diya.krishnan@smartcampus.edu", studentNo: "SC2025-002", section: "A", attendanceRate: 0.97 },
    { id: studentIds.rohan, profileId: uuid(), name: "Rohan Verma", email: "rohan.verma@smartcampus.edu", studentNo: "SC2025-003", section: "A", attendanceRate: 0.71 },
    { id: studentIds.sneha, profileId: uuid(), name: "Sneha Patel", email: "sneha.patel@smartcampus.edu", studentNo: "SC2025-004", section: "B", attendanceRate: 0.88 },
    { id: studentIds.karthik, profileId: uuid(), name: "Karthik Reddy", email: "karthik.reddy@smartcampus.edu", studentNo: "SC2025-005", section: "B", attendanceRate: 0.64 },
    { id: studentIds.ishita, profileId: uuid(), name: "Ishita Banerjee", email: "ishita.banerjee@smartcampus.edu", studentNo: "SC2025-006", section: "B", attendanceRate: 0.95 },
  ];

  await pool.query(
    `INSERT INTO users (id, name, email, password_hash, role)
     SELECT u.id, u.name, u.email, $1, 'STUDENT'
     FROM (VALUES ${studentUsers.map((_, i) => `($${i * 3 + 2}::uuid, $${i * 3 + 3}::text, $${i * 3 + 4}::text)`).join(", ")})
       AS u(id, name, email)`,
    [passwordHash, ...studentUsers.flatMap((s) => [s.id, s.name, s.email])],
  );

  // -------------------------------------------------------- profiles
  await insertBulk(
    "faculties",
    ["id", "user_id", "employee_no", "department", "designation"],
    [
      [facultyProfileIds.ananya, facultyIds.ananya, "EMP-0001", DEPARTMENT, "Associate Professor"],
      [facultyProfileIds.rajesh, facultyIds.rajesh, "EMP-0002", DEPARTMENT, "Assistant Professor"],
      [facultyProfileIds.priya, facultyIds.priya, "EMP-0003", DEPARTMENT, "Professor"],
    ],
  );

  await insertBulk(
    "students",
    ["id", "user_id", "student_no", "department", "semester", "section", "batch_year", "admission_on"],
    studentUsers.map((s) => [
      s.profileId,
      s.id,
      s.studentNo,
      DEPARTMENT,
      3,
      s.section,
      2025,
      "2025-07-14",
    ]),
  );

  await pool.query("SELECT setval('student_no_seq', 6, true)");
  await pool.query("SELECT setval('faculty_no_seq', 3, true)");

  // ----------------------------------------------------------- courses
  const courses = [
    { id: uuid(), code: "CS301", name: "Data Structures and Algorithms", credits: 4, faculty: facultyProfileIds.ananya },
    { id: uuid(), code: "CS305", name: "Database Management Systems", credits: 4, faculty: facultyProfileIds.ananya },
    { id: uuid(), code: "CS311", name: "Operating Systems", credits: 3, faculty: facultyProfileIds.rajesh },
    { id: uuid(), code: "CS315", name: "Web Technologies", credits: 3, faculty: facultyProfileIds.rajesh },
    { id: uuid(), code: "CS321", name: "Machine Learning Fundamentals", credits: 4, faculty: facultyProfileIds.priya },
    { id: uuid(), code: "MA201", name: "Discrete Mathematics", credits: 3, faculty: facultyProfileIds.priya },
  ];

  await insertBulk(
    "courses",
    ["id", "code", "name", "credits", "department", "semester", "faculty_id"],
    courses.map((c) => [c.id, c.code, c.name, c.credits, DEPARTMENT, 3, c.faculty]),
  );

  const courseByCode = Object.fromEntries(courses.map((c) => [c.code, c]));

  // ------------------------------------------------------- enrollments
  const enrollmentRows: unknown[][] = studentUsers.flatMap((student) =>
    courses.map((course) => [uuid(), student.profileId, course.id, "2025-07-20", "ACTIVE"]),
  );

  await insertBulk(
    "enrollments",
    ["id", "student_id", "course_id", "enrolled_on", "status"],
    enrollmentRows,
  );

  // --------------------------------------------------------- timetable
  type Slot = { day: string; start: string; end: string; course: string; room: string; section: string };

  const timetable: Slot[] = [
    // Section A - morning block
    { day: "Monday", start: "09:00", end: "10:00", course: "CS301", room: "L-201", section: "A" },
    { day: "Monday", start: "10:15", end: "11:15", course: "CS305", room: "L-201", section: "A" },
    { day: "Monday", start: "11:30", end: "12:30", course: "CS311", room: "L-203", section: "A" },
    { day: "Tuesday", start: "09:00", end: "10:00", course: "CS315", room: "L-204", section: "A" },
    { day: "Tuesday", start: "10:15", end: "11:15", course: "CS321", room: "L-204", section: "A" },
    { day: "Tuesday", start: "11:30", end: "12:30", course: "MA201", room: "L-105", section: "A" },
    { day: "Wednesday", start: "09:00", end: "10:00", course: "CS301", room: "L-201", section: "A" },
    { day: "Wednesday", start: "10:15", end: "11:15", course: "CS305", room: "L-201", section: "A" },
    { day: "Wednesday", start: "11:30", end: "12:30", course: "CS311", room: "L-203", section: "A" },
    { day: "Thursday", start: "09:00", end: "10:00", course: "CS315", room: "L-204", section: "A" },
    { day: "Thursday", start: "10:15", end: "11:15", course: "CS321", room: "L-204", section: "A" },
    { day: "Thursday", start: "11:30", end: "12:30", course: "MA201", room: "L-105", section: "A" },
    { day: "Friday", start: "09:00", end: "10:00", course: "CS301", room: "L-201", section: "A" },
    { day: "Friday", start: "13:30", end: "14:30", course: "CS305", room: "L-202", section: "A" },
    { day: "Friday", start: "14:45", end: "15:45", course: "CS311", room: "L-203", section: "A" },
    // Section B - afternoon block
    { day: "Monday", start: "11:30", end: "12:30", course: "CS301", room: "L-205", section: "B" },
    { day: "Monday", start: "14:00", end: "15:00", course: "CS305", room: "L-205", section: "B" },
    { day: "Monday", start: "15:15", end: "16:15", course: "CS311", room: "L-206", section: "B" },
    { day: "Tuesday", start: "11:30", end: "12:30", course: "CS315", room: "L-206", section: "B" },
    { day: "Tuesday", start: "14:00", end: "15:00", course: "CS321", room: "L-206", section: "B" },
    { day: "Tuesday", start: "15:15", end: "16:15", course: "MA201", room: "L-106", section: "B" },
    { day: "Wednesday", start: "11:30", end: "12:30", course: "CS301", room: "L-205", section: "B" },
    { day: "Wednesday", start: "14:00", end: "15:00", course: "CS305", room: "L-205", section: "B" },
    { day: "Wednesday", start: "15:15", end: "16:15", course: "CS311", room: "L-206", section: "B" },
    { day: "Thursday", start: "11:30", end: "12:30", course: "CS315", room: "L-206", section: "B" },
    { day: "Thursday", start: "14:00", end: "15:00", course: "CS321", room: "L-206", section: "B" },
    { day: "Thursday", start: "15:15", end: "16:15", course: "MA201", room: "L-106", section: "B" },
    { day: "Friday", start: "11:30", end: "12:30", course: "CS315", room: "L-206", section: "B" },
    { day: "Friday", start: "14:00", end: "15:00", course: "CS321", room: "L-206", section: "B" },
    { day: "Friday", start: "15:15", end: "16:15", course: "MA201", room: "L-106", section: "B" },
  ];

  await insertBulk(
    "timetable_entries",
    ["id", "course_id", "faculty_id", "room", "day_of_week", "start_time", "end_time", "section", "semester", "department"],
    timetable.map((slot) => {
      const course = courseByCode[slot.course];
      return [
        uuid(),
        course.id,
        course.faculty,
        slot.room,
        slot.day,
        slot.start,
        slot.end,
        slot.section,
        3,
        DEPARTMENT,
      ];
    }),
  );

  // -------------------------------------------------------- attendance
  // Phase 7 trend profiles: older (22-42 days ago) vs recent (0-21 days ago).
  // Aarav/Diya: stable strong. Rohan: attendance declining. Sneha: stable attendance
  // (assessment decline below). Karthik: multiple declining. Ishita: improving.
  const attendanceTrend: Record<string, { older: number; recent: number }> = {
    [studentIds.aarav]: { older: 0.93, recent: 0.93 },
    [studentIds.diya]: { older: 0.97, recent: 0.97 },
    [studentIds.rohan]: { older: 0.86, recent: 0.55 },
    [studentIds.sneha]: { older: 0.89, recent: 0.87 },
    [studentIds.karthik]: { older: 0.78, recent: 0.45 },
    [studentIds.ishita]: { older: 0.86, recent: 0.97 },
  };
  const random = mulberry32(20260929);
  const attendanceRows: unknown[][] = [];
  const recordedBy: Record<string, string> = Object.fromEntries(
    courses.map((c) => [c.code, c.faculty]),
  );

  const today = new Date();
  for (let offset = 42; offset >= 1; offset--) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const dayName = WEEKDAYS[date.getDay()];
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    const dateStr = toDateString(date);
    const isRecentWindow = offset <= 21;

    for (const slot of timetable.filter((s) => s.day === dayName)) {
      const course = courseByCode[slot.course];
      const studentsInSection = studentUsers.filter((s) => s.section === slot.section);
      for (const student of studentsInSection) {
        const roll = random();
        const rate = (attendanceTrend[student.id] ?? { older: student.attendanceRate, recent: student.attendanceRate })[
          isRecentWindow ? "recent" : "older"
        ];
        const status =
          roll < rate
            ? "PRESENT"
            : roll < rate + 0.06
              ? "LATE"
              : "ABSENT";
        attendanceRows.push([
          uuid(),
          student.profileId,
          course.id,
          dateStr,
          status,
          recordedBy[slot.course],
        ]);
      }
    }
  }

  for (let i = 0; i < attendanceRows.length; i += 500) {
    const chunk = attendanceRows.slice(i, i + 500);
    await insertBulk(
      "attendance",
      ["id", "student_id", "course_id", "date", "status", "recorded_by"],
      chunk,
    );
  }
  console.log(`[seed:test] attendance rows: ${attendanceRows.length}`);

  // ------------------------------------------------------------- fees
  const daysFromNow = (days: number) => addDays(days);

  type FeePlan = { type: string; amount: number; paid: number; due: number };
  const feePlans: Record<string, FeePlan[]> = {
    [studentIds.aarav]: [
      { type: "Tuition Fee - Semester 3", amount: 85000, paid: 85000, due: 15 },
      { type: "Examination Fee", amount: 4500, paid: 4500, due: 10 },
      { type: "Library & Laboratory Fee", amount: 6500, paid: 6500, due: 5 },
    ],
    [studentIds.diya]: [
      { type: "Tuition Fee - Semester 3", amount: 85000, paid: 85000, due: 15 },
      { type: "Examination Fee", amount: 4500, paid: 0, due: 10 },
      { type: "Library & Laboratory Fee", amount: 6500, paid: 0, due: 5 },
    ],
    [studentIds.rohan]: [
      { type: "Tuition Fee - Semester 3", amount: 85000, paid: 50000, due: 15 },
      { type: "Examination Fee", amount: 4500, paid: 0, due: 10 },
      { type: "Library & Laboratory Fee", amount: 6500, paid: 3000, due: 5 },
    ],
    [studentIds.sneha]: [
      { type: "Tuition Fee - Semester 3", amount: 85000, paid: 85000, due: 15 },
      { type: "Examination Fee", amount: 4500, paid: 4500, due: 10 },
      { type: "Library & Laboratory Fee", amount: 6500, paid: 0, due: 5 },
    ],
    [studentIds.karthik]: [
      { type: "Tuition Fee - Semester 3", amount: 85000, paid: 40000, due: 15 },
      { type: "Examination Fee", amount: 4500, paid: 0, due: 10 },
      { type: "Library & Laboratory Fee", amount: 6500, paid: 0, due: 5 },
    ],
    [studentIds.ishita]: [
      { type: "Tuition Fee - Semester 3", amount: 85000, paid: 85000, due: 15 },
      { type: "Examination Fee", amount: 4500, paid: 4500, due: 10 },
      { type: "Library & Laboratory Fee", amount: 6500, paid: 3250, due: 5 },
    ],
  };

  const profileIdByUserId = Object.fromEntries(studentUsers.map((s) => [s.id, s.profileId]));

  const paymentRandom = mulberry32(77007);
  const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "UPI", "CARD"];

  const feeRows: unknown[][] = [];
  const paymentRows: unknown[][] = [];
  let referenceSeq = 1;

  for (const [studentUserId, plans] of Object.entries(feePlans)) {
    for (const plan of plans) {
      const feeId = uuid();
      const dueDate = daysFromNow(plan.due);
      const status = plan.paid >= plan.amount ? "PAID" : plan.paid > 0 ? "PARTIAL" : "PENDING";
      feeRows.push([
        feeId,
        profileIdByUserId[studentUserId],
        plan.type,
        plan.amount,
        plan.paid,
        dueDate,
        status,
      ]);

      if (plan.paid > 0) {
        const method = PAYMENT_METHODS[Math.floor(paymentRandom() * PAYMENT_METHODS.length)];
        paymentRows.push([
          uuid(),
          feeId,
          plan.paid,
          method,
          `REF-2026-${String(referenceSeq++).padStart(4, "0")}`,
          adminId,
          addDays(-(3 + Math.floor(paymentRandom() * 25))),
        ]);
      }
    }
  }
  await insertBulk(
    "fees",
    ["id", "student_id", "fee_type", "amount", "amount_paid", "due_date", "status"],
    feeRows,
  );
  await insertBulk(
    "fee_payments",
    ["id", "fee_id", "amount", "payment_method", "reference", "recorded_by", "created_at"],
    paymentRows,
  );

  // ------------------------------------------------------- assessments (marks)
  // Phase 7 trend profiles (older 30-60 days ago vs recent 0-30 days ago):
  // Aarav/Diya: stable strong. Rohan: assessment declining. Sneha: assessment
  // declining. Karthik: multiple declining. Ishita: improving.
  const assessmentRandom = mulberry32(98765);
  const assessmentRows: unknown[][] = [];

  const assessmentTypes = ["QUIZ", "MIDTERM", "FINAL", "PROJECT", "LAB", "ASSIGNMENT"] as const;

  // Performance profiles per student, older vs recent (0-1 scale)
  const studentPerformanceTrend: Record<string, { older: number; recent: number }> = {
    [studentIds.aarav]: { older: 0.88, recent: 0.88 },
    [studentIds.diya]: { older: 0.95, recent: 0.95 },
    [studentIds.rohan]: { older: 0.62, recent: 0.35 },
    [studentIds.sneha]: { older: 0.85, recent: 0.58 },
    [studentIds.karthik]: { older: 0.55, recent: 0.28 },
    [studentIds.ishita]: { older: 0.74, recent: 0.88 },
  };

  // Each course gets 3-4 assessments per student
  for (const [studentUserId, profileId] of Object.entries(profileIdByUserId)) {
    const trend = studentPerformanceTrend[studentUserId] ?? { older: 0.7, recent: 0.7 };
    for (const course of courses) {
      const numAssessments = 3 + Math.floor(assessmentRandom() * 2); // 3-4
      for (let i = 0; i < numAssessments; i++) {
        const type = assessmentTypes[Math.floor(assessmentRandom() * assessmentTypes.length)];
        const maxMarks = type === "FINAL" ? 100 : type === "MIDTERM" ? 50 : type === "PROJECT" ? 30 : type === "LAB" ? 20 : 10;
        const daysAgo = Math.floor(assessmentRandom() * 90); // last 90 days
        const perf = daysAgo < 30 ? trend.recent : trend.older;
        // Score based on performance profile with some noise
        const baseScore = perf * maxMarks;
        const noise = (assessmentRandom() - 0.5) * 0.2 * maxMarks; // ±10%
        const marksObtained = Math.max(0, Math.min(maxMarks, Math.round((baseScore + noise) * 100) / 100));
        const assessedOn = addDays(-daysAgo);
        assessmentRows.push([
          uuid(),
          profileId,
          course.id,
          type,
          marksObtained,
          maxMarks,
          assessedOn,
        ]);
      }
    }
  }

  await insertBulk(
    "assessments",
    ["id", "student_id", "course_id", "assessment_type", "marks_obtained", "max_marks", "assessed_on"],
    assessmentRows,
  );

  // ------------------------------------------------------- assignments
  // Assignment trends mirror assessment trends: recent window uses recent perf.
  const assignmentRandom = mulberry32(54321);
  const assignmentRows: unknown[][] = [];

  // Each course gets 2-4 assignments per student
  for (const [studentUserId, profileId] of Object.entries(profileIdByUserId)) {
    const aTrend = studentPerformanceTrend[studentUserId] ?? { older: 0.7, recent: 0.7 };
    for (const course of courses) {
      const numAssignments = 2 + Math.floor(assignmentRandom() * 3); // 2-4
      for (let i = 0; i < numAssignments; i++) {
        const title = `Assignment ${i + 1}: ${course.code} Topic ${String.fromCharCode(65 + i)}`;
        const maxScore = 10;
        const daysAgoDue = Math.floor(assignmentRandom() * 60) + 1; // past 60 days
        const dueDate = addDays(-daysAgoDue);
        const perf = daysAgoDue <= 30 ? aTrend.recent : aTrend.older;
        // Submission probability based on performance
        const willSubmit = assignmentRandom() < Math.max(0.3, perf + 0.1);
        const submitted = willSubmit;
        const score = submitted ? Math.max(0, Math.min(maxScore, Math.round((perf * maxScore + (assignmentRandom() - 0.5) * 2) * 100) / 100)) : null;
        const submittedOn = submitted ? addDays(-Math.floor(assignmentRandom() * 5)) : null;
        assignmentRows.push([
          uuid(),
          profileId,
          course.id,
          title,
          submitted,
          score,
          maxScore,
          dueDate,
          submittedOn,
        ]);
      }
    }
  }

  await insertBulk(
    "assignments",
    ["id", "student_id", "course_id", "title", "submitted", "score", "max_score", "due_date", "submitted_on"],
    assignmentRows,
  );

  // ------------------------------------------------------ learning resources (Phase 6)
  // DEMO / CURATED RESOURCES - Not official university resources
  // These are example resources for demonstration purposes only
  const resourceRows: unknown[][] = [];

  // Helper to create resource rows
  const addResources = (courseId: string, resources: Array<{ title: string; description: string; type: string; topic: string; difficulty: string; url: string }>) => {
    for (const r of resources) {
      resourceRows.push([
        uuid(),
        courseId,
        r.title,
        r.description,
        r.type,
        r.topic,
        r.difficulty,
        r.url,
        true,
      ]);
    }
  };

  // Resources for CS301 - Data Structures and Algorithms
  addResources(courseByCode["CS301"].id, [
    {
      title: "Arrays and Linked Lists - Visual Guide",
      description: "Interactive visualization of array and linked list operations with step-by-step animations",
      type: "VIDEO",
      topic: "data structures",
      difficulty: "beginner",
      url: "https://visualgo.net/en/list",
    },
    {
      title: "Big O Notation Cheat Sheet",
      description: "Quick reference for time and space complexity of common algorithms",
      type: "NOTES",
      topic: "algorithm analysis",
      difficulty: "beginner",
      url: "https://www.bigocheatsheet.com/",
    },
    {
      title: "Binary Search Tree Practice Problems",
      description: "Hands-on exercises for BST insertion, deletion, and traversal",
      type: "PRACTICE",
      topic: "trees",
      difficulty: "intermediate",
      url: "https://leetcode.com/tag/binary-search-tree/",
    },
    {
      title: "Dynamic Programming Patterns",
      description: "Comprehensive guide to recognizing and solving DP problems",
      type: "ARTICLE",
      topic: "dynamic programming",
      difficulty: "advanced",
      url: "https://leetcode.com/discuss/general-discussion/458695/dynamic-programming-patterns",
    },
    {
      title: "CS301 Remedial: Sorting Algorithms Refresher",
      description: "Fundamental sorting algorithms with visual examples for students needing review",
      type: "REMEDIAL",
      topic: "sorting",
      difficulty: "beginner",
      url: "https://www.cs.usfca.edu/~galles/visualization/ComparisonSort.html",
    },
  ]);

  // Resources for CS305 - Database Management Systems
  addResources(courseByCode["CS305"].id, [
    {
      title: "SQL Joins Visualized",
      description: "Animated explanation of INNER, LEFT, RIGHT, and FULL joins",
      type: "VIDEO",
      topic: "sql joins",
      difficulty: "beginner",
      url: "https://www.sql-join.com/",
    },
    {
      title: "Database Normalization Guide (1NF-3NF)",
      description: "Step-by-step normalization with practical examples",
      type: "NOTES",
      topic: "normalization",
      difficulty: "intermediate",
      url: "https://www.studytone.org/notes/database-normalization",
    },
    {
      title: "ER Diagram Practice Exercises",
      description: "Entity-relationship modeling exercises with solutions",
      type: "PRACTICE",
      topic: "er modeling",
      difficulty: "intermediate",
      url: "https://www.databaseanswers.org/data_models/",
    },
    {
      title: "ACID Properties Deep Dive",
      description: "Detailed explanation of Atomicity, Consistency, Isolation, Durability",
      type: "ARTICLE",
      topic: "transactions",
      difficulty: "advanced",
      url: "https://www.geeksforgeeks.org/acid-properties-in-dbms/",
    },
    {
      title: "CS305 Remedial: Basic SQL Queries",
      description: "SELECT, WHERE, GROUP BY, ORDER BY fundamentals with exercises",
      type: "REMEDIAL",
      topic: "sql basics",
      difficulty: "beginner",
      url: "https://sqlbolt.com/",
    },
  ]);

  // Resources for CS311 - Operating Systems
  addResources(courseByCode["CS311"].id, [
    {
      title: "Process Scheduling Algorithms Explained",
      description: "Visual walkthrough of FCFS, SJF, Round Robin, and Priority scheduling",
      type: "VIDEO",
      topic: "process scheduling",
      difficulty: "intermediate",
      url: "https://www.cs.jhu.edu/~huang/cs318/os/scheduling/",
    },
    {
      title: "Memory Management Cheat Sheet",
      description: "Paging, segmentation, virtual memory concepts in one page",
      type: "NOTES",
      topic: "memory management",
      difficulty: "intermediate",
      url: "https://www.cs.uic.edu/~jbell/CourseNotes/OperatingSystems/9_Memory_Management.html",
    },
    {
      title: "Deadlock Detection and Prevention Exercises",
      description: "Banker's algorithm and resource allocation graph practice",
      type: "PRACTICE",
      topic: "deadlocks",
      difficulty: "advanced",
      url: "https://www.cs.uic.edu/~jbell/CourseNotes/OperatingSystems/7_Deadlocks.html",
    },
    {
      title: "File Systems: Inodes and Journaling",
      description: "Technical deep dive into modern file system internals",
      type: "ARTICLE",
      topic: "file systems",
      difficulty: "advanced",
      url: "https://www.cs.cmu.edu/~fp/courses/15213-s07/lectures/25-filesys.pdf",
    },
    {
      title: "CS311 Remedial: Process Concepts Basics",
      description: "Process states, PCB, context switching fundamentals",
      type: "REMEDIAL",
      topic: "process basics",
      difficulty: "beginner",
      url: "https://www.cs.uic.edu/~jbell/CourseNotes/OperatingSystems/3_Processes.html",
    },
  ]);

  // Resources for CS315 - Web Technologies
  addResources(courseByCode["CS315"].id, [
    {
      title: "React Hooks Tutorial for Beginners",
      description: "useState, useEffect, useContext with interactive examples",
      type: "VIDEO",
      topic: "react hooks",
      difficulty: "beginner",
      url: "https://react.dev/learn/state-a-components-memory",
    },
    {
      title: "REST API Design Best Practices",
      description: "Resource naming, HTTP methods, status codes, versioning",
      type: "NOTES",
      topic: "api design",
      difficulty: "intermediate",
      url: "https://restfulapi.net/",
    },
    {
      title: "CSS Flexbox and Grid Playground",
      description: "Interactive layout exercises for responsive design",
      type: "PRACTICE",
      topic: "css layout",
      difficulty: "beginner",
      url: "https://cssgridgarden.com/",
    },
    {
      title: "Web Security: OWASP Top 10 Explained",
      description: "Cross-site scripting, injection, broken authentication countermeasures",
      type: "ARTICLE",
      topic: "web security",
      difficulty: "advanced",
      url: "https://owasp.org/www-project-top-ten/",
    },
    {
      title: "CS315 Remedial: HTML/CSS Fundamentals",
      description: "Semantic HTML, box model, basic styling for web development review",
      type: "REMEDIAL",
      topic: "html css basics",
      difficulty: "beginner",
      url: "https://internetingishard.netlify.app/html-and-css/",
    },
  ]);

  // Resources for CS321 - Machine Learning Fundamentals
  addResources(courseByCode["CS321"].id, [
    {
      title: "Linear Regression from Scratch",
      description: "Mathematical derivation and Python implementation without libraries",
      type: "VIDEO",
      topic: "linear regression",
      difficulty: "intermediate",
      url: "https://www.youtube.com/watch?v=8bXj9wKb1q8",
    },
    {
      title: "ML Evaluation Metrics Reference",
      description: "Accuracy, precision, recall, F1, ROC-AUC with when to use each",
      type: "NOTES",
      topic: "model evaluation",
      difficulty: "intermediate",
      url: "https://scikit-learn.org/stable/modules/model_evaluation.html",
    },
    {
      title: "Gradient Descent Visualization",
      description: "Interactive 3D visualization of gradient descent optimization",
      type: "PRACTICE",
      topic: "optimization",
      difficulty: "intermediate",
      url: "https://www.deeplearning.ai/short-courses/visualizing-gradient-descent/",
    },
    {
      title: "Neural Network Architectures Overview",
      description: "CNN, RNN, Transformer architectures and use cases",
      type: "ARTICLE",
      topic: "neural networks",
      difficulty: "advanced",
      url: "https://www.deeplearning.ai/short-courses/neural-network-architectures/",
    },
    {
      title: "CS321 Remedial: Python for ML Basics",
      description: "NumPy, Pandas, Matplotlib fundamentals for data science",
      type: "REMEDIAL",
      topic: "python basics",
      difficulty: "beginner",
      url: "https://www.kaggle.com/learn/python",
    },
  ]);

  // Resources for MA201 - Discrete Mathematics
  addResources(courseByCode["MA201"].id, [
    {
      title: "Proof Techniques: Induction, Contradiction, Contrapositive",
      description: "Step-by-step guide to mathematical proof methods with examples",
      type: "VIDEO",
      topic: "proof techniques",
      difficulty: "beginner",
      url: "https://www.math.csusb.edu/notes/proofs/pfnot/pfnot.html",
    },
    {
      title: "Graph Theory Cheat Sheet",
      description: "Vertices, edges, paths, cycles, trees, bipartite graphs summary",
      type: "NOTES",
      topic: "graph theory",
      difficulty: "intermediate",
      url: "https://www.geeksforgeeks.org/graph-data-structure-and-algorithms/",
    },
    {
      title: "Combinatorics Practice Problems",
      description: "Permutations, combinations, pigeonhole principle exercises",
      type: "PRACTICE",
      topic: "combinatorics",
      difficulty: "intermediate",
      url: "https://brilliant.org/wiki/combinatorics/",
    },
    {
      title: "Applications of Discrete Math in Computer Science",
      description: "How logic, sets, graphs apply to algorithms and cryptography",
      type: "ARTICLE",
      topic: "cs applications",
      difficulty: "advanced",
      url: "https://www.cs.utexas.edu/~isil/cs311/lecture1-applications.pdf",
    },
    {
      title: "MA201 Remedial: Set Theory and Logic Basics",
      description: "Unions, intersections, complements, truth tables, quantifiers review",
      type: "REMEDIAL",
      topic: "set theory logic",
      difficulty: "beginner",
      url: "https://www.mathsisfun.com/sets/",
    },
  ]);

  await insertBulk(
    "learning_resources",
    ["id", "course_id", "title", "description", "resource_type", "topic", "difficulty", "url", "active"],
    resourceRows,
  );

  // ------------------------------------------------------ parents (Phase 8)
  // DEMO parent accounts. Invitation tokens below are development-only.
  const parentUsers: Array<{ id: string; name: string; email: string }> = [
    { id: uuid(), name: "Ravi Sharma", email: "ravi.sharma@smartcampus.edu" },
    { id: uuid(), name: "Kavitha Verma", email: "kavitha.verma@smartcampus.edu" },
    { id: uuid(), name: "Farah Khan", email: "farah.khan@smartcampus.edu" },
  ];

  await pool.query(
    `INSERT INTO users (id, name, email, password_hash, role)
     SELECT u.id, u.name, u.email, $1, 'PARENT'
     FROM (VALUES ${parentUsers.map((_, i) => `($${i * 3 + 2}::uuid, $${i * 3 + 3}::text, $${i * 3 + 4}::text)`).join(", ")})
       AS u(id, name, email)`,
    [passwordHash, ...parentUsers.flatMap((p) => [p.id, p.name, p.email])],
  );

  const parentByEmail = Object.fromEntries(parentUsers.map((p) => [p.email, p]));

  // Parent A -> Aarav, Parent B -> Rohan, Parent C -> Aarav + Diya (multi-link demo).
  await insertBulk(
    "parent_student_links",
    ["id", "parent_user_id", "student_id", "relationship_type", "status"],
    [
      [uuid(), parentByEmail["ravi.sharma@smartcampus.edu"].id, profileIdByUserId[studentIds.aarav], "PARENT", "ACTIVE"],
      [uuid(), parentByEmail["kavitha.verma@smartcampus.edu"].id, profileIdByUserId[studentIds.rohan], "GUARDIAN", "ACTIVE"],
      [uuid(), parentByEmail["farah.khan@smartcampus.edu"].id, profileIdByUserId[studentIds.aarav], "PARENT", "ACTIVE"],
      [uuid(), parentByEmail["farah.khan@smartcampus.edu"].id, profileIdByUserId[studentIds.diya], "PARENT", "ACTIVE"],
    ],
  );

  // One pending demo invitation (Sneha's guardian). Raw token is dev-only.
  const demoInviteToken = "demo-invite-sneha-guardian-000000000001";
  const demoInviteHash = crypto.createHash("sha256").update(demoInviteToken).digest("hex");
  await insertBulk(
    "parent_invitations",
    ["id", "student_id", "parent_email", "relationship_type", "token_hash", "status", "expires_at", "created_by"],
    [
      [uuid(), profileIdByUserId[studentIds.sneha], "suresh.patel@smartcampus.edu", "GUARDIAN", demoInviteHash, "PENDING", addDays(7), adminId],
    ],
  );

  // ------------------------------------------------- hostel (Phase 9)
  const hostelAryabhata = uuid();
  const hostelGargi = uuid();
  await insertBulk(
    "hostels",
    ["id", "name", "block", "category", "warden_name", "active"],
    [
      [hostelAryabhata, "Aryabhata Hostel", "Block A", "BOYS", "Mr. Vikram Rao", true],
      [hostelGargi, "Gargi Hostel", "Block B", "GIRLS", "Ms. Lakshmi Iyer", true],
    ],
  );

  const roomIds: Record<string, string> = {
    A101: uuid(), A102: uuid(), A103: uuid(), A104: uuid(), G201: uuid(), G202: uuid(),
  };
  await insertBulk(
    "hostel_rooms",
    ["id", "hostel_id", "room_number", "floor", "room_type", "capacity", "status"],
    [
      [roomIds.A101, hostelAryabhata, "A-101", 1, "DOUBLE", 2, "AVAILABLE"],
      [roomIds.A102, hostelAryabhata, "A-102", 1, "DOUBLE", 2, "AVAILABLE"],
      [roomIds.A103, hostelAryabhata, "A-103", 2, "TRIPLE", 3, "AVAILABLE"],
      [roomIds.A104, hostelAryabhata, "A-104", 2, "SINGLE", 1, "MAINTENANCE"],
      [roomIds.G201, hostelGargi, "G-201", 2, "DOUBLE", 2, "AVAILABLE"],
      [roomIds.G202, hostelGargi, "G-202", 2, "TRIPLE", 3, "AVAILABLE"],
    ],
  );

  // Aarav + Rohan share A-101 (roommates demo); Karthik in A-102; Sneha in G-201.
  // Diya and Ishita are day scholars (empty states).
  await insertBulk(
    "hostel_allocations",
    ["id", "room_id", "student_id", "bed_number", "allocated_on", "status"],
    [
      [uuid(), roomIds.A101, profileIdByUserId[studentIds.aarav], 1, addDays(-60), "ACTIVE"],
      [uuid(), roomIds.A101, profileIdByUserId[studentIds.rohan], 2, addDays(-60), "ACTIVE"],
      [uuid(), roomIds.A102, profileIdByUserId[studentIds.karthik], 1, addDays(-45), "ACTIVE"],
      [uuid(), roomIds.G201, profileIdByUserId[studentIds.sneha], 1, addDays(-50), "ACTIVE"],
    ],
  );

  // Hostel fees reuse the existing fees ledger (no second ledger).
  // NOTE: Aarav keeps his original fee totals (96000, fully paid) because the
  // Phase 1 API suite asserts them exactly; his hostel card shows allocation
  // without fee rows.
  const hostelFeeRows: unknown[][] = [
    [uuid(), profileIdByUserId[studentIds.rohan], "Hostel Fee - Semester 3", 45000, 20000, addDays(20), "PARTIAL"],
    [uuid(), profileIdByUserId[studentIds.karthik], "Hostel Fee - Semester 3", 45000, 0, addDays(20), "PENDING"],
    [uuid(), profileIdByUserId[studentIds.sneha], "Hostel Fee - Semester 3", 45000, 45000, addDays(20), "PAID"],
  ];
  await insertBulk(
    "fees",
    ["id", "student_id", "fee_type", "amount", "amount_paid", "due_date", "status"],
    hostelFeeRows,
  );

  await insertBulk(
    "hostel_complaints",
    ["id", "student_id", "room_id", "category", "description", "status", "priority"],
    [
      [uuid(), profileIdByUserId[studentIds.rohan], roomIds.A101, "ELECTRICAL", "Tube light near bed 2 has not been working for three days.", "OPEN", "MEDIUM"],
    ],
  );

  await insertBulk(
    "hostel_room_change_requests",
    ["id", "student_id", "current_room_id", "requested_room_id", "reason", "status"],
    [
      [uuid(), profileIdByUserId[studentIds.karthik], roomIds.A102, roomIds.A103, "Would like to move to a triple room with classmates on the second floor.", "PENDING"],
    ],
  );

  await insertBulk(
    "hostel_visitors",
    ["id", "student_id", "visitor_name", "relation", "visit_date", "visit_time", "status"],
    [
      [uuid(), profileIdByUserId[studentIds.aarav], "Ravi Sharma", "Father", addDays(2), "11:00", "APPROVED"],
    ],
  );

  // ----------------------------------------------- transport (Phase 9)
  const driverRamesh = uuid();
  const driverSuresh = uuid();
  await insertBulk(
    "transport_drivers",
    ["id", "name", "phone", "license_no", "active"],
    [
      [driverRamesh, "Ramesh Kumar", "+91-9845000001", "DL-KA-2015-0001234", true],
      [driverSuresh, "Suresh Yadav", "+91-9845000002", "DL-KA-2018-0005678", true],
    ],
  );

  const vehicleV1 = uuid();
  const vehicleV2 = uuid();
  const vehicleV3 = uuid();
  await insertBulk(
    "transport_vehicles",
    ["id", "registration_number", "vehicle_type", "capacity", "status", "driver_id"],
    [
      [vehicleV1, "KA-01-AB-1234", "BUS", 40, "ACTIVE", driverRamesh],
      [vehicleV2, "KA-01-CD-5678", "MINIBUS", 20, "ACTIVE", driverSuresh],
      [vehicleV3, "KA-01-EF-9012", "VAN", 8, "MAINTENANCE", null],
    ],
  );

  const routeNorth = uuid();
  const routeSouth = uuid();
  await insertBulk(
    "transport_routes",
    ["id", "route_code", "name", "active"],
    [
      [routeNorth, "R1-NORTH", "North Campus Loop", true],
      [routeSouth, "R2-SOUTH", "South Express", true],
    ],
  );

  const stopIds: Record<string, string> = {
    N1: uuid(), N2: uuid(), N3: uuid(), N4: uuid(), S1: uuid(), S2: uuid(), S3: uuid(),
  };
  await insertBulk(
    "transport_route_stops",
    ["id", "route_id", "name", "sequence", "scheduled_time", "active"],
    [
      [stopIds.N1, routeNorth, "Hebbal Junction", 1, "07:30", true],
      [stopIds.N2, routeNorth, "Yelahanka Old Town", 2, "07:45", true],
      [stopIds.N3, routeNorth, "Jakkur Cross", 3, "08:00", true],
      [stopIds.N4, routeNorth, "Campus Main Gate", 4, "08:25", true],
      [stopIds.S1, routeSouth, "Jayanagar 4th Block", 1, "07:20", true],
      [stopIds.S2, routeSouth, "JP Nagar 6th Phase", 2, "07:40", true],
      [stopIds.S3, routeSouth, "Campus Main Gate", 3, "08:20", true],
    ],
  );

  // Aarav + Diya ride North; Sneha rides South. Others use own transport.
  const assignAarav = uuid();
  const assignDiya = uuid();
  const assignSneha = uuid();
  await insertBulk(
    "transport_assignments",
    ["id", "student_id", "route_id", "stop_id", "vehicle_id", "start_date", "status"],
    [
      [assignAarav, profileIdByUserId[studentIds.aarav], routeNorth, stopIds.N2, vehicleV1, addDays(-30), "ACTIVE"],
      [assignDiya, profileIdByUserId[studentIds.diya], routeNorth, stopIds.N1, vehicleV1, addDays(-30), "ACTIVE"],
      [assignSneha, profileIdByUserId[studentIds.sneha], routeSouth, stopIds.S2, vehicleV2, addDays(-30), "ACTIVE"],
    ],
  );

  await insertBulk(
    "transport_passes",
    ["id", "student_id", "assignment_id", "pass_number", "valid_from", "valid_until", "status"],
    [
      [uuid(), profileIdByUserId[studentIds.aarav], assignAarav, "SCBP-2026-AARAV1", addDays(-30), addDays(150), "ACTIVE"],
      [uuid(), profileIdByUserId[studentIds.diya], assignDiya, "SCBP-2026-DIYA01", addDays(-30), addDays(150), "ACTIVE"],
      [uuid(), profileIdByUserId[studentIds.sneha], assignSneha, "SCBP-2026-SNEHA1", addDays(-30), addDays(150), "ACTIVE"],
    ],
  );

  // Transport fees for assigned students (existing ledger; Aarav excluded to
  // preserve his asserted 96000 fully-paid totals).
  await insertBulk(
    "fees",
    ["id", "student_id", "fee_type", "amount", "amount_paid", "due_date", "status"],
    [
      [uuid(), profileIdByUserId[studentIds.diya], "Transport Fee - Semester 3", 18000, 9000, addDays(20), "PARTIAL"],
      [uuid(), profileIdByUserId[studentIds.sneha], "Transport Fee - Semester 3", 18000, 0, addDays(20), "PENDING"],
    ],
  );

  await insertBulk(
    "transport_alerts",
    ["id", "route_id", "title", "detail", "severity", "active", "created_by"],
    [
      [uuid(), routeNorth, "Jakkur Cross stop shifted 200m", "Due to road work this week, board at the temporary shelter past the flyover.", "WARNING", true, adminId],
    ],
  );

  // Demo telemetry (Phase 15): SIMULATED points only — no live hardware.
  // V1 (North) is moving near stop 2; V2 (South) is idle at stop 1;
  // V3 (maintenance) has only a stale point so it reads OFFLINE.
  await insertBulk(
    "transport_vehicle_telemetry",
    ["id", "vehicle_id", "latitude", "longitude", "speed_kmh", "heading_deg", "stop_sequence", "recorded_at", "source"],
    [
      [uuid(), vehicleV1, 13.0650, 77.5960, 32, 45, 1, new Date(Date.now() - 12 * 60000).toISOString(), "SIMULATED"],
      [uuid(), vehicleV1, 13.0720, 77.6010, 28, 50, 2, new Date(Date.now() - 2 * 60000).toISOString(), "SIMULATED"],
      [uuid(), vehicleV2, 12.9250, 77.5938, 0, 180, 1, new Date(Date.now() - 4 * 60000).toISOString(), "SIMULATED"],
      [uuid(), vehicleV3, 13.0350, 77.5900, 0, 0, 1, new Date(Date.now() - 6 * 60 * 60000).toISOString(), "SIMULATED"],
    ],
  );

  // -------------------------------------------- certificates (Phase 10)
  // Demo request states: 2 pending, 1 approved, 1 issued, 1 rejected, 1 revoked.
  // Issued demo certificates use low sequence numbers; the generator sequence
  // is moved past them so runtime issuance never collides.
  const certReqAarav = uuid();
  const certReqKarthik = uuid();
  const certAarav = uuid();
  const certKarthik = uuid();
  await insertBulk(
    "certificate_requests",
    ["id", "student_id", "certificate_type", "status", "purpose", "rejection_reason", "reviewed_by", "reviewed_at", "issued_by", "issued_at", "certificate_id"],
    [
      [uuid(), profileIdByUserId[studentIds.diya], "BONAFIDE", "PENDING", "Applying for an education loan at the bank.", null, null, null, null, null, null],
      [uuid(), profileIdByUserId[studentIds.ishita], "CONDUCT", "PENDING", "Required for an internship application.", null, null, null, null, null, null],
      [uuid(), profileIdByUserId[studentIds.sneha], "TRANSCRIPT", "APPROVED", "Needed for a summer program application.", null, adminId, addDays(-3), null, null, null],
      [certReqAarav, profileIdByUserId[studentIds.aarav], "BONAFIDE", "ISSUED", "Passport application.", null, adminId, addDays(-12), adminId, addDays(-10), null],
      [uuid(), profileIdByUserId[studentIds.rohan], "CONDUCT", "REJECTED", "Wanted for a part-time job.", "Incomplete purpose: please specify the requesting organization.", adminId, addDays(-2), null, null, null],
      [certReqKarthik, profileIdByUserId[studentIds.karthik], "ENROLLMENT", "REVOKED", "Scholarship form.", null, adminId, addDays(-20), adminId, addDays(-18), null],
    ],
  );

  await insertBulk(
    "certificates",
    ["id", "request_id", "student_id", "certificate_type", "certificate_number", "verification_code", "status", "issued_at", "revoked_at"],
    [
      [certAarav, certReqAarav, profileIdByUserId[studentIds.aarav], "BONAFIDE", "SC-2026-BON-000001", "DEMO-BONAFIDE-AARAV-01", "ISSUED", addDays(-10), null],
      [certKarthik, certReqKarthik, profileIdByUserId[studentIds.karthik], "ENROLLMENT", "SC-2026-ENR-000002", "DEMO-ENROLL-KARTHIK-02", "REVOKED", addDays(-18), addDays(-5)],
    ],
  );
  await pool.query(`UPDATE certificate_requests SET certificate_id = $1 WHERE id = $2`, [certAarav, certReqAarav]);
  await pool.query(`UPDATE certificate_requests SET certificate_id = $1 WHERE id = $2`, [certKarthik, certReqKarthik]);
  await pool.query("SELECT setval('certificate_no_seq', 100, true)");

  // ------------------------------------------------- library (Phase 11)
  // DEMO catalogue — example holdings for demonstration, not real university stock.
  const bookIds: Record<string, string> = {
    clrs: uuid(), dbBook: uuid(), osBook: uuid(), cnBook: uuid(), algoBook: uuid(),
    mathBook: uuid(), phyBook: uuid(), chemBook: uuid(), litBook: uuid(),
    hisBook: uuid(), ecoBook: uuid(), mlBook: uuid(),
  };
  const bookRows: Array<[string, string, string, string, string, string, string, string, number]> = [
    ["Introduction to Algorithms", "3rd", "978-0262033848", "Cormen, Leiserson, Rivest, Stein", "MIT Press", "Computer Science", "3rd", "The standard text on algorithms and data structures.", 2009],
    ["Database System Concepts", "", "978-0073523323", "Silberschatz, Korth, Sudarshan", "McGraw-Hill", "Computer Science", "6th", "Comprehensive coverage of database systems.", 2010],
    ["Operating System Concepts", "", "978-1119800361", "Silberschatz, Galvin, Gagne", "Wiley", "Computer Science", "10th", "Processes, memory, storage and protection.", 2021],
    ["Computer Networking: A Top-Down Approach", "", "978-0133594140", "Kurose, Ross", "Pearson", "Computer Science", "7th", "Networking from applications down to links.", 2016],
    ["The Algorithm Design Manual", "", "978-3030250583", "Steven Skiena", "Springer", "Computer Science", "3rd", "Practical algorithm design with war stories.", 2020],
    ["Discrete Mathematics and Its Applications", "", "978-0073398373", "Kenneth Rosen", "McGraw-Hill", "Mathematics", "8th", "Logic, sets, graphs and combinatorics.", 2019],
    ["Concepts of Physics Vol. 1", "", "978-8177091878", "H. C. Verma", "Bharati Bhawan", "Physics", "1st", "Mechanics, waves and thermodynamics.", 2017],
    ["Physical Chemistry", "", "978-0198769866", "Peter Atkins", "Oxford University Press", "Chemistry", "11th", "Thermodynamics, kinetics and quantum chemistry.", 2017],
    ["The Guide to Classic Literature", "", "978-0143101234", "Various Authors", "Penguin Classics", "Literature", "1st", "A curated tour of classic English literature.", 2015],
    ["A Brief History of Modern India", "", "978-9322591234", "Rajiv Ahir", "Spectrum", "History", "2nd", "Modern Indian history for competitive exams.", 2019],
    ["Indian Economy", "", "978-9356061234", "Ramesh Singh", "McGraw-Hill", "Economics", "14th", "Indian economy: sectors, policy and planning.", 2022],
    ["Hands-On Machine Learning", "", "978-1098123456", "Aurélien Géron", "O'Reilly", "Computer Science", "3rd", "Scikit-learn, Keras and TensorFlow in practice.", 2022],
  ];
  const bookKeys = Object.keys(bookIds);
  await insertBulk(
    "books",
    ["id", "title", "subtitle", "isbn", "author", "publisher", "category", "edition", "description", "publication_year"],
    bookKeys.map((key, i) => [bookIds[key], ...bookRows[i]]),
  );

  // Copies: popular titles get 3, others 1-2. Accession numbers are sequential.
  const copyPlan: Array<[string, number]> = [
    ["clrs", 3], ["dbBook", 2], ["osBook", 2], ["cnBook", 1], ["algoBook", 2],
    ["mathBook", 3], ["phyBook", 2], ["chemBook", 1], ["litBook", 1],
    ["hisBook", 1], ["ecoBook", 1], ["mlBook", 2],
  ];
  const copyIds: Record<string, string[]> = {};
  let accessionSeq = 1001;
  const copyRows: unknown[][] = [];
  for (const [key, count] of copyPlan) {
    copyIds[key] = [];
    for (let i = 0; i < count; i += 1) {
      const id = uuid();
      copyIds[key].push(id);
      copyRows.push([id, bookIds[key], `ACC-${accessionSeq++}`, "Main Stacks", "AVAILABLE"]);
    }
  }
  await insertBulk(
    "book_copies",
    ["id", "book_id", "accession_number", "location", "status"],
    copyRows,
  );
  const setCopyStatus = async (id: string, status: string) => {
    await pool.query(`UPDATE book_copies SET status = $1 WHERE id = $2`, [status, id]);
  };

  // Loans: Aarav holds CLRS copy 1 (due soon, no fine); Rohan holds DB copy 1
  // overdue by 10 days (fine accrues on return); Sneha returned OS copy 1 on
  // time (history without fine).
  const loanAarav = uuid();
  const loanRohan = uuid();
  await insertBulk(
    "library_loans",
    ["id", "copy_id", "student_id", "issued_at", "due_at", "renewed_count", "status", "issued_by"],
    [
      [loanAarav, copyIds.clrs[0], profileIdByUserId[studentIds.aarav], addDays(-11), addDays(3), 0, "ACTIVE", adminId],
      [loanRohan, copyIds.dbBook[0], profileIdByUserId[studentIds.rohan], addDays(-24), addDays(-10), 0, "ACTIVE", adminId],
      [uuid(), copyIds.osBook[0], profileIdByUserId[studentIds.sneha], addDays(-30), addDays(-16), 1, "RETURNED", adminId],
    ],
  );
  await pool.query(`UPDATE library_loans SET returned_at = $1 WHERE student_id = $2 AND status = 'RETURNED'`, [
    addDays(-16),
    profileIdByUserId[studentIds.sneha],
  ]);
  await setCopyStatus(copyIds.clrs[0], "ISSUED");
  await setCopyStatus(copyIds.dbBook[0], "ISSUED");

  // Reservation queue on Rohan's book: Diya waits first, Karthik second (FIFO demo).
  await insertBulk(
    "library_reservations",
    ["id", "book_id", "student_id", "status", "requested_at"],
    [
      [uuid(), bookIds.dbBook, profileIdByUserId[studentIds.diya], "WAITING", addDays(-4)],
      [uuid(), bookIds.dbBook, profileIdByUserId[studentIds.karthik], "WAITING", addDays(-1)],
    ],
  );

  // Accrued fine fixture: Rohan's overdue loan already has a ledger fine row
  // (10 days x Rs.10 = Rs.100, unpaid) so fine displays are demonstrable.
  await insertBulk(
    "fees",
    ["id", "student_id", "fee_type", "amount", "amount_paid", "due_date", "status", "library_loan_id"],
    [
      [uuid(), profileIdByUserId[studentIds.rohan], "Library Fine - overdue 10 days", 100, 0, addDays(14), "PENDING", loanRohan],
    ],
  );

  // ---------------------------------------------- placements (Phase 12)
  // DEMO companies/drives — fictional records for demonstration, not real partnerships.
  const companyNexa = uuid();
  const companyFin = uuid();
  const companyGov = uuid();
  const companyBright = uuid();
  const companyConsult = uuid();
  const companyHelp = uuid();
  await insertBulk(
    "companies",
    ["id", "name", "industry", "company_type", "website", "location", "description", "contact_name", "contact_email", "active"],
    [
      [companyNexa, "NexaTech Solutions", "Information Technology", "PRODUCT", "https://nexatech.example.com", "Bengaluru", "Demo record — not a real partnership. Product software company.", "Hiring Team", "hiring@nexatech.example.com", true],
      [companyFin, "FinEdge Services", "Financial Services", "SERVICE", "https://finedge.example.com", "Mumbai", "Demo record — not a real partnership. Financial services firm.", "Campus Hiring", "campus@finedge.example.com", true],
      [companyGov, "GovPower Utility", "Energy", "GOVERNMENT", "https://govpower.example.com", "New Delhi", "Demo record — not a real partnership. Public sector utility.", "Recruitment Cell", "recruit@govpower.example.com", true],
      [companyBright, "BrightStart", "Information Technology", "STARTUP", "https://brightstart.example.com", "Bengaluru", "Demo record — not a real partnership. Early-stage startup.", "Founders", "hello@brightstart.example.com", true],
      [companyConsult, "ConsultWise", "Consulting", "CONSULTING", "https://consultwise.example.com", "Hyderabad", "Demo record — not a real partnership. Management consultancy.", "Talent Team", "talent@consultwise.example.com", true],
      [companyHelp, "HelpDesk Co", "Customer Support", "SERVICE", "https://helpdeskco.example.com", "Chennai", "Demo record — not a real partnership. Support services company.", "HR Team", "hr@helpdeskco.example.com", true],
    ],
  );

  const driveSwe = uuid();
  const driveAnalyst = uuid();
  const driveGet = uuid();
  const driveSupport = uuid();
  const driveIntern = uuid();
  await insertBulk(
    "placement_drives",
    ["id", "company_id", "title", "job_role", "description", "package_min", "package_max", "currency", "employment_type", "work_mode", "location", "openings", "application_deadline", "drive_date", "min_cgpa", "max_backlogs", "min_attendance", "eligible_departments", "eligible_semesters", "graduation_year", "status", "created_by"],
    [
      [driveSwe, companyNexa, "Campus Hiring 2026", "Software Engineer", "Full-stack product development role.", 800000, 1400000, "INR", "FULL_TIME", "HYBRID", "Bengaluru", 25, addDays(30), addDays(45), 7.0, 0, 75, ["Computer Science and Engineering"], [], 2029, "OPEN", adminId],
      [driveAnalyst, companyFin, "Analyst Hiring 2026", "Business Analyst", "Analytics and reporting role.", 600000, 900000, "INR", "FULL_TIME", "ONSITE", "Mumbai", 15, addDays(25), addDays(40), 6.0, 1, null, ["Computer Science and Engineering"], [], 2029, "OPEN", adminId],
      [driveGet, companyGov, "Graduate Engineer Trainee 2026", "Graduate Engineer Trainee", "Public sector engineering role.", 900000, 1200000, "INR", "FULL_TIME", "ONSITE", "New Delhi", 5, addDays(20), addDays(35), 8.5, 0, null, ["Computer Science and Engineering"], [], 2029, "OPEN", adminId],
      [driveSupport, companyHelp, "Support Hiring 2026", "Support Engineer", "Customer support engineering role.", 300000, 400000, "INR", "FULL_TIME", "ONSITE", "Chennai", 10, addDays(30), addDays(50), 3.5, null, null, [], [], 2029, "OPEN", adminId],
      [driveIntern, companyBright, "Summer Internship 2026", "Software Intern", "Summer internship (applications closed).", 50000, 80000, "INR", "INTERNSHIP", "HYBRID", "Bengaluru", 8, addDays(-5), addDays(10), 6.0, 2, null, [], [], 2029, "CLOSED", adminId],
    ],
  );

  // Applications: Aarav applied; Sneha shortlisted + interviewed; Diya selected
  // with an accepted offer; Ishita rejected; Rohan applied to the lenient drive.
  const appAarav = uuid();
  const appSneha = uuid();
  const appDiya = uuid();
  const appIshita = uuid();
  const appRohan = uuid();
  await insertBulk(
    "placement_applications",
    ["id", "drive_id", "student_id", "status", "applied_at"],
    [
      [appAarav, driveSwe, profileIdByUserId[studentIds.aarav], "APPLIED", addDays(-2)],
      [appSneha, driveSwe, profileIdByUserId[studentIds.sneha], "SHORTLISTED", addDays(-6)],
      [appDiya, driveAnalyst, profileIdByUserId[studentIds.diya], "SELECTED", addDays(-12)],
      [appIshita, driveSwe, profileIdByUserId[studentIds.ishita], "REJECTED", addDays(-8)],
      [appRohan, driveSupport, profileIdByUserId[studentIds.rohan], "APPLIED", addDays(-3)],
    ],
  );

  await insertBulk(
    "placement_interviews",
    ["id", "application_id", "round_name", "round_number", "scheduled_at", "location", "status", "feedback"],
    [
      [uuid(), appSneha, "Technical Round", 1, addDays(7), "CSE Seminar Hall", "SCHEDULED", ""],
    ],
  );

  await insertBulk(
    "placement_offers",
    ["id", "application_id", "package_amount", "currency", "employment_type", "joining_date", "offer_status", "issued_at"],
    [
      [uuid(), appDiya, 950000, "INR", "FULL_TIME", addDays(120), "ACCEPTED", addDays(-4)],
    ],
  );

  // ------------------------------------------------- alumni (Phase 13)
  // DEMO alumni — fictional graduate records for demonstration, not real alumni.
  const alumniUsers: Array<{ id: string; name: string; email: string }> = [
    { id: uuid(), name: "Arjun Menon", email: "arjun.menon@alumni.smartcampus.edu" },
    { id: uuid(), name: "Divya Rao", email: "divya.rao@alumni.smartcampus.edu" },
    { id: uuid(), name: "Sanjay Krishnan", email: "sanjay.krishnan@alumni.smartcampus.edu" },
    { id: uuid(), name: "Ananya Iyer", email: "ananya.iyer@alumni.smartcampus.edu" },
    { id: uuid(), name: "Vikram Reddy", email: "vikram.reddy@alumni.smartcampus.edu" },
  ];

  await pool.query(
    `INSERT INTO users (id, name, email, password_hash, role)
     SELECT u.id, u.name, u.email, $1, 'ALUMNI'
     FROM (VALUES ${alumniUsers.map((_, i) => `($${i * 3 + 2}::uuid, $${i * 3 + 3}::text, $${i * 3 + 4}::text)`).join(", ")})
       AS u(id, name, email)`,
    [passwordHash, ...alumniUsers.flatMap((a) => [a.id, a.name, a.email])],
  );

  const alumniByEmail = Object.fromEntries(alumniUsers.map((a) => [a.email, a]));
  const alumniProfileArjun = uuid();
  const alumniProfileDivya = uuid();
  const alumniProfileSanjay = uuid();
  const alumniProfileAnanya = uuid();
  const alumniProfileVikram = uuid();
  await insertBulk(
    "alumni_profiles",
    ["id", "user_id", "graduation_year", "graduation_program", "department", "current_company", "current_position", "industry", "location", "bio", "linkedin_url", "offers_mentorship", "mentorship_topics", "mentorship_mode", "availability", "visibility", "verification", "status"],
    [
      [alumniProfileArjun, alumniByEmail["arjun.menon@alumni.smartcampus.edu"].id, 2022, "B.Tech", "Computer Science and Engineering", "NexaTech Solutions", "Software Engineer", "Information Technology", "Bengaluru", "Backend systems engineer.", "https://linkedin.example.com/in/arjunmenon", true, "Backend Development, System Design", "ONLINE", "Weekends", "PUBLIC", "VERIFIED", "ALUMNI"],
      [alumniProfileDivya, alumniByEmail["divya.rao@alumni.smartcampus.edu"].id, 2021, "B.Tech", "Computer Science and Engineering", "FinEdge Services", "Business Analyst", "Finance", "Mumbai", "Data-driven product analyst.", "https://linkedin.example.com/in/divyarao", true, "Career Guidance, Analytics", "BOTH", "Weekday evenings", "PUBLIC", "VERIFIED", "ALUMNI"],
      [alumniProfileSanjay, alumniByEmail["sanjay.krishnan@alumni.smartcampus.edu"].id, 2020, "B.Tech", "Computer Science and Engineering", "HelpDesk Co", "Support Lead", "Customer Support", "Chennai", "Customer support engineering lead.", "", false, "", "ONLINE", "", "PUBLIC", "VERIFIED", "ALUMNI"],
      [alumniProfileAnanya, alumniByEmail["ananya.iyer@alumni.smartcampus.edu"].id, 2023, "B.Tech", "Computer Science and Engineering", "BrightStart", "Product Designer", "Design", "Bengaluru", "Product designer.", "", false, "", "ONLINE", "", "PRIVATE", "VERIFIED", "ALUMNI"],
      [alumniProfileVikram, alumniByEmail["vikram.reddy@alumni.smartcampus.edu"].id, 2024, "B.Tech", "Computer Science and Engineering", "", "", "", "", "", "", false, "", "ONLINE", "", "PUBLIC", "UNVERIFIED", "PENDING"],
    ],
  );

  // Mentorships: Aarav requested Arjun (waiting); Sneha active with Divya.
  await insertBulk(
    "alumni_mentorships",
    ["id", "alumni_id", "student_id", "topic", "message", "status", "requested_at"],
    [
      [uuid(), alumniProfileArjun, profileIdByUserId[studentIds.aarav], "Backend Development", "Guidance on backend internships.", "REQUESTED", addDays(-2)],
      [uuid(), alumniProfileDivya, profileIdByUserId[studentIds.sneha], "Career Guidance", "Help choosing electives.", "ACCEPTED", addDays(-9)],
    ],
  );

  // Events: two published (one with registrations), one draft.
  const eventMeet = uuid();
  const eventTalk = uuid();
  await insertBulk(
    "alumni_events",
    ["id", "title", "description", "event_type", "location", "starts_at", "ends_at", "capacity", "audience", "status", "created_by"],
    [
      [eventMeet, "Alumni Meet 2026", "Annual alumni reunion on campus.", "MEET", "Main Auditorium", addDays(30), addDays(30), 200, "ALL", "PUBLISHED", adminId],
      [eventTalk, "Career Talk: Cracking Product Interviews", "Arjun on product interview prep.", "CAREER_TALK", "CSE Seminar Hall", addDays(14), addDays(14), 50, "STUDENTS", "PUBLISHED", adminId],
      [uuid(), "Winter Reunion Planning", "Draft planning session.", "REUNION", "", addDays(60), addDays(60), 100, "ALUMNI", "DRAFT", adminId],
    ],
  );

  await insertBulk(
    "alumni_event_registrations",
    ["id", "event_id", "user_id", "status"],
    [
      [uuid(), eventTalk, studentIds.aarav, "REGISTERED"],
      [uuid(), eventTalk, studentIds.sneha, "REGISTERED"],
    ],
  );

  // Campaign + contributions: two recorded, one pledged.
  const campaignLibrary = uuid();
  await insertBulk(
    "alumni_campaigns",
    ["id", "title", "description", "target_amount", "status", "start_date", "created_by"],
    [
      [campaignLibrary, "Library Expansion Fund", "Demo campaign for library growth.", 500000, "ACTIVE", addDays(-30), adminId],
    ],
  );
  await insertBulk(
    "alumni_contributions",
    ["id", "campaign_id", "alumni_id", "amount", "currency", "status", "reference"],
    [
      [uuid(), campaignLibrary, alumniProfileArjun, 25000, "INR", "RECORDED", "DEMO-REF-001"],
      [uuid(), campaignLibrary, alumniProfileDivya, 10000, "INR", "RECORDED", "DEMO-REF-002"],
      [uuid(), campaignLibrary, alumniProfileSanjay, 5000, "INR", "PLEDGED", "DEMO-REF-003"],
    ],
  );

  // --------------------------------------------------- mess (Phase 14)
  const planMonthlyVeg = uuid();
  const planMonthlyNonVeg = uuid();
  const planPayPerMeal = uuid();
  await insertBulk(
    "mess_plans",
    ["id", "name", "description", "billing_type", "price", "meals_per_day", "active"],
    [
      [planMonthlyVeg, "Monthly Veg Plan", "Four vegetarian meals a day, billed monthly.", "MONTHLY", 4500, 4, true],
      [planMonthlyNonVeg, "Monthly Non-Veg Plan", "Four meals a day with non-veg options, billed monthly.", "MONTHLY", 5500, 4, true],
      [planPayPerMeal, "Pay Per Meal", "Pay Rs.60 for each consumed meal.", "MEAL_BASED", 60, 4, true],
    ],
  );

  // Aarav + Sneha on monthly veg, Rohan on pay-per-meal. Diya/Karthik/Ishita unenrolled.
  await insertBulk(
    "mess_enrollments",
    ["id", "student_id", "plan_id", "start_date", "status", "auto_renew"],
    [
      [uuid(), profileIdByUserId[studentIds.aarav], planMonthlyVeg, addDays(-60), "ACTIVE", true],
      [uuid(), profileIdByUserId[studentIds.sneha], planMonthlyVeg, addDays(-60), "ACTIVE", true],
      [uuid(), profileIdByUserId[studentIds.rohan], planPayPerMeal, addDays(-60), "ACTIVE", true],
    ],
  );

  // 7-day menu (yesterday .. +5 days) for all four meal types.
  const menuDishes: Record<string, string[]> = {
    BREAKFAST: ["Idli, sambar and chutney", "Poha with peanuts and tea", "Dosa with sambar", "Upma with coconut chutney", "Aloo paratha with curd", "Puri bhaji", "Veg sandwich and milk"],
    LUNCH:     ["Rice, dal, sabzi and roti", "Veg biryani with raita", "Rajma chawal", "Sambar rice with papad", "Khichdi with ghee", "Chole bhature", "Lemon rice with fryums"],
    SNACKS: ["Samosa and chai", "Bhel puri", "Banana and biscuits", "Pakora and chutney", "Cake slice and juice", "Vada pav", "Popcorn and lemonade"],
    DINNER: ["Roti, paneer butter masala and rice", "Veg fried rice with manchurian", "Dal tadka, jeera rice and roti", "Pasta in white sauce", "Masala dosa", "Palak paneer with naan", "Curd rice with pickle"],
  };
  const menuRows: unknown[][] = [];
  const mealTypes = ["BREAKFAST", "LUNCH", "SNACKS", "DINNER"];
  for (let offset = -1; offset <= 5; offset += 1) {
    const dayIndex = ((offset % 7) + 7) % 7;
    mealTypes.forEach((meal, i) => {
      menuRows.push([uuid(), addDays(offset), meal, menuDishes[meal][(dayIndex + i) % 7], 400 + ((dayIndex * 37 + i * 53) % 300), true]);
    });
  }
  await insertBulk(
    "mess_menu",
    ["id", "meal_date", "meal_type", "menu_description", "calories", "active"],
    menuRows,
  );

  // Meal attendance for enrolled students over the last 7 days (mostly consumed).
  const mealRandom = mulberry32(424242);
  const mealAttendanceRows: unknown[][] = [];
  const enrolledProfiles = [studentIds.aarav, studentIds.sneha, studentIds.rohan].map((id) => profileIdByUserId[id]);
  for (let offset = -7; offset <= -1; offset += 1) {
    for (const profileId of enrolledProfiles) {
      for (const meal of mealTypes) {
        const consumed = mealRandom() < 0.85;
        mealAttendanceRows.push([uuid(), profileId, addDays(offset), meal, consumed, adminId]);
      }
    }
  }
  for (let i = 0; i < mealAttendanceRows.length; i += 500) {
    await insertBulk(
      "meal_attendance",
      ["id", "student_id", "meal_date", "meal_type", "consumed", "recorded_by"],
      mealAttendanceRows.slice(i, i + 500),
    );
  }

  // Canteen catalogue (12 items across categories).
  const canteenIds: Record<string, string> = {};
  const canteenRows: Array<[string, string, string, number]> = [
    ["Masala Chai", "BEVERAGE", "Cutting chai brewed with ginger.", 15],
    ["Filter Coffee", "BEVERAGE", "South Indian filter coffee.", 25],
    ["Fresh Lime Juice", "BEVERAGE", "Sweet and salted lime juice.", 30],
    ["Veg Puff", "SNACK", "Flaky pastry with spiced vegetables.", 20],
    ["Samosa (2 pc)", "SNACK", "Crispy punjabi samosa with chutney.", 25],
    ["Paneer Wrap", "SNACK", "Grilled paneer tikka wrap.", 70],
    ["Veg Fried Rice", "MEAL", "Wok-tossed rice with vegetables.", 80],
    ["Chole Bhature", "MEAL", "Classic chole with two bhature.", 90],
    ["Masala Dosa", "MEAL", "Crisp dosa with sambar and chutneys.", 60],
    ["Gulab Jamun (4 pc)", "DESSERT", "Warm gulab jamun.", 40],
    ["Ice Cream Cup", "DESSERT", "Vanilla ice cream cup.", 35],
    ["Bottled Water", "OTHER", "1 litre bottled water.", 20],
  ];
  const canteenBulk: unknown[][] = [];
  canteenRows.forEach(([name, category, description, price]) => {
    const id = uuid();
    canteenIds[name] = id;
    canteenBulk.push([id, name, category, description, price, true]);
  });
  await insertBulk(
    "canteen_items",
    ["id", "name", "category", "description", "price", "available"],
    canteenBulk,
  );

  // Orders: Aarav 2 completed + 1 pending; Rohan 1 completed.
  const orderAarav1 = uuid();
  const orderAarav2 = uuid();
  const orderAaravPending = uuid();
  const orderRohan1 = uuid();
  await insertBulk(
    "canteen_orders",
    ["id", "student_id", "status", "total_amount", "ordered_at", "completed_at"],
    [
      [orderAarav1, profileIdByUserId[studentIds.aarav], "COMPLETED", 55, addDays(-3), addDays(-3)],
      [orderAarav2, profileIdByUserId[studentIds.aarav], "COMPLETED", 95, addDays(-1), addDays(-1)],
      [orderAaravPending, profileIdByUserId[studentIds.aarav], "PENDING", 25, addDays(0), null],
      [orderRohan1, profileIdByUserId[studentIds.rohan], "COMPLETED", 60, addDays(-2), addDays(-2)],
    ],
  );
  await insertBulk(
    "canteen_order_items",
    ["id", "order_id", "item_id", "quantity", "unit_price", "total_price"],
    [
      [uuid(), orderAarav1, canteenIds["Masala Chai"], 2, 15, 30],
      [uuid(), orderAarav1, canteenIds["Veg Puff"], 1, 20, 20],
      [uuid(), orderAarav1, canteenIds["Samosa (2 pc)"], 1, 25, 25],
      [uuid(), orderAarav2, canteenIds["Paneer Wrap"], 1, 70, 70],
      [uuid(), orderAarav2, canteenIds["Filter Coffee"], 1, 25, 25],
      [uuid(), orderAaravPending, canteenIds["Fresh Lime Juice"], 1, 30, 30],
      [uuid(), orderRohan1, canteenIds["Masala Dosa"], 1, 60, 60],
    ],
  );

  // Fix order totals to match their items (55 was a placeholder above).
  await pool.query(`UPDATE canteen_orders SET total_amount = 75 WHERE id = $1`, [orderAarav1]);

  // Feedback samples.
  await insertBulk(
    "mess_feedback",
    ["id", "student_id", "meal_date", "meal_type", "rating", "comment"],
    [
      [uuid(), profileIdByUserId[studentIds.aarav], addDays(-1), "LUNCH", 4, "Good variety this week."],
      [uuid(), profileIdByUserId[studentIds.sneha], addDays(-1), "DINNER", 5, "Paneer was excellent."],
      [uuid(), profileIdByUserId[studentIds.rohan], addDays(-2), "BREAKFAST", 3, "Tea was cold."],
    ],
  );

  // One billed food month (2026-08) for Rohan so billing history is demonstrable.
  // API/E2E billing tests use other months, so no collisions occur.
  await insertBulk(
    "fees",
    ["id", "student_id", "fee_type", "amount", "amount_paid", "due_date", "status"],
    [
      [uuid(), profileIdByUserId[studentIds.rohan], "Mess Plan - 2026-08", 1860, 0, addDays(14), "PENDING"],
    ],
  );

  console.log(`[seed:test] users=${1 + parentUsers.length + alumniUsers.length + facultyUsers.length + studentUsers.length} courses=${courses.length} timetable=${timetable.length} fees=${feeRows.length + hostelFeeRows.length + 2} payments=${paymentRows.length} assessments=${assessmentRows.length} assignments=${assignmentRows.length} learning_resources=${resourceRows.length} parent_links=4 parent_invites=1 cert_requests=6 certificates=2 alumni=5`);
  console.log(`[seed:test] fixture accounts share one password: ${DEMO_PASSWORD} (automated tests only)`);
  console.log(`[seed:test] fixture parent invitation token: ${demoInviteToken}`);
}

main()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("[seed:test] failed:", error instanceof Error ? error.message : error);
    await pool.end();
    process.exit(1);
  });
