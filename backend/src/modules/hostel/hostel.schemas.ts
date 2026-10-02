import { z } from "zod";

export const uuidSchema = z.string().uuid("Must be a valid UUID");

export const createHostelSchema = z.object({
  name: z.string().trim().min(2).max(120),
  block: z.string().trim().min(1).max(40),
  category: z.enum(["BOYS", "GIRLS", "COED"]).default("COED"),
  wardenName: z.string().trim().max(120).optional().nullable(),
});

export const createRoomSchema = z.object({
  hostelId: uuidSchema,
  roomNumber: z.string().trim().min(1).max(20),
  floor: z.number().int().min(0).max(30).default(0),
  roomType: z.enum(["SINGLE", "DOUBLE", "TRIPLE", "QUAD"]).default("DOUBLE"),
  capacity: z.number().int().min(1).max(4).default(2),
});

export const allocateSchema = z.object({
  studentNo: z.string().trim().min(1).max(20),
  roomId: uuidSchema,
  bedNumber: z.number().int().min(1).max(4),
});

export const transferSchema = z.object({
  roomId: uuidSchema,
  bedNumber: z.number().int().min(1).max(4),
});

export const idParamsSchema = z.object({
  id: uuidSchema,
});

export const roomListQuerySchema = z.object({
  hostelId: uuidSchema.optional(),
  status: z.enum(["AVAILABLE", "FULL", "MAINTENANCE"]).optional(),
});

export const allocationListQuerySchema = z.object({
  hostelId: uuidSchema.optional(),
  status: z.enum(["ACTIVE", "VACATED", "PENDING"]).optional(),
});

export const complaintListQuerySchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
});

export const roomChangeListQuerySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
});

export const visitorListQuerySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "COMPLETED"]).optional(),
});

export const createComplaintSchema = z.object({
  category: z.enum(["ELECTRICAL", "PLUMBING", "CLEANING", "FURNITURE", "INTERNET", "OTHER"]).default("OTHER"),
  description: z.string().trim().min(5).max(2000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
});

export const updateComplaintSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export const createRoomChangeSchema = z.object({
  requestedRoomId: uuidSchema.nullable().optional(),
  reason: z.string().trim().min(5).max(2000),
});

export const reviewRoomChangeSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
});

export const createVisitorSchema = z.object({
  visitorName: z.string().trim().min(2).max(120),
  relation: z.string().trim().min(1).max(60).default("Family"),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  visitTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Use HH:MM").nullable().optional(),
});

export const updateVisitorSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "COMPLETED"]),
});

export type CreateHostelInput = z.infer<typeof createHostelSchema>;
export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type AllocateInput = z.infer<typeof allocateSchema>;
