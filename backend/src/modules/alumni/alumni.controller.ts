import { Request, Response } from "express";
import { ApiError } from "../../utils/ApiError";
import { sendSuccess } from "../../utils/response";
import * as alumniService from "./alumni.service";

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

// ---------------------------------------------------------------- directory

export async function directory(req: Request, res: Response) {
  const q = (req as Validated<Record<string, unknown>>).validatedQuery ?? {};
  const data = await alumniService.directory({
    q: q.q as string | undefined,
    company: q.company as string | undefined,
    industry: q.industry as string | undefined,
    graduationYear: q.graduationYear as number | undefined,
    department: q.department as string | undefined,
    location: q.location as string | undefined,
    mentorsOnly: q.mentorsOnly as boolean | undefined,
    page: q.page as number | undefined,
    limit: q.limit as number | undefined,
  });
  return sendSuccess(res, data, "Alumni directory retrieved");
}

export async function directoryProfile(req: Request, res: Response) {
  const data = await alumniService.getDirectoryProfile(param(req, "id"));
  return sendSuccess(res, data, "Alumni profile retrieved");
}

export async function eventsForRole(req: Request, res: Response) {
  if (!req.user) throw ApiError.unauthorized();
  const data = await alumniService.listEvents(req.user.role);
  return sendSuccess(res, { events: data }, "Events retrieved");
}

// ------------------------------------------------------------------- alumni

export async function myProfile(req: Request, res: Response) {
  const data = await alumniService.getMyProfile(requireUserId(req));
  return sendSuccess(res, data, "Alumni profile retrieved");
}

export async function updateMyProfile(req: Request, res: Response) {
  const data = await alumniService.updateMyProfile(requireUserId(req), req.body);
  return sendSuccess(res, data, "Alumni profile updated");
}

export async function myMentoring(req: Request, res: Response) {
  const data = await alumniService.listMyMentorshipsAsAlumni(requireUserId(req));
  return sendSuccess(res, { mentorships: data }, "Mentorships retrieved");
}

export async function reviewMentorship(req: Request, res: Response) {
  const data = await alumniService.updateMentorshipAsAlumni(requireUserId(req), param(req, "id"), req.body.status as never);
  return sendSuccess(res, data, "Mentorship updated");
}

export async function myContributions(req: Request, res: Response) {
  const data = await alumniService.myContributions(requireUserId(req));
  return sendSuccess(res, { contributions: data }, "Contributions retrieved");
}

export async function pledgeContribution(req: Request, res: Response) {
  if (!req.user) throw ApiError.unauthorized();
  const { campaignId, amount, currency, reference } = req.body as {
    campaignId: string;
    amount: number;
    currency?: string;
    reference?: string;
  };
  const data = await alumniService.recordContribution(
    { id: req.user.id, role: req.user.role },
    campaignId,
    amount,
    currency ?? "INR",
    reference ?? "",
  );
  return sendSuccess(res, data, "Contribution recorded", 201);
}

export async function alumniDashboard(req: Request, res: Response) {
  const data = await alumniService.alumniDashboard(requireUserId(req));
  return sendSuccess(res, data, "Alumni dashboard retrieved");
}

// ------------------------------------------------------------------ student

export async function requestMentorship(req: Request, res: Response) {
  const { alumniId, topic, message } = req.body as { alumniId: string; topic: string; message?: string };
  const data = await alumniService.requestMentorship(requireUserId(req), alumniId, topic, message ?? "");
  return sendSuccess(res, data, "Mentorship requested", 201);
}

export async function myRequests(req: Request, res: Response) {
  const data = await alumniService.listMyMentorshipsAsStudent(requireUserId(req));
  return sendSuccess(res, { mentorships: data }, "Mentorship requests retrieved");
}

export async function cancelMentorship(req: Request, res: Response) {
  const data = await alumniService.cancelMentorshipAsStudent(requireUserId(req), param(req, "id"));
  return sendSuccess(res, data, "Mentorship cancelled");
}

export async function registerForEvent(req: Request, res: Response) {
  if (!req.user) throw ApiError.unauthorized();
  const data = await alumniService.registerForEvent(req.user.id, req.user.role, param(req, "id"));
  return sendSuccess(res, data, "Registered for event", 201);
}

