export type Role = "STUDENT" | "FACULTY" | "ADMIN" | "PARENT" | "ALUMNI" | "SUPER_ADMIN";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt?: string;
}

export interface StudentProfile {
  studentNo: string;
  department: string;
  semester: number;
  section: string;
  batchYear: number;
}

export interface FacultyProfile {
  employeeNo: string;
  department: string;
  designation: string;
}

export interface ParentLinkedStudent {
  studentId: string;
  studentNo: string;
  name: string;
  department: string;
  semester: number;
  section: string;
  relationshipType: string;
}

export interface ParentProfile {
  linkedStudents: ParentLinkedStudent[];
}

export interface ParentStudentsResponse {
  students: ParentLinkedStudent[];
}

export interface ParentOverview {
  student: {
    id: string;
    studentNo: string;
    name: string;
    department: string;
    semester: number;
    section: string;
    batchYear: number;
  };
  academic: {
    attendancePercentage: number;
    avgAssessmentPercentage: number;
    totalAssessments: number;
    assignmentSubmissionRate: number;
    performanceCategory: string | null;
  };
}

export interface ParentRecommendationHeadline {
  courseName: string;
  category: string;
  priority: string;
  reason: string;
  resources: Array<{ title: string; url: string | null; type: string; topic: string }>;
  resourceCount: number;
}

export interface ParentRecommendations {
  summary: { highPriority: number; mediumPriority: number; coursesNeedingAttention: number };
  headlines: ParentRecommendationHeadline[];
}

export interface ParentNotice {
  kind: "ATTENDANCE_WARNING" | "FEE_DUE" | "TODAY_CLASSES";
  title: string;
  detail: string;
}

export interface ParentLibrary {
  activeLoans: Array<{ bookTitle: string; dueAt: string; overdue: boolean; overdueDays: number; renewedCount: number }>;
  reservations: Array<{ bookTitle: string; status: string; queuePosition: number | null }>;
  fineTotal: number;
}

export interface HostelSummary {
  id: string;
  name: string;
  block: string;
  category: string;
  wardenName: string | null;
  active: boolean;
  roomCount: number;
  bedCapacity: number;
  occupiedBeds: number;
  occupancyPercentage: number;
}

export interface HostelOccupant {
  studentId: string;
  studentNo: string;
  name: string;
  bedNumber: number;
}

export interface HostelRoom {
  id: string;
  hostelId: string;
  hostelName: string;
  roomNumber: string;
  floor: number;
  roomType: string;
  capacity: number;
  status: string;
  occupiedBeds: number;
  occupants: HostelOccupant[];
}

export interface HostelAllocation {
  id: string;
  roomId: string;
  roomNumber: string;
  hostelId: string;
  hostelName: string;
  studentId: string;
  studentNo: string;
  studentName: string;
  bedNumber: number;
  allocatedOn: string;
  vacatedOn: string | null;
  status: string;
}

export interface MyHostel {
  allocation: {
    id: string;
    bedNumber: number;
    allocatedOn: string;
    room: { id: string; roomNumber: string; floor: number; roomType: string; capacity: number };
    hostel: { id: string; name: string; block: string; wardenName: string | null };
  } | null;
  roommates: Array<{ studentNo: string; name: string; bedNumber: number }>;
  fees: Array<{ id: string; feeType: string; amount: number; amountPaid: number; balance: number; dueDate: string; status: string }>;
}

export interface HostelComplaint {
  id: string;
  studentId: string;
  studentNo?: string;
  studentName?: string;
  roomId: string | null;
  roomNumber?: string | null;
  category: string;
  description: string;
  status: string;
  priority: string;
  createdAt: string;
}

export interface RoomChangeRequest {
  id: string;
  studentId: string;
  studentNo?: string;
  studentName?: string;
  currentRoomId: string;
  currentRoomNumber?: string;
  requestedRoomId: string | null;
  requestedRoomNumber?: string | null;
  reason: string;
  status: string;
  createdAt: string;
}

export interface HostelVisitor {
  id: string;
  studentId: string;
  studentNo?: string;
  studentName?: string;
  visitorName: string;
  relation: string;
  visitDate: string;
  visitTime: string | null;
  status: string;
  createdAt: string;
}

export interface HostelDashboard {
  hostels: HostelSummary[];
  totals: {
    totalRooms: number;
    occupiedBeds: number;
    vacantBeds: number;
    occupancyPercentage: number;
    pendingAllocations: number;
    openComplaints: number;
    pendingRoomChanges: number;
  };
}

