import { Request, Response } from "express";
import { ApiError } from "../../utils/ApiError";
import { sendSuccess } from "../../utils/response";
import * as placementsService from "./placements.service";
import type { ApplicationStatus } from "./placements.types";

type Validated<T> = Request & { validatedQuery?: T };

function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

function param(req: Request, name: string): string {
  const value = req.params[name];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

// ------------------------------------------------------------------ student

export async function drives(req: Request, res: Response) {
  const data = await placementsService.listDrivesForStudent(requireUserId(req));
  return sendSuccess(res, data, "Eligible drives retrieved");
}

export async function openDrives(req: Request, res: Response) {
  const q = (req as Validated<{ q?: string }>).validatedQuery ?? {};
  const data = await placementsService.listDrives({ status: "OPEN", q: q.q, page: 1, limit: 50 });
  return sendSuccess(res, data, "Open drives retrieved");
}

export async function publicDriveDetail(req: Request, res: Response) {
  const data = await placementsService.getDrive(param(req, "id"));
  return sendSuccess(res, data, "Drive retrieved");
}

export async function shortlistApplication(req: Request, res: Response) {
  const data = await placementsService.updateApplicationStatus(param(req, "id"), "SHORTLISTED");
  return sendSuccess(res, data, "Application shortlisted");
}

export async function driveDetail(req: Request, res: Response) {
  const data = await placementsService.driveEligibilityForStudent(requireUserId(req), param(req, "id"));
  return sendSuccess(res, data, "Drive retrieved");
}

export async function driveEligibility(req: Request, res: Response) {
  const data = await placementsService.driveEligibilityForStudent(requireUserId(req), param(req, "id"));
  return sendSuccess(res, { eligibility: data.eligibility, drive: data.drive }, "Eligibility evaluated");
}

export async function applyToDrive(req: Request, res: Response) {
  const data = await placementsService.applyToDrive(requireUserId(req), param(req, "id"));
  return sendSuccess(res, data, "Application submitted", 201);
}

export async function myApplications(req: Request, res: Response) {
  const data = await placementsService.listMyApplications(requireUserId(req));
  return sendSuccess(res, { applications: data }, "Applications retrieved");
}

export async function myApplication(req: Request, res: Response) {
  const data = await placementsService.getMyApplication(requireUserId(req), param(req, "id"));
  return sendSuccess(res, data, "Application retrieved");
}

export async function withdrawApplication(req: Request, res: Response) {
  const data = await placementsService.withdrawApplication(requireUserId(req), param(req, "id"));
  return sendSuccess(res, data, "Application withdrawn");
}

export async function placementHistory(req: Request, res: Response) {
  const data = await placementsService.placementHistory(requireUserId(req));
  return sendSuccess(res, { history: data }, "Placement history retrieved");
}

// ------------------------------------------------------------------- admin

export async function companies(_req: Request, res: Response) {
  const data = await placementsService.listCompanies();
  return sendSuccess(res, { companies: data }, "Companies retrieved");
}

export async function createCompany(req: Request, res: Response) {
  const data = await placementsService.createCompany(req.body);
  return sendSuccess(res, data, "Company created", 201);
}

export async function updateCompany(req: Request, res: Response) {
  const data = await placementsService.updateCompany(param(req, "id"), req.body);
  return sendSuccess(res, data, "Company updated");
}

export async function adminDrives(req: Request, res: Response) {
  const q = (req as Validated<{ status?: string; companyId?: string; q?: string; page?: number; limit?: number }>).validatedQuery ?? {};
  const data = await placementsService.listDrives({ status: q.status, companyId: q.companyId, q: q.q, page: q.page, limit: q.limit });
  return sendSuccess(res, data, "Drives retrieved");
}

export async function createDrive(req: Request, res: Response) {
  const data = await placementsService.createDrive(requireUserId(req), req.body);
  return sendSuccess(res, data, "Drive created", 201);
}

export async function updateDrive(req: Request, res: Response) {
  const data = await placementsService.updateDrive(param(req, "id"), req.body);
  return sendSuccess(res, data, "Drive updated");
}

export async function applicationDetail(req: Request, res: Response) {
  const data = await placementsService.adminGetApplication(param(req, "id"));
  return sendSuccess(res, data, "Application retrieved");
}

export async function driveApplications(req: Request, res: Response) {
  const q = (req as Validated<{ status?: string; page?: number; limit?: number }>).validatedQuery ?? {};
  const data = await placementsService.adminListApplications({ driveId: param(req, "id"), status: q.status, page: q.page, limit: q.limit });
  return sendSuccess(res, data, "Drive applications retrieved");
}

export async function updateApplication(req: Request, res: Response) {
  const data = await placementsService.updateApplicationStatus(param(req, "id"), req.body.status as ApplicationStatus);
  return sendSuccess(res, data, "Application updated");
}

export async function scheduleInterview(req: Request, res: Response) {
  const data = await placementsService.scheduleInterview(param(req, "id"), req.body);
  return sendSuccess(res, data, "Interview scheduled", 201);
}

export async function updateInterview(req: Request, res: Response) {
  const data = await placementsService.updateInterview(param(req, "id"), req.body);
  return sendSuccess(res, data, "Interview updated");
}

export async function createOffer(req: Request, res: Response) {
  const data = await placementsService.createOffer(param(req, "id"), req.body);
  return sendSuccess(res, data, "Offer created", 201);
}

export async function updateOffer(req: Request, res: Response) {
  const data = await placementsService.updateOffer(param(req, "id"), req.body.offerStatus as string);
  return sendSuccess(res, data, "Offer updated");
}

export async function analytics(_req: Request, res: Response) {
  const data = await placementsService.placementAnalytics();
  return sendSuccess(res, data, "Placement analytics retrieved");
}
