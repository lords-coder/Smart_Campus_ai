export const TIMETABLE_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type TimetableDayName = (typeof TIMETABLE_DAYS)[number];

export type TimetableConflictType = "FACULTY" | "ROOM" | "SECTION";

export interface TimetableConflict {
  type: TimetableConflictType;
  entryId: string;
  day: TimetableDayName;
  startTime: string;
  endTime: string;
  room: string;
  section: string;
  courseCode: string;
  facultyName: string | null;
  message: string;
}

export interface TimetableEntryView {
  id: string;
  day: TimetableDayName;
  startTime: string;
  endTime: string;
  room: string;
  section: string;
  semester: number;
  department: string;
  isActive: boolean;
  archivedAt: string | null;
  studentCount: number;
  attendanceRecordCount: number;
  course: { id: string; code: string; name: string; credits: number };
  faculty: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface TimetableList {
  entries: TimetableEntryView[];
  total: number;
}

export interface TimetableOptions {
  courses: { id: string; code: string; name: string; credits: number; semester: number; department: string }[];
  faculties: { id: string; name: string; department: string }[];
  sections: { section: string; semester: number; studentCount: number }[];
}

export interface TimetableArchiveResult {
  entry: TimetableEntryView;
  archived: true;
  preservedAttendanceRecords: number;
}

export interface TimetableDeleteResult {
  entryId: string;
  deleted: true;
}
