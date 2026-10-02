import { Request, Response } from "express";
import * as superAdminService from "./super-admin.service";
import { sendSuccess } from "../../utils/response";
import { ApiError } from "../../utils/ApiError";
import { asyncHandler } from "../../utils/asyncHandler";
import { env } from "../../config/env";

/** Express 5 types a route param as string | string[]; the project reads it through this helper. */
function param(req: Request, name: string): string {
  const value = req.params[name];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function queryParam(req: Request, name: string): string {
  const value = req.query[name];
  if (Array.isArray(value)) return String(value[0] ?? "");
  return value === undefined ? "" : String(value);
}

function intParam(req: Request, name: string, fallback: number, max: number): number {
  const raw = Number(queryParam(req, name));
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(raw, max);
}

export async function listRegistrations(req: Request, res: Response) {
  const status = queryParam(req, "status") || "ALL";
  const role = queryParam(req, "role");
  const q = queryParam(req, "q");
  const limit = intParam(req, "limit", 50, 200);
  const offset = intParam(req, "offset", 0, Number.MAX_SAFE_INTEGER);

  const result = await superAdminService.listRegistrations(status, role, q, limit, offset);
  return sendSuccess(res, result);
}

export async function getRegistration(req: Request, res: Response) {
  const registration = await superAdminService.getRegistrationById(param(req, "id"));
  if (!registration) throw ApiError.notFound("Registration not found");
  return sendSuccess(res, registration);
}

export async function approveRegistration(req: Request, res: Response) {
  const registration = await superAdminService.approveRegistration(param(req, "id"), req.user!.id);
  return sendSuccess(res, registration, "Registration approved");
}

export async function rejectRegistration(req: Request, res: Response) {
  const registration = await superAdminService.rejectRegistration(param(req, "id"), req.user!.id, req.body);
  return sendSuccess(res, registration, "Registration rejected");
}

export async function listUsers(req: Request, res: Response) {
  const status = queryParam(req, "status") || "ALL";
  const role = queryParam(req, "role");
  const q = queryParam(req, "q");
  const limit = intParam(req, "limit", 50, 200);
  const offset = intParam(req, "offset", 0, Number.MAX_SAFE_INTEGER);

  const result = await superAdminService.listUsers(status, role, q, limit, offset);
  return sendSuccess(res, result);
}

export async function updateUserStatus(req: Request, res: Response) {
  const user = await superAdminService.updateUserStatus(param(req, "id"), req.body);
  return sendSuccess(res, user, "User status updated");
}

export async function listPasswordHelp(req: Request, res: Response) {
  const status = queryParam(req, "status") || "ALL";
  const limit = intParam(req, "limit", 50, 200);
  const offset = intParam(req, "offset", 0, Number.MAX_SAFE_INTEGER);

  const result = await superAdminService.listPasswordHelp(status, limit, offset);
  return sendSuccess(res, result);
}

export async function updatePasswordHelp(req: Request, res: Response) {
  const request = await superAdminService.updatePasswordHelp(param(req, "id"), req.user!.id, req.body);
  return sendSuccess(res, request, "Password help request updated");
}

export async function issueResetToken(req: Request, res: Response) {
  const result = await superAdminService.issueResetToken(param(req, "id"), req.user!.id, env.frontendUrl);
  return sendSuccess(res, result, "Reset token issued");
}