import { Request, Response } from "express";
import { ApiError } from "../../utils/ApiError";
import { sendSuccess } from "../../utils/response";
import * as parentService from "./parent.service";

function parentId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

function param(req: Request, name: string): string {
  const value = req.params[name];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

// ------------------------------------------------------------------ parent

export async function myStudents(req: Request, res: Response) {
  const students = await parentService.getLinkedStudents(parentId(req));
  return sendSuccess(res, { students }, "Linked students retrieved");
}

export async function overview(req: Request, res: Response) {
  const data = await parentService.getOverview(parentId(req), param(req, "studentId"));
  return sendSuccess(res, data, "Student overview retrieved");
}

export async function attendance(req: Request, res: Response) {
  const data = await parentService.getAttendanceForParent(parentId(req), param(req, "studentId"));
  return sendSuccess(res, data, "Attendance retrieved");
}

export async function fees(req: Request, res: Response) {
  const data = await parentService.getFeesForParent(parentId(req), param(req, "studentId"));
  return sendSuccess(res, data, "Fee summary retrieved");
}

export async function timetable(req: Request, res: Response) {
  const day = typeof req.query.day === "string" ? req.query.day : undefined;
  const data = await parentService.getTimetableForParent(parentId(req), param(req, "studentId"), day);
  return sendSuccess(res, data, "Timetable retrieved");
}

export async function recommendations(req: Request, res: Response) {
  const data = await parentService.getRecommendationHeadlines(parentId(req), param(req, "studentId"));
  return sendSuccess(res, data, "Recommendation headlines retrieved");
}

export async function notices(req: Request, res: Response) {
  const data = await parentService.getNotices(parentId(req), param(req, "studentId"));
  return sendSuccess(res, { notices: data }, "Notices retrieved");
}

export async function activate(req: Request, res: Response) {
  const result = await parentService.activateParent(req.body);
  return sendSuccess(res, result, "Parent account activated", 201);
}

export async function transport(req: Request, res: Response) {
  const { getTransportForParent } = await import("../transport/transport.service");
  const data = await getTransportForParent(parentId(req), param(req, "studentId"));
  return sendSuccess(res, data, "Transport details retrieved");
}

export async function certificates(req: Request, res: Response) {
  const { getIssuedForParent } = await import("../certificates/certificates.service");
  const data = await getIssuedForParent(parentId(req), param(req, "studentId"));
  return sendSuccess(res, { certificates: data }, "Issued certificates retrieved");
}

export async function library(req: Request, res: Response) {
  const { getLibraryForParent } = await import("../library/library.service");
  const data = await getLibraryForParent(parentId(req), param(req, "studentId"));
  return sendSuccess(res, data, "Library summary retrieved");
}

export async function mess(req: Request, res: Response) {
  const { getMessForParent } = await import("../mess/mess.service");
  const data = await getMessForParent(parentId(req), param(req, "studentId"));
  return sendSuccess(res, data, "Mess summary retrieved");
}

export async function placements(req: Request, res: Response) {
  const { getPlacementsForParent } = await import("../placements/placements.service");
  const data = await getPlacementsForParent(parentId(req), param(req, "studentId"));
  return sendSuccess(res, data, "Placement summary retrieved");
}

export async function hostel(req: Request, res: Response) {
  const { getHostelForParent } = await import("../transport/transport.service");
  const data = await getHostelForParent(parentId(req), param(req, "studentId"));
  return sendSuccess(res, data, "Hostel details retrieved");
}

// ------------------------------------------------------------------- admin

export async function createInvitation(req: Request, res: Response) {
  const result = await parentService.createInvitation(parentId(req), req.body);
  return sendSuccess(res, result, "Invitation created", 201);
}

export async function listInvitations(_req: Request, res: Response) {
  const invitations = await parentService.listInvitations();
  return sendSuccess(res, { invitations }, "Invitations retrieved");
}

export async function revokeInvitation(req: Request, res: Response) {
  const invitation = await parentService.revokeInvitation(param(req, "invitationId"));
  return sendSuccess(res, invitation, "Invitation revoked");
}

export async function listParents(_req: Request, res: Response) {
  const parents = await parentService.listParents();
  return sendSuccess(res, { parents }, "Parent accounts retrieved");
}

export async function updateLink(req: Request, res: Response) {
  const link = await parentService.updateLink(param(req, "linkId"), req.body.status);
  return sendSuccess(res, link, "Parent link updated");
}
