export const CERTIFICATE_TYPES = ["BONAFIDE", "TRANSCRIPT", "CONDUCT", "ENROLLMENT"] as const;

export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

export const CERTIFICATE_TYPE_CODES: Record<CertificateType, string> = {
  BONAFIDE: "BON",
  TRANSCRIPT: "TRN",
  CONDUCT: "CON",
  ENROLLMENT: "ENR",
};

export const CERTIFICATE_TYPE_LABELS: Record<CertificateType, string> = {
  BONAFIDE: "Bonafide Certificate",
  TRANSCRIPT: "Academic Transcript (Demo)",
  CONDUCT: "Conduct Certificate",
  ENROLLMENT: "Enrollment Certificate",
};

export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "ISSUED" | "REVOKED";
export type CertificateStatus = "ISSUED" | "REVOKED";

export interface CertificateRequest {
  id: string;
  studentId: string;
  studentNo?: string;
  studentName?: string;
  certificateType: CertificateType;
  status: RequestStatus;
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
  status: CertificateStatus;
  issuedAt: string;
  revokedAt: string | null;
}

export interface PublicVerification {
  certificateNumber: string;
  certificateType: CertificateType;
  studentName: string;
  institution: string;
  issuedDate: string;
  status: "VALID" | "REVOKED";
}