export interface TransportVehicle {
  id: string;
  registrationNumber: string;
  vehicleType: string;
  capacity: number;
  status: string;
  driverId: string | null;
  driverName: string | null;
  assignedStudents: number;
}

export interface TransportDriver {
  id: string;
  name: string;
  phone: string;
  licenseNo: string;
  active: boolean;
}

export interface TransportRoute {
  id: string;
  routeCode: string;
  name: string;
  active: boolean;
  stopCount: number;
  assignedStudents: number;
  vehicleId: string | null;
  vehicleNumber: string | null;
}

export interface TransportStop {
  id: string;
  routeId: string;
  name: string;
  sequence: number;
  scheduledTime: string;
  active: boolean;
}

export interface TransportAssignment {
  id: string;
  studentId: string;
  studentNo?: string;
  studentName?: string;
  routeId: string;
  routeCode?: string;
  routeName?: string;
  stopId: string;
  stopName?: string;
  scheduledTime?: string;
  vehicleId: string | null;
  vehicleNumber?: string | null;
  passNumber?: string | null;
  passStatus?: string | null;
  startDate: string;
  endDate: string | null;
  status: string;
}

export interface TransportAlert {
  id: string;
  routeId: string;
  routeCode?: string;
  title: string;
  detail: string;
  severity: string;
  active: boolean;
  createdAt: string;
}

export interface MyTransport {
  assignment: {
    id: string;
    route: { id: string; routeCode: string; name: string };
    stop: { id: string; name: string; scheduledTime: string };
    vehicle: { id: string; registrationNumber: string; vehicleType: string; status: string; driverName: string | null } | null;
    startDate: string;
    allStops: Array<{ name: string; sequence: number; scheduledTime: string }>;
  } | null;
  pass: {
    passNumber: string;
    validFrom: string;
    validUntil: string;
    status: string;
    transportFeeStatus: string | null;
  } | null;
  alerts: Array<{ title: string; detail: string; severity: string }>;
  tracking: {
    vehicleId: string;
    registrationNumber: string;
    vehicleStatus: string;
    trackingStatus: "MOVING" | "IDLE" | "OFFLINE";
    simulated: boolean;
    lastUpdateAt: string | null;
    latitude: number | null;
    longitude: number | null;
    speedKmh: number | null;
    route: { id: string; routeCode: string; name: string } | null;
    currentStop: { id: string; name: string; sequence: number } | null;
    nextStop: { id: string; name: string; sequence: number; scheduledTime: string } | null;
    progressPct: number | null;
  } | null;
}

export interface ParentHostel {
  allocation: {
    hostel: { id: string; name: string; block: string; wardenName: string | null };
    roomNumber: string;
    bedNumber: number;
    allocatedOn: string;
  } | null;
  roommateCount: number;
  fees: MyHostel["fees"];
}

export type CertificateType = "BONAFIDE" | "TRANSCRIPT" | "CONDUCT" | "ENROLLMENT";
export type CertificateRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "ISSUED" | "REVOKED";

export type VehicleTracking = NonNullable<MyTransport["tracking"]>;

export interface CertificateRequest {
  id: string;
  studentId: string;
  studentNo?: string;
  studentName?: string;
  certificateType: CertificateType;
  status: CertificateRequestStatus;
  purpose: string;
  rejectionReason: string | null;
  reviewedBy?: string | null;
  reviewedAt: string | null;
  issuedAt: string | null;
  certificateId: string | null;
  createdAt: string;
}

export interface Certificate {
  id: string;
  requestId: string;
  studentId: string;
  studentNo?: string;
  studentName?: string;
  certificateType: CertificateType;
  certificateNumber: string;
  verificationCode: string;
  status: "ISSUED" | "REVOKED";
  issuedAt: string;
  revokedAt: string | null;
  purpose?: string;
}

export interface PublicVerification {
  certificateNumber: string;
  certificateType: CertificateType;
  studentName: string;
  institution: string;
  issuedDate: string;
  status: "VALID" | "REVOKED";
}

export interface BookListItem {
  id: string;
  title: string;
  subtitle: string;
  isbn: string;
  author: string;
  publisher: string;
  category: string;
  edition: string;
  publicationYear: number | null;
  active: boolean;
  totalCopies: number;
  availableCopies: number;
}

export interface BookDetail extends BookListItem {
  description: string;
  copies: Array<{ id: string; accessionNumber: string; location: string; status: string }>;
}

