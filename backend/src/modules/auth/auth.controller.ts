import { Request, Response } from "express";
import * as authService from "./auth.service";
import { sendSuccess } from "../../utils/response";
import { ApiError } from "../../utils/ApiError";
import { asyncHandler } from "../../utils/asyncHandler";

export async function register(req: Request, res: Response) {
  const result = await authService.register(req.body);
  return sendSuccess(res, result, result.message, 201);
}

export async function login(req: Request, res: Response) {
  const result = await authService.login(req.body);
  return sendSuccess(res, result, "Logged in successfully");
}

export async function me(req: Request, res: Response) {
  const user = req.user;
  if (!user) throw ApiError.unauthorized();
  const data = await authService.getCurrentUser(user.id);
  return sendSuccess(res, data, "Current session");
}

export async function logout(_req: Request, res: Response) {
  return sendSuccess(res, { loggedOut: true }, "Logged out successfully");
}

export async function passwordHelp(req: Request, res: Response) {
  const result = await authService.requestPasswordHelp(req.body);
  return sendSuccess(res, result, result.message);
}

export async function resetPassword(req: Request, res: Response) {
  const result = await authService.resetPassword(req.body);
  return sendSuccess(res, result, result.message);
}