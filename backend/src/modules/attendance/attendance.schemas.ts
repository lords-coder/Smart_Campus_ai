import { z } from "zod";
import { ATTENDANCE_STATUSES } from "./attendance.types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const isoDateSchema = z
  .string()
  .trim()
  .regex(DATE_PATTERN, "Date must be in YYYY-MM-DD format")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Date is not a real calendar date");

const uuidSchema = z.string().uuid("Must be a valid identifier");

export const submitAttendanceSchema = z.object({
  timetableEntryId: uuidSchema,
  date: isoDateSchema,
  attendance: z
    .array(
      z.object({
        studentId: uuidSchema,
        status: z.enum(ATTENDANCE_STATUSES),
      }),
    )
    .min(1, "At least one student must be marked")
    .max(500, "Too many students in one submission"),
});

export type SubmitAttendanceInput = z.infer<typeof submitAttendanceSchema>;

export const classParamsSchema = z.object({ timetableEntryId: uuidSchema });

export const classQuerySchema = z.object({ date: isoDateSchema.optional() });
