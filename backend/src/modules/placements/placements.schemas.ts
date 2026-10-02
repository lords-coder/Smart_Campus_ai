import { z } from "zod";

export const uuidSchema = z.string().uuid("Must be a valid UUID");
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const createCompanySchema = z.object({
  name: z.string().trim().min(2).max(200),
  industry: z.string().trim().max(120).default(""),
  companyType: z.enum(["PRODUCT", "SERVICE", "STARTUP", "CONSULTING", "GOVERNMENT", "NON_PROFIT", "OTHER"]).default("OTHER"),
  website: z.string().trim().max(200).default(""),
  location: z.string().trim().max(200).default(""),
  description: z.string().trim().max(2000).default(""),
  contactName: z.string().trim().max(120).default(""),
  contactEmail: z.string().trim().email().max(254).or(z.literal("")).default(""),
});

export const updateCompanySchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    industry: z.string().trim().max(120).optional(),
    companyType: z.enum(["PRODUCT", "SERVICE", "STARTUP", "CONSULTING", "GOVERNMENT", "NON_PROFIT", "OTHER"]).optional(),
    website: z.string().trim().max(200).optional(),
    location: z.string().trim().max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    contactName: z.string().trim().max(120).optional(),
    contactEmail: z.string().trim().email().max(254).or(z.literal("")).optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export const createDriveSchema = z.object({
  companyId: uuidSchema,
  title: z.string().trim().min(2).max(200),
  jobRole: z.string().trim().min(2).max(200),
  description: z.string().trim().max(5000).default(""),
  packageMin: z.number().min(0).max(100000000).default(0),
  packageMax: z.number().min(0).max(100000000).default(0),
  currency: z.string().trim().max(10).default("INR"),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "INTERNSHIP", "CONTRACT"]).default("FULL_TIME"),
  workMode: z.enum(["ONSITE", "REMOTE", "HYBRID"]).default("ONSITE"),
  location: z.string().trim().max(200).default(""),
  openings: z.number().int().min(1).max(10000).default(1),
  applicationDeadline: dateSchema,
  driveDate: dateSchema.nullable().optional(),
  minCgpa: z.number().min(0).max(10).nullable().optional(),
  maxBacklogs: z.number().int().min(0).max(50).nullable().optional(),
  minAttendance: z.number().min(0).max(100).nullable().optional(),
  eligibleDepartments: z.array(z.string().trim().max(200)).max(50).default([]),
  eligibleSemesters: z.array(z.number().int().min(1).max(12)).max(12).default([]),
  graduationYear: z.number().int().min(2000).max(2100).nullable().optional(),
});

export const updateDriveSchema = z
  .object({
    title: z.string().trim().min(2).max(200).optional(),
    jobRole: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    packageMin: z.number().min(0).max(100000000).optional(),
    packageMax: z.number().min(0).max(100000000).optional(),
    location: z.string().trim().max(200).optional(),
    openings: z.number().int().min(1).max(10000).optional(),
    applicationDeadline: dateSchema.optional(),
    driveDate: dateSchema.nullable().optional(),
    minCgpa: z.number().min(0).max(10).nullable().optional(),
    maxBacklogs: z.number().int().min(0).max(50).nullable().optional(),
    minAttendance: z.number().min(0).max(100).nullable().optional(),
    eligibleDepartments: z.array(z.string().trim().max(200)).max(50).optional(),
    eligibleSemesters: z.array(z.number().int().min(1).max(12)).max(12).optional(),
    graduationYear: z.number().int().min(2000).max(2100).nullable().optional(),
    status: z.enum(["DRAFT", "OPEN", "CLOSED", "CANCELLED", "COMPLETED"]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" })
  .refine(
    (v) =>
      v.packageMin === undefined ||
      v.packageMax === undefined ||
      (v.packageMax as number) >= (v.packageMin as number),
    { message: "packageMax must be >= packageMin" },
  );

export const driveListQuerySchema = z.object({
  status: z.enum(["DRAFT", "OPEN", "CLOSED", "CANCELLED", "COMPLETED"]).optional(),
  companyId: uuidSchema.optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const applicationListQuerySchema = z.object({
  driveId: uuidSchema.optional(),
  status: z.enum(["APPLIED", "SHORTLISTED", "INTERVIEW", "SELECTED", "WAITLISTED", "REJECTED", "WITHDRAWN"]).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const updateApplicationSchema = z.object({
  status: z.enum(["SHORTLISTED", "INTERVIEW", "SELECTED", "WAITLISTED", "REJECTED", "WITHDRAWN"]),
});

export const createInterviewSchema = z.object({
  roundName: z.string().trim().min(1).max(120).default("Round 1"),
  roundNumber: z.number().int().min(1).max(20).default(1),
  scheduledAt: z.string().datetime({ offset: true }),
  location: z.string().trim().max(200).default(""),
});

export const updateInterviewSchema = z
  .object({
    status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED", "MISSED"]).optional(),
    feedback: z.string().trim().max(5000).optional(),
    scheduledAt: z.string().datetime({ offset: true }).optional(),
    location: z.string().trim().max(200).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export const createOfferSchema = z.object({
  packageAmount: z.number().positive().max(100000000),
  currency: z.string().trim().max(10).default("INR"),
  employmentType: z.string().trim().max(30).default("FULL_TIME"),
  joiningDate: dateSchema.nullable().optional(),
});

export const updateOfferSchema = z.object({
  offerStatus: z.enum(["ACCEPTED", "DECLINED", "WITHDRAWN"]),
});

export const idParamsSchema = z.object({
  id: uuidSchema,
});

export type CreateDriveInput = z.infer<typeof createDriveSchema>;
