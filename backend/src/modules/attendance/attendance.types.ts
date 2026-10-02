export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "LEAVE"] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export function isAttendanceStatus(value: string): value is AttendanceStatus {
  return (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

export interface ClassSummary {
  id: string;
  day: string;
  startTime: string;
  endTime: string;
  room: string;
  section: string;
  semester: number;
  studentCount: number;
  course: { id: string; code: string; name: string };
  faculty: { id: string; name: string } | null;
}

export interface RosterStudent {
  studentId: string;
  studentNo: string;
  name: string;
  status: AttendanceStatus | null;
}

export interface ClassAttendanceState {
  class: ClassSummary;
  date: string;
  alreadySubmitted: boolean;
  recordedCount: number;
  students: RosterStudent[];
}

export interface AttendanceCounts {
  PRESENT: number;
  ABSENT: number;
  LATE: number;
  LEAVE: number;
}

export interface AttendanceSubmitResult {
  timetableEntryId: string;
  date: string;
  courseCode: string;
  section: string;
  submitted: number;
  inserted: number;
  updated: number;
  isUpdate: boolean;
  counts: AttendanceCounts;
}

export function emptyCounts(): AttendanceCounts {
  return { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 };
}

export function countBy(statuses: AttendanceStatus[]): AttendanceCounts {
  const counts = emptyCounts();
  for (const status of statuses) counts[status] += 1;
  return counts;
}
