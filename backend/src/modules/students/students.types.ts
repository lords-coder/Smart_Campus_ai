export interface StudentMe {
  id: string;
  studentNo: string;
  department: string;
  semester: number;
  section: string;
  batchYear: number;
  user: { id: string; name: string; email: string; role: string };
}

export interface AttendanceCourseSummary {
  courseId: string;
  code: string;
  name: string;
  present: number;
  late: number;
  absent: number;
  leave: number;
  total: number;
  percentage: number;
}

export interface AttendanceSummary {
  overall: {
    percentage: number;
    present: number;
    late: number;
    absent: number;
    leave: number;
    total: number;
  };
  byCourse: AttendanceCourseSummary[];
}

export interface AttendanceRecord {
  id: string;
  date: string;
  status: string;
  course: { code: string; name: string };
}

export interface AttendanceHistory {
  records: AttendanceRecord[];
}

export interface FeeRecord {
  id: string;
  feeType: string;
  amount: number;
  amountPaid: number;
  balance: number;
  dueDate: string;
  status: "PENDING" | "PARTIAL" | "PAID";
}

export interface FeesSummary {
  totalFees: number;
  totalPaid: number;
  totalPending: number;
  nextDue: { feeId: string; feeType: string; amount: number; dueDate: string } | null;
  records: FeeRecord[];
}

export interface TimetableEntry {
  id: string;
  startTime: string;
  endTime: string;
  room: string;
  section: string;
  course: { id: string; code: string; name: string; credits: number };
  faculty: { id: string; name: string } | null;
}

export interface TimetableDay {
  day: string;
  date: string;
  entries: TimetableEntry[];
}

export function percentage(attended: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((attended / total) * 1000) / 10;
}
