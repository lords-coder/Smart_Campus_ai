import { Request, Response } from "express";
import { ApiError } from "../../utils/ApiError";
import { sendSuccess } from "../../utils/response";
import * as transportService from "./transport.service";

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

export async function myTransport(req: Request, res: Response) {
  const data = await transportService.getMyTransport(requireUserId(req));
  return sendSuccess(res, data, "Transport details retrieved");
}

// ------------------------------------------------------------------- admin

export async function dashboard(_req: Request, res: Response) {
  const data = await transportService.transportDashboard();
  return sendSuccess(res, data, "Transport dashboard");
}

export async function vehicles(req: Request, res: Response) {
  const q = (req as Validated<{ status?: string }>).validatedQuery ?? {};
  const data = await transportService.listVehicles(q.status);
  return sendSuccess(res, { vehicles: data }, "Vehicles retrieved");
}

export async function createVehicle(req: Request, res: Response) {
  const data = await transportService.createVehicle(req.body);
  return sendSuccess(res, data, "Vehicle created", 201);
}

export async function updateVehicle(req: Request, res: Response) {
  const data = await transportService.updateVehicle(param(req, "id"), req.body);
  return sendSuccess(res, data, "Vehicle updated");
}

export async function drivers(_req: Request, res: Response) {
  const data = await transportService.listDrivers();
  return sendSuccess(res, { drivers: data }, "Drivers retrieved");
}

export async function createDriver(req: Request, res: Response) {
  const { name, phone, licenseNo } = req.body as { name: string; phone: string; licenseNo: string };
  const data = await transportService.createDriver(name, phone, licenseNo);
  return sendSuccess(res, data, "Driver created", 201);
}

export async function routes(_req: Request, res: Response) {
  const data = await transportService.listRoutes();
  return sendSuccess(res, { routes: data }, "Routes retrieved");
}

export async function routeDetail(req: Request, res: Response) {
  const data = await transportService.getRoute(param(req, "id"));
  return sendSuccess(res, data, "Route retrieved");
}

export async function createRoute(req: Request, res: Response) {
  const { routeCode, name } = req.body as { routeCode: string; name: string };
  const data = await transportService.createRoute(routeCode, name);
  return sendSuccess(res, data, "Route created", 201);
}

export async function updateRoute(req: Request, res: Response) {
  const data = await transportService.updateRoute(param(req, "id"), req.body);
  return sendSuccess(res, data, "Route updated");
}

export async function addStop(req: Request, res: Response) {
  const { routeId, name, sequence, scheduledTime } = req.body as {
    routeId: string;
    name: string;
    sequence: number;
    scheduledTime: string;
  };
  const data = await transportService.addStop(routeId, name, sequence, scheduledTime);
  return sendSuccess(res, data, "Stop added", 201);
}

export async function updateStop(req: Request, res: Response) {
  const data = await transportService.updateStop(param(req, "id"), req.body);
  return sendSuccess(res, data, "Stop updated");
}

export async function assignments(req: Request, res: Response) {
  const q = (req as Validated<{ routeId?: string; status?: string }>).validatedQuery ?? {};
  const data = await transportService.listAssignments(q.routeId, q.status);
  return sendSuccess(res, { assignments: data }, "Assignments retrieved");
}

export async function assignStudent(req: Request, res: Response) {
  const assignmentId = await transportService.assignStudent(req.body);
  return sendSuccess(res, { assignmentId }, "Student assigned", 201);
}

export async function endAssignment(req: Request, res: Response) {
  const data = await transportService.endAssignment(param(req, "id"));
  return sendSuccess(res, data, "Assignment ended");
}

export async function alerts(req: Request, res: Response) {
  const q = (req as Validated<{ routeId?: string }>).validatedQuery ?? {};
  const data = await transportService.listAlerts(q.routeId, false);
  return sendSuccess(res, { alerts: data }, "Alerts retrieved");
}

export async function createAlert(req: Request, res: Response) {
  if (!req.user) throw ApiError.unauthorized();
  const { routeId, title, detail, severity } = req.body as {
    routeId: string;
    title: string;
    detail?: string;
    severity?: string;
  };
  const data = await transportService.createAlert(routeId, title, detail ?? "", severity ?? "INFO", req.user.id);
  return sendSuccess(res, data, "Alert created", 201);
}

export async function updateAlert(req: Request, res: Response) {
  const data = await transportService.updateAlert(param(req, "id"), req.body.active);
  return sendSuccess(res, data, "Alert updated");
}

export async function ingestPoint(req: Request, res: Response) {
  const data = await transportService.ingestTelemetry(req.body, "MANUAL");
  return sendSuccess(res, { tracking: data, simulated: true }, "Telemetry recorded (demo input, not live GPS)", 201);
}

export async function simulate(req: Request, res: Response) {
  const { vehicleId, action, speedKmh } = req.body as {
    vehicleId: string;
    action: "START_ROUTE" | "ADVANCE_STOP" | "SET_IDLE" | "SET_MOVING";
    speedKmh?: number | null;
  };
  const data = await transportService.simulateTelemetry(vehicleId, action, speedKmh ?? null);
  return sendSuccess(res, { tracking: data, simulated: true }, "Simulation step applied (demo data, not live GPS)", 201);
}

export async function vehicleLocation(req: Request, res: Response) {
  const data = await transportService.computeVehicleTracking(param(req, "id"));
  return sendSuccess(res, { tracking: data, simulated: data.simulated }, "Vehicle location retrieved");
}

export async function tracking(req: Request, res: Response) {
  void req;
  const data = await transportService.fleetTracking();
  const simulated = data.every((t) => t.simulated);
  return sendSuccess(res, { tracking: data, simulated }, "Fleet tracking retrieved (demo data, not live GPS)");
}
