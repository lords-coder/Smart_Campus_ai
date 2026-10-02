export type AlumniStatus = "PENDING" | "ALUMNI" | "INACTIVE";
export type AlumniVerification = "UNVERIFIED" | "VERIFIED";
export type AlumniVisibility = "PUBLIC" | "PRIVATE";
export type MentorshipMode = "ONLINE" | "ONSITE" | "BOTH";
export type MentorshipStatus = "REQUESTED" | "ACCEPTED" | "REJECTED" | "COMPLETED" | "CANCELLED";
export type EventType =
  | "MEET"
  | "CAREER_TALK"
  | "NETWORKING"
  | "GUEST_LECTURE"
  | "MENTORSHIP_SESSION"
  | "REUNION"
  | "INDUSTRY_PANEL"
  | "OTHER";
export type EventStatus = "DRAFT" | "PUBLISHED" | "CLOSED" | "CANCELLED" | "COMPLETED";
export type EventAudience = "ALL" | "STUDENTS" | "ALUMNI";
export type RegistrationStatus = "REGISTERED" | "CANCELLED" | "ATTENDED";
export type CampaignStatus = "DRAFT" | "ACTIVE" | "CLOSED";
export type ContributionStatus = "PLEDGED" | "RECORDED" | "CANCELLED";

/** Staff-driven mentorship transitions (students/alumni cancel their own). */
export const MENTORSHIP_TRANSITIONS: Record<MentorshipStatus, MentorshipStatus[]> = {
  REQUESTED: ["ACCEPTED", "REJECTED", "CANCELLED"],
  ACCEPTED: ["COMPLETED", "CANCELLED"],
  REJECTED: [],
  COMPLETED: [],
  CANCELLED: [],
};

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
  mentorshipMode: MentorshipMode;
  availability: string;
  verified: boolean;
}
