import { z } from "zod";

export const uuidSchema = z.string().uuid("Must be a valid UUID");
const timeSchema = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Use HH:MM");

export const createVehicleSchema = z.object({
  registrationNumber: z.string().trim().min(3).max(20),
  vehicleType: z.enum(["BUS", "MINIBUS", "VAN"]).default("BUS"),
  capacity: z.number().int().min(1).max(80),
  driverId: uuidSchema.nullable().optional(),
});

export const updateVehicleSchema = z.object({
  status: z.enum(["ACTIVE", "MAINTENANCE", "INACTIVE"]).optional(),
  driverId: uuidSchema.nullable().optional(),
  capacity: z.number().int().min(1).max(80).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export const createDriverSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(20),
  licenseNo: z.string().trim().min(3).max(40),
});

export const createRouteSchema = z.object({
  routeCode: z.string().trim().min(2).max(20),
  name: z.string().trim().min(2).max(120),
});

export const updateRouteSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  active: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export const createStopSchema = z.object({
  routeId: uuidSchema,
  name: z.string().trim().min(2).max(120),
  sequence: z.number().int().min(1).max(100),
  scheduledTime: timeSchema,
});

export const updateStopSchema = z.object({
  sequence: z.number().int().min(1).max(100).optional(),
  scheduledTime: timeSchema.optional(),
  active: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export const assignStudentSchema = z.object({
  studentNo: z.string().trim().min(1).max(20),
  routeId: uuidSchema,
  stopId: uuidSchema,
  vehicleId: uuidSchema.nullable().optional(),
});

export const idParamsSchema = z.object({
  id: uuidSchema,
});

export const vehicleListQuerySchema = z.object({
  status: z.enum(["ACTIVE", "MAINTENANCE", "INACTIVE"]).optional(),
});

export const assignmentListQuerySchema = z.object({
  routeId: uuidSchema.optional(),
  status: z.enum(["ACTIVE", "ENDED"]).optional(),
});

export const createAlertSchema = z.object({
  routeId: uuidSchema,
  title: z.string().trim().min(3).max(200),
  detail: z.string().trim().max(2000).default(""),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]).default("INFO"),
});

export const updateAlertSchema = z.object({
  active: z.boolean(),
});

export const telemetrySchema = z.object({
  vehicleId: uuidSchema,
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  speedKmh: z.number().min(0).max(200).nullable().optional(),
  headingDeg: z.number().int().min(0).max(359).nullable().optional(),
  stopSequence: z.number().int().min(1).max(100).nullable().optional(),
  recordedAt: z.string().datetime({ offset: true }).nullable().optional(),
}).refine(
  (v) => (v.latitude == null && v.longitude == null) || (v.latitude != null && v.longitude != null),
  { message: "latitude and longitude must be provided together", path: ["longitude"] },
);

export const simulationSchema = z.object({
  vehicleId: uuidSchema,
  action: z.enum(["START_ROUTE", "ADVANCE_STOP", "SET_IDLE", "SET_MOVING"]),
  speedKmh: z.number().min(0).max(200).nullable().optional(),
});

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type AssignStudentInput = z.infer<typeof assignStudentSchema>;
