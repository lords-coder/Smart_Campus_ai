import { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../utils/ApiError";
import { sendSuccess } from "../../utils/response";
import * as timetableService from "./timetable.service";
import {
  CreateTimetableInput,
  UpdateTimetableInput,
  createTimetableSchema,
  deleteTimetableQuerySchema,
  timetableListQuerySchema,
  updateTimetableSchema,
} from "./timetable.schemas";

type ValidatedQuery<T> = Request & { validatedQuery?: T };

function actingUser(req: Request): timetableService.ActingUser {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, role: req.user.role };
}

export async function list(req: Request, res: Response) {
  const filters =
    (req as ValidatedQuery<z.infer<typeof timetableListQuerySchema>>).validatedQuery ?? ({
      status: "ACTIVE",
    } as z.infer<typeof timetableListQuerySchema>);
  const data = await timetableService.listEntries(actingUser(req), filters);
  return sendSuccess(res, data, "Timetable entries");
}

export async function options(_req: Request, res: Response) {
  const data = await timetableService.getOptions();
  return sendSuccess(res, data, "Timetable options");
}

export async function get(req: Request, res: Response) {
  const data = await timetableService.getEntry(actingUser(req), String(req.params.entryId));
  return sendSuccess(res, { entry: data }, "Timetable entry");
}

export async function create(req: Request, res: Response) {
  const entry = await timetableService.createEntry(req.body as CreateTimetableInput);
  return sendSuccess(res, { entry }, "Timetable entry created", 201);
}

export async function update(req: Request, res: Response) {
  const entry = await timetableService.updateEntry(
    String(req.params.entryId),
    req.body as UpdateTimetableInput,
  );
  return sendSuccess(res, { entry }, "Timetable entry updated");
}

export async function remove(req: Request, res: Response) {
  const query = (req as ValidatedQuery<z.infer<typeof deleteTimetableQuerySchema>>).validatedQuery;
  const permanent = query?.permanent === "true";
  const data = await timetableService.archiveOrDelete(String(req.params.entryId), permanent);
  return sendSuccess(
    res,
    data,
    "deleted" in data ? "Timetable entry deleted" : "Timetable entry archived",
  );
}
