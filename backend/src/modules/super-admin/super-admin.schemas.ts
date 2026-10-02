import { z } from "zod";

export const registrationStatusSchema = z.enum(["ALL", "PENDING_APPROVAL", "APPROVED", "REJECTED"]);

export const userStatusSchema = z.enum(["ALL", "ACTIVE", "PENDING", "REJECTED", "SUSPENDED"]);

export const rejectRegistrationSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "REJECTED"]),
});

export const passwordHelpStatusSchema = z.enum(["ALL", "OPEN", "IN_PROGRESS", "RESOLVED", "REJECTED"]);

export const updatePasswordHelpSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "REJECTED"]),
  adminNotes: z.string().max(2000).optional(),
});

export type RejectRegistrationInput = z.infer<typeof rejectRegistrationSchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type UpdatePasswordHelpInput = z.infer<typeof updatePasswordHelpSchema>;