export const COMPANY_TYPES = [
  "PRODUCT",
  "SERVICE",
  "STARTUP",
  "CONSULTING",
  "GOVERNMENT",
  "NON_PROFIT",
  "OTHER",
] as const;

export type CompanyType = (typeof COMPANY_TYPES)[number];

export const DRIVE_STATUSES = ["DRAFT", "OPEN", "CLOSED", "CANCELLED", "COMPLETED"] as const;
export type DriveStatus = (typeof DRIVE_STATUSES)[number];

export const APPLICATION_STATUSES = [
  "APPLIED",
  "SHORTLISTED",
  "INTERVIEW",
  "SELECTED",
  "WAITLISTED",
  "REJECTED",
  "WITHDRAWN",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const INTERVIEW_STATUSES = ["SCHEDULED", "COMPLETED", "CANCELLED", "MISSED"] as const;
export const OFFER_STATUSES = ["PENDING", "ACCEPTED", "DECLINED", "WITHDRAWN"] as const;

/** Staff-driven application transitions (students may only withdraw). */
export const APPLICATION_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  APPLIED: ["SHORTLISTED", "REJECTED", "WITHDRAWN"],
  SHORTLISTED: ["INTERVIEW", "REJECTED", "WITHDRAWN"],
  INTERVIEW: ["SELECTED", "REJECTED", "WAITLISTED"],
  WAITLISTED: ["INTERVIEW", "SELECTED", "REJECTED"],
  SELECTED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

export interface AcademicStanding {
  cgpa: number;
  backlogs: number;
  attendancePercentage: number;
  department: string;
  semester: number;
  graduationYear: number;
}

export interface EligibilityRule {
  minCgpa: number | null;
  maxBacklogs: number | null;
  minAttendance: number | null;
  departments: string[];
  semesters: number[];
  graduationYear: number | null;
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
  standing: AcademicStanding;
}

export interface DriveListItem {
  id: string;
  companyId: string;
  companyName: string;
  industry: string;
  title: string;
  jobRole: string;
  packageMin: number;
  packageMax: number;
  currency: string;
  employmentType: string;
  workMode: string;
  location: string;
  openings: number;
  applicationDeadline: string;
  driveDate: string | null;
  status: DriveStatus;
  applicationCount: number;
  myApplicationStatus: ApplicationStatus | null;
  eligibility: EligibilityResult | null;
}

export interface PlacedRecord {
  studentId: string;
  studentNo: string;
  studentName: string;
  companyName: string;
  jobRole: string;
  packageAmount: number;
  currency: string;
  joiningDate: string | null;
  year: number;
}
