import { Request, Response } from "express";
import { ApiError } from "../../utils/ApiError";
import { sendSuccess } from "../../utils/response";
import * as hostelService from "./hostel.service";

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

export async function myHostel(req: Request, res: Response) {
  const data = await hostelService.getMyHostel(requireUserId(req));
  return sendSuccess(res, data, "Hostel allocation retrieved");
}

export async function roomsForStudents(req: Request, res: Response) {
  const q = (req as Validated<{ hostelId?: string; status?: string }>).validatedQuery ?? {};
  const data = await hostelService.listRoomsForStudents(q.hostelId, q.status);
  return sendSuccess(res, { rooms: data }, "Rooms retrieved");
}

export async function myComplaints(req: Request, res: Response) {
  const data = await hostelService.listMyComplaints(requireUserId(req));
  return sendSuccess(res, { complaints: data }, "Complaints retrieved");
}

export async function createComplaint(req: Request, res: Response) {
  const { category, description, priority } = req.body as {
    category: string;
    description: string;
    priority: string;
  };
  const data = await hostelService.createComplaint(requireUserId(req), category, description, priority);
  return sendSuccess(res, data, "Complaint submitted", 201);
}

export async function myRoomChanges(req: Request, res: Response) {
  const data = await hostelService.listMyRoomChanges(requireUserId(req));
  return sendSuccess(res, { requests: data }, "Room-change requests retrieved");
}

export async function createRoomChange(req: Request, res: Response) {
  const { requestedRoomId, reason } = req.body as { requestedRoomId?: string | null; reason: string };
  const data = await hostelService.createRoomChange(requireUserId(req), requestedRoomId ?? null, reason);
  return sendSuccess(res, data, "Room-change request submitted", 201);
}

export async function myVisitors(req: Request, res: Response) {
  const data = await hostelService.listMyVisitors(requireUserId(req));
  return sendSuccess(res, { visitors: data }, "Visitor requests retrieved");
}

export async function createVisitor(req: Request, res: Response) {
  const { visitorName, relation, visitDate, visitTime } = req.body as {
    visitorName: string;
    relation?: string;
    visitDate: string;
    visitTime?: string | null;
  };
  const data = await hostelService.createVisitor(
    requireUserId(req),
    visitorName,
    relation ?? "Family",
    visitDate,
    visitTime ?? null,
  );
  return sendSuccess(res, data, "Visitor request submitted", 201);
}

// ------------------------------------------------------------------- admin

export async function dashboard(req: Request, res: Response) {
  const _admin = requireUserId(req);
  const data = await hostelService.hostelDashboard();
  return sendSuccess(res, data, "Hostel dashboard");
}

export async function hostels(_req: Request, res: Response) {
  const data = await hostelService.listHostels();
  return sendSuccess(res, { hostels: data }, "Hostels retrieved");
}

export async function createHostel(req: Request, res: Response) {
  const data = await hostelService.createHostel(req.body);
  return sendSuccess(res, data, "Hostel created", 201);
}

export async function rooms(req: Request, res: Response) {
  const q = (req as Validated<{ hostelId?: string; status?: string }>).validatedQuery ?? {};
  const data = await hostelService.listRooms(q.hostelId, q.status);
  return sendSuccess(res, { rooms: data }, "Rooms retrieved");
}

export async function createRoom(req: Request, res: Response) {
  const data = await hostelService.createRoom(req.body);
  return sendSuccess(res, data, "Room created", 201);
}

export async function allocations(req: Request, res: Response) {
  const q = (req as Validated<{ hostelId?: string; status?: string }>).validatedQuery ?? {};
  const data = await hostelService.listAllocations(q.hostelId, q.status);
  return sendSuccess(res, { allocations: data }, "Allocations retrieved");
}

export async function allocate(req: Request, res: Response) {
  const data = await hostelService.allocateStudent(req.body);
  return sendSuccess(res, data, "Student allocated", 201);
}

export async function vacate(req: Request, res: Response) {
  const data = await hostelService.vacateAllocation(param(req, "id"));
  return sendSuccess(res, data, "Allocation vacated");
}

export async function transfer(req: Request, res: Response) {
  const { roomId, bedNumber } = req.body as { roomId: string; bedNumber: number };
  const data = await hostelService.transferAllocation(param(req, "id"), roomId, bedNumber);
  return sendSuccess(res, data, "Student transferred");
}

export async function complaints(req: Request, res: Response) {
  const q = (req as Validated<{ status?: string }>).validatedQuery ?? {};
  const data = await hostelService.listComplaints({ status: q.status });
  return sendSuccess(res, { complaints: data }, "Complaints retrieved");
}

export async function updateComplaint(req: Request, res: Response) {
  const data = await hostelService.updateComplaint(param(req, "id"), req.body);
  return sendSuccess(res, data, "Complaint updated");
}

export async function roomChanges(req: Request, res: Response) {
  const q = (req as Validated<{ status?: string }>).validatedQuery ?? {};
  const data = await hostelService.listRoomChanges({ status: q.status });
  return sendSuccess(res, { requests: data }, "Room-change requests retrieved");
}

export async function reviewRoomChange(req: Request, res: Response) {
  if (!req.user) throw ApiError.unauthorized();
  const data = await hostelService.reviewRoomChange(param(req, "id"), req.user.id, req.body.status);
  return sendSuccess(res, data, `Request ${String(req.body.status).toLowerCase()}`);
}

export async function visitors(req: Request, res: Response) {
  const q = (req as Validated<{ status?: string }>).validatedQuery ?? {};
  const data = await hostelService.listVisitors({ status: q.status });
  return sendSuccess(res, { visitors: data }, "Visitor requests retrieved");
}

export async function updateVisitor(req: Request, res: Response) {
  const data = await hostelService.updateVisitor(param(req, "id"), req.body.status);
  return sendSuccess(res, data, "Visitor request updated");
}
