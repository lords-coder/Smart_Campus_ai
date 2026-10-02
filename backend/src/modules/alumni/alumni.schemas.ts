import { z } from "zod";

export const uuidSchema = z.string().uuid("Must be a valid UUID");

const urlOrEmpty = z.string().trim().max(300).refine(
  (v) => v === "" || /^https?:\/\/.+\..+/.test(v),
  { message: "Must be a valid http(s) URL or empty" },
);

export const directoryQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  company: z.string().trim().max(120).optional(),
  industry: z.string().trim().max(120).optional(),
  graduationYear: z.coerce.number().int().min(1950).max(2100).optional(),
  department: z.string().trim().max(200).optional(),
  location: z.string().trim().max(120).optional(),
  mentorsOnly: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const updateMyProfileSchema = z
  .object({
    currentCompany: z.string().trim().max(200).optional(),
    currentPosition: z.string().trim().max(200).optional(),
    industry: z.string().trim().max(120).optional(),
    location: z.string().trim().max(120).optional(),
    bio: z.string().trim().max(2000).optional(),
    linkedinUrl: urlOrEmpty.optional(),
    githubUrl: urlOrEmpty.optional(),
    offersMentorship: z.boolean().optional(),
    mentorshipTopics: z.string().trim().max(1000).optional(),
    mentorshipMode: z.enum(["ONLINE", "ONSITE", "BOTH"]).optional(),
    availability: z.string().trim().max(500).optional(),
    visibility: z.enum(["PUBLIC", "PRIVATE"]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export const adminUpdateProfileSchema = updateMyProfileSchema.extend({
  verification: z.enum(["UNVERIFIED", "VERIFIED"]).optional(),
  status: z.enum(["PENDING", "ALUMNI", "INACTIVE"]).optional(),
  graduationYear: z.number().int().min(1950).max(2100).optional(),
  graduationProgram: z.string().trim().max(200).optional(),
  department: z.string().trim().max(200).optional(),
});

export const createMentorshipSchema = z.object({
  alumniId: uuidSchema,
  topic: z.string().trim().min(2).max(200),
  message: z.string().trim().max(2000).default(""),
});

export const updateMentorshipSchema = z.object({
  status: z.enum(["ACCEPTED", "REJECTED", "COMPLETED", "CANCELLED"]),
});

export const createEventSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).default(""),
  eventType: z
    .enum(["MEET", "CAREER_TALK", "NETWORKING", "GUEST_LECTURE", "MENTORSHIP_SESSION", "REUNION", "INDUSTRY_PANEL", "OTHER"])
    .default("MEET"),
  location: z.string().trim().max(300).default(""),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  capacity: z.number().int().min(1).max(10000).default(100),
  audience: z.enum(["ALL", "STUDENTS", "ALUMNI"]).default("ALL"),
});

export const updateEventSchema = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    location: z.string().trim().max(300).optional(),
    startsAt: z.string().datetime({ offset: true }).optional(),
    endsAt: z.string().datetime({ offset: true }).nullable().optional(),
    capacity: z.number().int().min(1).max(10000).optional(),
    audience: z.enum(["ALL", "STUDENTS", "ALUMNI"]).optional(),
    status: z.enum(["DRAFT", "PUBLISHED", "CLOSED", "CANCELLED", "COMPLETED"]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export const createCampaignSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).default(""),
  targetAmount: z.number().min(0).max(1000000000),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").nullable().optional(),
});

export const updateCampaignSchema = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    targetAmount: z.number().min(0).max(1000000000).optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").nullable().optional(),
    status: z.enum(["DRAFT", "ACTIVE", "CLOSED"]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export const createContributionSchema = z.object({
  campaignId: uuidSchema,
  amount: z.number().positive().max(100000000),
  currency: z.string().trim().max(10).default("INR"),
  reference: z.string().trim().max(200).default(""),
});

export const updateContributionSchema = z.object({
  status: z.enum(["PLEDGED", "RECORDED", "CANCELLED"]),
});

export const idParamsSchema = z.object({
  id: uuidSchema,
});
