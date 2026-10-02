import { Request, Response } from "express";
import * as studentsService from "./students.service";
import { sendSuccess } from "../../utils/response";
import { ApiError } from "../../utils/ApiError";
import { currentWeekday } from "../../utils/date";
import { z } from "zod";

export const timetableQuerySchema = z.object({
  day: z
    .enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"])
    .optional(),
});

export const attendanceQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

export async function me(req: Request, res: Response) {
  const data = await studentsService.getMe(requireUserId(req));
  return sendSuccess(res, data, "Student profile");
}

export async function attendanceSummary(req: Request, res: Response) {
  const data = await studentsService.getAttendanceSummary(requireUserId(req));
  return sendSuccess(res, data, "Attendance summary");
}

export async function attendanceHistory(req: Request, res: Response) {
  const validated = (req as Request & { validatedQuery?: z.infer<typeof attendanceQuerySchema> })
    .validatedQuery;
  const data = await studentsService.getAttendanceHistory(
    requireUserId(req),
    validated?.limit ?? 20,
  );
  return sendSuccess(res, data, "Attendance history");
}

export async function feesSummary(req: Request, res: Response) {
  const data = await studentsService.getFeesSummary(requireUserId(req));
  return sendSuccess(res, data, "Fees summary");
}

export async function timetable(req: Request, res: Response) {
  const validated = (req as Request & { validatedQuery?: z.infer<typeof timetableQuerySchema> })
    .validatedQuery;
  const day = validated?.day ?? currentWeekday();
  const data = await studentsService.getTimetable(requireUserId(req), day);
  return sendSuccess(res, data, `Timetable for ${data.day}`);
}
