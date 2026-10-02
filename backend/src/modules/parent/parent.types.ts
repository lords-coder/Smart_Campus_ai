export type RelationshipType = "PARENT" | "GUARDIAN" | "SPONSOR";

export type LinkStatus = "ACTIVE" | "REVOKED";

export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export interface LinkedStudent {
  studentId: string;
  studentNo: string;
  name: string;
  email: string;
  department: string;
  semester: number;
  section: string;
  relationshipType: RelationshipType;
}

export interface ParentProfile {
  linkedStudents: LinkedStudent[];
}

export interface ParentInvitation {
  id: string;
  studentId: string;
  studentNo: string;
  studentName: string;
  parentEmail: string;
  relationshipType: RelationshipType;
  status: InvitationStatus;
  expired: boolean;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export interface ParentUserRow {
  id: string;
  name: string;
  email: string;
  linkedStudents: LinkedStudent[];
  linkCount: number;
}
