import { Request, Response } from "express";
import { z } from "zod";
import { ApiError } from "../../utils/ApiError";
import { sendSuccess } from "../../utils/response";
import * as feesService from "./fees.service";
import { feeParamsSchema, listFeesQuerySchema, recordPaymentSchema } from "./fees.schemas";

type ValidatedQuery<T> = Request & { validatedQuery?: T };

function actingUser(req: Request): feesService.ActingUser {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, role: req.user.role };
}

export async function list(req: Request, res: Response) {
  const filters =
    (req as ValidatedQuery<z.infer<typeof listFeesQuerySchema>>).validatedQuery ?? {};
  const data = await feesService.listFees(filters);
  return sendSuccess(res, data, "Fee register");
}

export async function recordPayment(req: Request, res: Response) {
  const result = await feesService.recordPayment(
    actingUser(req),
    String(req.params.feeId),
    req.body,
  );
  return sendSuccess(res, result, "Payment recorded", 201);
}

export async function payments(req: Request, res: Response) {
  const data = await feesService.getPayments(actingUser(req), String(req.params.feeId));
  return sendSuccess(res, data, "Payment history");
}
