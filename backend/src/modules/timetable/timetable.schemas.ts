import { z } from "zod";
import { TIMETABLE_DAYS } from "./timetable.types";

const uuidSchema = z.string().uuid("Must be a valid identifier");

/** "MONDAY" / "monday" / "Monday" -> "Monday" (matches the DB CHECK constraint). */
const normalizeDay = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!/^[A-Za-z]+$/.test(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
};

const daySchema = z.preprocess(
  normalizeDay,
  z.enum(TIMETABLE_DAYS, { error: "Day must be a weekday such as Monday" }),
);

/** "9:30" / "09:30:00" -> "09:30"; rejects anything that is not a real 24h time. */
const normalizeTime = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
  if (!match) return trimmed;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
};

const timeSchema = z.preprocess(
  normalizeTime,
  z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "Time must be in HH:MM (24-hour) format"),
);

const trimTo = (max: number, emptyMessage: string, pattern: RegExp, patternMessage: string) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string().min(1, emptyMessage).max(max, `Must be ${max} characters or fewer`).regex(pattern, patternMessage),
  );

const sectionSchema = trimTo(
  10,
  "Section is required",
  /^[A-Za-z0-9][A-Za-z0-9 -]{0,9}$/,
  "Section must be 1-10 letters, numbers, spaces, dashes",
);

const roomSchema = trimTo(
  40,
  "Room is required",
  /^[A-Za-z0-9][A-Za-z0-9 ./_-]{0,39}$/,
  "Room must be 1-40 letters, numbers, spaces, dots, dashes, slashes or underscores",
);

export const timetableListQuerySchema = z.object({
  day: daySchema.optional(),
  facultyId: uuidSchema.optional(),
  courseId: uuidSchema.optional(),
  section: sectionSchema.optional(),
  room: roomSchema.optional(),
  status: z.enum(["ACTIVE", "ARCHIVED", "ALL"]).default("ACTIVE"),
});

export const timetableParamsSchema = z.object({ entryId: uuidSchema });

export const deleteTimetableQuerySchema = z.object({
  permanent: z.enum(["true", "false"]).default("false"),
});

const entryShape = {
  courseId: uuidSchema,
  facultyId: uuidSchema,
  section: sectionSchema,
  room: roomSchema,
  day: daySchema,
  startTime: timeSchema,
  endTime: timeSchema,
};

export const createTimetableSchema = z
  .object(entryShape)
  .refine((value) => value.startTime < value.endTime, {
    message: "End time must be after the start time",
    path: ["endTime"],
  });

export const updateTimetableSchema = z
  .object({
    ...entryShape,
    facultyId: entryShape.facultyId.nullable().optional(),
    courseId: entryShape.courseId.optional(),
    section: entryShape.section.optional(),
    room: entryShape.room.optional(),
    day: entryShape.day.optional(),
    startTime: entryShape.startTime.optional(),
    endTime: entryShape.endTime.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  })
  .refine(
    (value) =>
      value.startTime === undefined ||
      value.endTime === undefined ||
      value.startTime < value.endTime,
    { message: "End time must be after the start time", path: ["endTime"] },
  );

export type TimetableListQuery = z.infer<typeof timetableListQuerySchema>;
export type CreateTimetableInput = z.infer<typeof createTimetableSchema>;
export type UpdateTimetableInput = z.infer<typeof updateTimetableSchema>;