export async function cancelRegistration(req: Request, res: Response) {
  const data = await alumniService.cancelRegistration(requireUserId(req), param(req, "id"));
  return sendSuccess(res, data, "Registration cancelled");
}

export async function myRegistrations(req: Request, res: Response) {
  const data = await alumniService.myRegistrations(requireUserId(req));
  return sendSuccess(res, { registrations: data }, "Event registrations retrieved");
}

export async function campaigns(req: Request, res: Response) {
  const data = await alumniService.listCampaigns(req.user?.role ?? "STUDENT");
  return sendSuccess(res, { campaigns: data }, "Campaigns retrieved");
}

// ------------------------------------------------------------------- admin

export async function adminProfiles(req: Request, res: Response) {
  const q = (req as Validated<{ status?: string; verification?: string }>).validatedQuery ?? {};
  const data = await alumniService.adminListProfiles(q.status, q.verification);
  return sendSuccess(res, { profiles: data }, "Alumni profiles retrieved");
}

export async function adminUpdateProfile(req: Request, res: Response) {
  const data = await alumniService.adminUpdateProfile(param(req, "id"), req.body);
  return sendSuccess(res, data, "Alumni profile updated");
}

export async function adminMentorships(req: Request, res: Response) {
  const q = (req as Validated<{ status?: string }>).validatedQuery ?? {};
  const data = await alumniService.adminListMentorships(q.status);
  return sendSuccess(res, { mentorships: data }, "Mentorships retrieved");
}

export async function adminEvents(req: Request, res: Response) {
  const q = (req as Validated<{ status?: string }>).validatedQuery ?? {};
  const data = await alumniService.listEvents("ADMIN", q.status);
  return sendSuccess(res, { events: data }, "Events retrieved");
}

export async function createEvent(req: Request, res: Response) {
  const data = await alumniService.createEvent(requireUserId(req), req.body);
  return sendSuccess(res, data, "Event created", 201);
}

export async function updateEvent(req: Request, res: Response) {
  const data = await alumniService.updateEvent(param(req, "id"), req.body);
  return sendSuccess(res, data, "Event updated");
}

export async function eventRegistrations(req: Request, res: Response) {
  const data = await alumniService.eventRegistrations(param(req, "id"));
  return sendSuccess(res, { registrations: data }, "Event registrations retrieved");
}

export async function markAttendance(req: Request, res: Response) {
  const data = await alumniService.markAttendance(param(req, "id"));
  return sendSuccess(res, data, "Attendance marked");
}

export async function adminCampaigns(req: Request, res: Response) {
  const data = await alumniService.listCampaigns("ADMIN");
  return sendSuccess(res, { campaigns: data }, "Campaigns retrieved");
}

export async function createCampaign(req: Request, res: Response) {
  const data = await alumniService.createCampaign(requireUserId(req), req.body);
  return sendSuccess(res, data, "Campaign created", 201);
}

export async function updateCampaign(req: Request, res: Response) {
  const data = await alumniService.updateCampaign(param(req, "id"), req.body);
  return sendSuccess(res, data, "Campaign updated");
}

export async function contributions(req: Request, res: Response) {
  const q = (req as Validated<{ campaignId?: string }>).validatedQuery ?? {};
  const data = await alumniService.listContributions(q.campaignId);
  return sendSuccess(res, { contributions: data }, "Contributions retrieved");
}

export async function recordContribution(req: Request, res: Response) {
  if (!req.user) throw ApiError.unauthorized();
  const { campaignId, amount, currency, reference } = req.body as {
    campaignId: string;
    amount: number;
    currency?: string;
    reference?: string;
  };
  const data = await alumniService.recordContribution(
    { id: req.user.id, role: req.user.role },
    campaignId,
    amount,
    currency ?? "INR",
    reference ?? "",
  );
  return sendSuccess(res, data, "Contribution recorded", 201);
}

export async function updateContribution(req: Request, res: Response) {
  const data = await alumniService.updateContribution(param(req, "id"), req.body.status as string);
  return sendSuccess(res, data, "Contribution updated");
}

export async function analytics(_req: Request, res: Response) {
  const data = await alumniService.alumniAnalytics();
  return sendSuccess(res, data, "Alumni analytics retrieved");
}
