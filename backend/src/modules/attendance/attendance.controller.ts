import { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../utils/ApiError";
import { sendSuccess } from "../../utils/response";
import { toDateString } from "../../utils/date";
import * as attendanceService from "./attendance.service";
import { classQuerySchema, submitAttendanceSchema } from "./attendance.schemas";

type ValidatedQuery<T> = Request & { validatedQuery?: T };

function actingUser(req: Request): attendanceService.ActingUser {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, role: req.user.role };
}

export async function listClasses(req: Request, res: Response) {
  const classes = await attendanceService.listClasses(actingUser(req));
  return sendSuccess(res, { classes }, "Assigned classes");
}

export async function classState(req: Request, res: Response) {
  const entryId = String(req.params.timetableEntryId);
  const query = (req as ValidatedQuery<z.infer<typeof classQuerySchema>>).validatedQuery;
  const date = query?.date ?? toDateString();
  const state = await attendanceService.getClassState(actingUser(req), entryId, date);
  return sendSuccess(res, state, "Class attendance state");
}

export async function submit(req: Request, res: Response) {
  const result = await attendanceService.submitAttendance(actingUser(req), req.body);
  return sendSuccess(
    res,
    result,
    result.isUpdate ? "Attendance updated" : "Attendance submitted",
    201,
  );
}