export interface Loan {
  id: string;
  copyId: string;
  accessionNumber?: string;
  bookId: string;
  bookTitle: string;
  bookAuthor: string;
  studentId: string;
  studentNo?: string;
  studentName?: string;
  issuedAt: string;
  dueAt: string;
  returnedAt: string | null;
  renewedCount: number;
  status: string;
  overdue: boolean;
  overdueDays: number;
  currentFine: number;
}

export interface LibraryReservation {
  id: string;
  bookId: string;
  bookTitle: string;
  studentId: string;
  studentNo?: string;
  studentName?: string;
  status: string;
  queuePosition: number | null;
  requestedAt: string;
}

export interface LibraryFineItem {
  id: string;
  loanId: string;
  bookTitle: string;
  overdueDays?: number;
  amount: number;
  amountPaid: number;
  balance: number;
  status: string;
  dueDate: string;
}

export interface LibraryFineSummary {
  totalBalance: number;
  ledger: LibraryFineItem[];
  accruing: Array<{ loanId: string; bookTitle: string; overdueDays: number; currentFine: number }>;
}

export interface PlacementEligibility {
  eligible: boolean;
  reasons: string[];
  standing: {
    cgpa: number;
    backlogs: number;
    attendancePercentage: number;
    department: string;
    semester: number;
    graduationYear: number;
  };
}

export interface PlacementDrive {
  id: string;
  companyId: string;
  companyName: string;
  industry: string;
  title: string;
  jobRole: string;
  description: string;
  packageMin: number;
  packageMax: number;
  currency: string;
  employmentType: string;
  workMode: string;
  location: string;
  openings: number;
  applicationDeadline: string;
  driveDate: string | null;
  status: string;
  applicationCount: number;
  myApplicationStatus?: string | null;
  eligibility?: PlacementEligibility | null;
  minCgpa?: number | null;
  maxBacklogs?: number | null;
  minAttendance?: number | null;
  eligibleDepartments?: string[];
  eligibleSemesters?: number[];
  graduationYear?: number | null;
}

export interface PlacementInterview {
  id: string;
  roundName: string;
  roundNumber: number;
  scheduledAt: string;
  location: string;
  status: string;
  feedback?: string;
}

export interface PlacementOffer {
  id: string;
  packageAmount: number;
  currency: string;
  employmentType: string;
  joiningDate: string | null;
  offerStatus: string;
  issuedAt: string;
}

export interface PlacementApplication {
  id: string;
  driveId: string;
  driveTitle: string;
  companyName: string;
  jobRole: string;
  packageMin?: number;
  packageMax?: number;
  studentId: string;
  studentNo?: string;
  studentName?: string;
  status: string;
  appliedAt: string;
  interviews: PlacementInterview[];
  offers: PlacementOffer[];
}

export interface PlacementCompany {
  id: string;
  name: string;
  industry: string;
  company_type: string;
  website: string;
  location: string;
  description: string;
  contact_name: string;
  contact_email: string;
  active: boolean;
  drive_count?: number;
}

export interface ParentPlacements {
  applications: Array<{
    companyName: string;
    jobRole: string;
    status: string;
    appliedAt: string;
    interviews: Array<{ roundName: string; scheduledAt: string; status: string }>;
    offers: Array<{ packageAmount: number; currency: string; offerStatus: string; joiningDate: string | null }>;
  }>;
  placed: boolean;
}

export interface PlacementAnalytics {
  companies: { total: number; active: number };
  drives: { total: number; active: number };
  applications: { total: number; shortlisted: number; inInterview: number; selected: number; applicantStudents: number };
  offers: { accepted: number; placedStudents: number; avgPackage: number | null; maxPackage: number | null };
  placementRate: { placedStudents: number; enrolledStudents: number; rate: number };
}

export interface AlumniDirectoryItem {
  id: string;
  name: string;
  graduationYear: number;
  graduationProgram: string;
  department: string;
  currentCompany: string;
  currentPosition: string;
  industry: string;
  location: string;
  bio: string;
  linkedinUrl: string;
  githubUrl: string;
  offersMentorship: boolean;
  mentorshipTopics: string;
  mentorshipMode: string;
  availability: string;
  verified: boolean;
}

export interface AlumniProfile extends AlumniDirectoryItem {
  studentId: string | null;
  visibility: string;
  verification: string;
  status: string;
}

export interface Mentorship {
  id: string;
  alumniId: string;
  alumniName: string;
  studentId: string;
  studentNo?: string;
  studentName?: string;
  topic: string;
  message: string;
  status: string;
  requestedAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
}

