import { z } from "zod";
import { emailSchema, passwordSchema } from "../auth/auth.schemas";

const relationshipSchema = z.enum(["PARENT", "GUARDIAN", "SPONSOR"]);

export const createInvitationSchema = z.object({
  studentId: z.string().uuid("Student id must be a valid UUID"),
  parentEmail: emailSchema,
  relationshipType: relationshipSchema.default("PARENT"),
  /** Invitation lifetime in hours (bounded: 1h – 7 days). */
  expiresInHours: z.number().int().min(1).max(168).optional().default(168),
});

export const activateParentSchema = z.object({
  token: z.string().min(20, "Invitation token is required").max(200),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  password: passwordSchema,
});

export const updateLinkSchema = z.object({
  status: z.enum(["ACTIVE", "REVOKED"]),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type ActivateParentInput = z.infer<typeof activateParentSchema>;
export type UpdateLinkInput = z.infer<typeof updateLinkSchema>;
