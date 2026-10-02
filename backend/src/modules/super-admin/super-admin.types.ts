export interface RegistrationRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  requestedRole: "STUDENT" | "FACULTY" | "ADMIN";
  status: "REGISTRATION_STARTED" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
  submission: Record<string, unknown>;
  rejectionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "PENDING" | "ACTIVE" | "REJECTED" | "SUSPENDED";
  phone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PasswordHelpRecord {
  id: string;
  userId: string | null;
  userName: string | null;
  userEmail: string;
  requesterRole: string | null;
  contact: string | null;
  message: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "REJECTED";
  adminNotes: string | null;
  handledBy: string | null;
  handledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResetTokenResult {
  token: string;
  resetUrl: string;
  expiresAt: string;
}