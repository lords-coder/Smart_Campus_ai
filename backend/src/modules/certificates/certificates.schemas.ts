import { z } from "zod";

export const uuidSchema = z.string().uuid("Must be a valid UUID");

export const certificateTypeSchema = z.enum(["BONAFIDE", "TRANSCRIPT", "CONDUCT", "ENROLLMENT"]);

export const createRequestSchema = z.object({
  certificateType: certificateTypeSchema,
  purpose: z.string().trim().min(5, "Purpose must be at least 5 characters").max(2000).default(""),
});

export const requestListQuerySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "ISSUED", "REVOKED"]).optional(),
  certificateType: certificateTypeSchema.optional(),
  q: z.string().trim().max(100).optional(),
});

export const idParamsSchema = z.object({
  id: uuidSchema,
});

export const rejectSchema = z.object({
  rejectionReason: z.string().trim().min(5, "Rejection reason is required").max(2000),
});

export const verificationCodeParamsSchema = z.object({
  verificationCode: z
    .string()
    .min(8, "Invalid verification code")
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, "Invalid verification code"),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