export interface AlumniEvent {
  id: string;
  title: string;
  description: string;
  eventType: string;
  location: string;
  startsAt: string;
  endsAt: string | null;
  capacity: number;
  registeredCount: number;
  audience: string;
  status: string;
}

export interface AlumniCampaign {
  id: string;
  title: string;
  description: string;
  targetAmount: number;
  recordedTotal: number;
  contributionCount: number;
  status: string;
  startDate: string;
  endDate: string | null;
}

export interface AlumniContribution {
  id: string;
  campaignId?: string;
  campaignTitle?: string;
  alumniName?: string;
  amount: number;
  currency: string;
  status: string;
  reference: string;
  createdAt: string;
}

export interface MessPlan {
  id: string;
  name: string;
  description: string;
  billingType: string;
  price: number;
  mealsPerDay: number;
  active: boolean;
}

export interface MessEnrollment {
  id: string;
  planName?: string;
  billingType?: string;
  price?: number;
  startDate: string;
  endDate: string | null;
  status: string;
  autoRenew: boolean;
}

export interface MenuEntry {
  id: string;
  mealDate: string;
  mealType: string;
  menuDescription: string;
  calories: number | null;
  active: boolean;
}

export interface CanteenItem {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  available: boolean;
}

export interface CanteenOrderItem {
  itemId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface CanteenOrder {
  id: string;
  status: string;
  totalAmount: number;
  orderedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  items: CanteenOrderItem[];
}

export interface FoodFee {
  id: string;
  feeType: string;
  amount: number;
  amountPaid: number;
  balance: number;
  dueDate: string;
  status: string;
}

export interface ParentMess {
  enrollment: {
    planName: string;
    billingType: string;
    price: number;
    startDate: string;
    status: string;
  } | null;
  billing: { outstanding: number; fees: FoodFee[] };
  recentOrders: Array<{ id: string; status: string; totalAmount: number; orderedAt: string; items: CanteenOrderItem[] }>;
  mealsLast7Days: { consumed: number; marked: number };
}

export interface ParentMess {
  enrollment: {
    planName: string;
    billingType: string;
    price: number;
    startDate: string;
    status: string;
  } | null;
  billing: { outstanding: number; fees: FoodFee[] };
  recentOrders: Array<{ id: string; status: string; totalAmount: number; orderedAt: string; items: CanteenOrderItem[] }>;
  mealsLast7Days: { consumed: number; marked: number };
}

export interface FoodFee {
  id: string;
  feeType: string;
  amount: number;
  amountPaid: number;
  balance: number;
  dueDate: string;
  status: string;
}

export interface CanteenOrderItem {
  itemId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface TransportDashboard {
  fleet: { total: number; ACTIVE: number; MAINTENANCE: number; INACTIVE: number };
  routes: { total: number; active: number };
  assignedStudents: number;
  activePasses: number;
  activeAlerts: number;
  vehicles: TransportVehicle[];
  routesList: TransportRoute[];
}

export interface ParentNotices {
  notices: ParentNotice[];
}

export interface AdminParentRow {
  id: string;
  name: string;
  email: string;
  linkedStudents: Array<{
    linkId: string;
    studentId: string;
    studentNo: string;
    name: string;
    section: string;
    relationshipType: string;
  }>;
  linkCount: number;
}

export interface ParentInvitationRow {
  id: string;
  studentId: string;
  studentNo: string;
  studentName: string;
  parentEmail: string;
  relationshipType: string;
  status: string;
  expired: boolean;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export interface AuthMe {
  user: User;
  profile: StudentProfile | FacultyProfile | ParentProfile | null;
}

export interface LoginResult {
  token: string;
  user: User;
}

export interface StudentMe {
  id: string;
  studentNo: string;
  department: string;
  semester: number;
  section: string;
  batchYear: number;
  user: { id: string; name: string; email: string; role: Role };
}

export interface AttendanceCourse {
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
  byCourse: AttendanceCourse[];
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

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "LEAVE";

export interface FacultyClass {
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

export interface FacultyClasses {
  classes: FacultyClass[];
}

export interface RosterStudent {
  studentId: string;
  studentNo: string;
  name: string;
  status: AttendanceStatus | null;
}

export interface ClassAttendanceState {
  class: FacultyClass;
  date: string;
  alreadySubmitted: boolean;
  recordedCount: number;
  students: RosterStudent[];
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
  counts: Record<AttendanceStatus, number>;
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

export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "UPI" | "CARD";

export interface FeePayment {
  id: string;
  feeId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  reference: string | null;
  recordedBy: { id: string; name: string } | null;
  createdAt: string;
}

export interface AdminFeeRecord {
  id: string;
  feeType: string;
  amount: number;
  amountPaid: number;
  balance: number;
  dueDate: string;
  status: "PENDING" | "PARTIAL" | "PAID";
  paymentCount: number;
  student: {
    id: string;
    studentNo: string;
    name: string;
    email: string;
    section: string;
    semester: number;
  };
}

export interface FeesSummaryAdmin {
  feeCount: number;
  totalAmount: number;
  totalPaid: number;
  totalOutstanding: number;
  openFeeCount: number;
  studentsWithDues: number;
}

export interface FeesList {
  summary: FeesSummaryAdmin;
  records: AdminFeeRecord[];
}

export interface FeePaymentsView {
  fee: {
    id: string;
    feeType: string;
    amount: number;
    amountPaid: number;
    balance: number;
    dueDate: string;
    status: "PENDING" | "PARTIAL" | "PAID";
    student: { id: string; studentNo: string; name: string; email: string } | null;
  };
  payments: FeePayment[];
}

export interface PaymentResult {
  payment: FeePayment;
  fee: AdminFeeRecord;
}

export type TimetableDayName =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

export type TimetableConflictType = "FACULTY" | "ROOM" | "SECTION";

export interface AdminTimetableEntry {
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
  entries: AdminTimetableEntry[];
  total: number;
}

export interface TimetableOptions {
  courses: { id: string; code: string; name: string; credits: number; semester: number; department: string }[];
  faculties: { id: string; name: string; department: string }[];
  sections: { section: string; semester: number; studentCount: number }[];
}

export interface TimetableConflict {
  entryId: string;
  day: TimetableDayName;
  startTime: string;
  endTime: string;
  room: string;
  section: string;
  courseCode: string;
  facultyName: string | null;
  type: TimetableConflictType;
  message: string;
}

export interface TimetableConflictDetails {
  conflictTypes: TimetableConflictType[];
  conflicts: TimetableConflict[];
}
export type AiIntent =
  | "ATTENDANCE"
  | "COURSE_ATTENDANCE"
  | "FEES"
  | "FEE_HISTORY"
  | "TIMETABLE"
  | "NEXT_CLASS"
  | "GENERAL";

export type AiSource = "attendance" | "fees" | "timetable";

export interface AiAskResponse {
  answer: string;
  intent: AiIntent;
  sources: AiSource[];
  /** The structured, user-scoped data the answer was generated from. */
  context: Record<string, unknown>;
  provider: string;
}

export type PerformanceCategory = "EXCELLENT" | "GOOD" | "AVERAGE" | "AT_RISK";

/** Mirrors GET /api/performance (STUDENT only). */
export interface StudentPerformanceFeatures {
  attendance_percentage: number;
  avg_assessment_percentage: number;
  total_assessments: number;
  assignment_submission_rate: number;
  avg_assignment_score: number;
  academic_score: number;
}

/** "ML" when the Python service scored the trained model, "RULE_BASED" on degradation. */
export type PredictionSource = "ML" | "RULE_BASED";

/**
 * Mirrors `GET /api/performance/predict` (STUDENT only).
 *
 * `probabilities` carries only the classes the trained model declares. The
 * shipped model never learned AVERAGE, so that key is legitimately absent and
 * must not be assumed.
 */
export interface PerformancePrediction {
  category: PerformanceCategory;
  confidence: number;
  probabilities: Record<string, number>;
  model_version: string;
  features_used: string[];
  prediction_source: PredictionSource;
  is_model_prediction: boolean;
  /** Only set for a rule-based prediction. Never a model confidence. */
  fallback_reason?: string;
  model_trained_at?: string | null;
  predicted_at?: string;
}

export interface LearningResource {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  resource_type: "VIDEO" | "NOTES" | "PRACTICE" | "ARTICLE" | "REMEDIAL";
  topic: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  url: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecommendationMetrics {
  attendancePercentage: number;
  assessmentPercentage: number;
  assignmentSubmissionRate: number;
  totalAssignments: number;
}

export interface Recommendation {
  courseId: string;
  courseName: string;
  category: "COURSE_WEAKNESS" | "ATTENDANCE" | "ASSESSMENT" | "ASSIGNMENT" | "STUDY_ACTION" | "REMEDIAL_SUPPORT";
  priority: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
  metrics: RecommendationMetrics;
  resources: LearningResource[];
  resourceCount: number;
}

export interface RecommendationsSummary {
  highPriority: number;
  mediumPriority: number;
  coursesNeedingAttention: number;
}

export interface RecommendationsResponse {
  summary: RecommendationsSummary;
  recommendations: Recommendation[];
}

export interface StudyPlanResponse {
  studyPlan: string | null;
  recommendations: Array<{
    course: string;
    category: string;
    priority: string;
    reason: string;
  }>;
  fallback?: boolean;
}

export type RiskLevel = "CRITICAL" | "HIGH" | "MODERATE" | "LOW";

export type TrendDirection = "DECLINING" | "STABLE" | "IMPROVING" | "INSUFFICIENT_DATA";

export interface TrendPoint {
  current: number | null;
  previous: number | null;
  change: number | null;
  trend?: TrendDirection;
}

export interface RiskTrends {
  attendance: TrendPoint;
  assessments: TrendPoint;
  assignments: TrendPoint;
}

export interface RiskStudent {
  studentId: string;
  studentName: string;
  studentEmail: string;
  studentNo: string;
  section: string;
  riskLevel: RiskLevel | null;
  riskScore: number | null;
  signals: string[];
  trends: RiskTrends;
  openInterventions: number;
  lastUpdated: string | null;
}

export interface RiskListResponse {
  students: RiskStudent[];
}

export interface RiskStats {
  totalStudents: number;
  critical: number;
  high: number;
  moderate: number;
  low: number;
  decliningAttendance: number;
  decliningAssessments: number;
  decliningAssignments: number;
  openInterventions: number;
}

export interface RiskDetail {
  student: {
    student_id: string;
    student_name: string;
    student_email: string;
    student_no: string;
    section: string;
    semester: number;
  };
  riskAnalysis: {
    studentId: string;
    userId: string;
    riskLevel: RiskLevel;
    riskScore: number;
    signals: string[];
    trends: RiskTrends;
    currentMetrics: {
      attendancePercentage: number;
      avgAssessmentPercentage: number;
      assignmentSubmissionRate: number;
      avgAssignmentScore: number;
      academicScore: number;
    };
  };
  interventions: Intervention[];
}

export type InterventionType =
  | "ACADEMIC_REVIEW"
  | "ATTENDANCE_SUPPORT"
  | "ASSESSMENT_SUPPORT"
  | "ASSIGNMENT_SUPPORT"
  | "REMEDIAL_SUPPORT"
  | "FACULTY_MEETING"
  | "GENERAL_FOLLOW_UP";

export type InterventionStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "DISMISSED";

export interface Intervention {
  id: string;
  student_id: string;
  created_by: string;
  created_by_name?: string;
  risk_level_at_creation: RiskLevel;
  intervention_type: InterventionType;
  notes: string | null;
  status: InterventionStatus;
  follow_up_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface OwnRiskAnalysis {
  riskLevel: RiskLevel;
  signals: string[];
  trends: RiskTrends;
  currentMetrics: {
    attendancePercentage: number;
    avgAssessmentPercentage: number;
    assignmentSubmissionRate: number;
    avgAssignmentScore: number;
    academicScore: number;
  };
}

// ---------------------------------------------------------------------------
// Registration, approval and account-help (SUPER_ADMIN surface)
// ---------------------------------------------------------------------------

export type RegistrationStatus =
  | "REGISTRATION_STARTED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED";

export type AccountStatus = "PENDING" | "ACTIVE" | "REJECTED" | "SUSPENDED";

export type PasswordHelpStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "REJECTED";

export interface Registration {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  requestedRole: "STUDENT" | "FACULTY" | "ADMIN";
  status: RegistrationStatus;
  submission: Record<string, unknown>;
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegistrationList {
  items: Registration[];
  total: number;
}

export interface ManagedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: AccountStatus;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserList {
  items: ManagedUser[];
  total: number;
}

export interface PasswordHelpRequest {
  id: string;
  userId: string | null;
  userName: string | null;
  userEmail: string;
  requesterRole: string | null;
  contact: string | null;
  message: string;
  status: PasswordHelpStatus;
  adminNotes: string | null;
  handledBy: string | null;
  handledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PasswordHelpList {
  items: PasswordHelpRequest[];
  total: number;
}

export interface PasswordResetIssue {
  token: string;
  resetUrl: string;
  expiresAt: string;
}
