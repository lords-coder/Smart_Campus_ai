import { Request, Response } from "express";
import { ApiError } from "../../utils/ApiError";
import { sendSuccess } from "../../utils/response";
import * as certificatesService from "./certificates.service";

function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

function param(req: Request, name: string): string {
  const value = req.params[name];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

type Validated<T> = Request & { validatedQuery?: T };

// ------------------------------------------------------------------ student

export async function createRequest(req: Request, res: Response) {
  const { certificateType, purpose } = req.body as { certificateType: "BONAFIDE" | "TRANSCRIPT" | "CONDUCT" | "ENROLLMENT"; purpose?: string };
  const data = await certificatesService.createRequest(requireUserId(req), certificateType, purpose ?? "");
  return sendSuccess(res, data, "Certificate request submitted", 201);
}

export async function myRequests(req: Request, res: Response) {
  const data = await certificatesService.listMyRequests(requireUserId(req));
  return sendSuccess(res, { requests: data }, "Certificate requests retrieved");
}

export async function myCertificates(req: Request, res: Response) {
  const data = await certificatesService.listMyCertificates(requireUserId(req));
  return sendSuccess(res, { certificates: data }, "Certificates retrieved");
}

export async function myCertificate(req: Request, res: Response) {
  const data = await certificatesService.getMyCertificate(requireUserId(req), param(req, "id"));
  return sendSuccess(res, data, "Certificate retrieved");
}

export async function downloadCertificate(req: Request, res: Response) {
  const data = await certificatesService.downloadForStudent(requireUserId(req), param(req, "id"));
  const inline = req.query.view === "1";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", String(data.pdf.length));
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${data.filename}"`);
  res.setHeader("Cache-Control", "private, max-age=3600");
  return res.send(data.pdf);
}

// ------------------------------------------------------------------- admin

export async function adminRequests(req: Request, res: Response) {
  const q = (req as Validated<{ status?: string; certificateType?: string; q?: string }>).validatedQuery ?? {};
  const data = await certificatesService.adminListRequests({
    status: q.status,
    certificateType: q.certificateType,
    q: q.q,
  });
  return sendSuccess(res, { requests: data }, "Certificate requests retrieved");
}

export async function adminRequestDetail(req: Request, res: Response) {
  const data = await certificatesService.adminGetRequest(param(req, "id"));
  return sendSuccess(res, data, "Certificate request retrieved");
}

export async function approveRequest(req: Request, res: Response) {
  const data = await certificatesService.approveRequest(param(req, "id"), requireUserId(req));
  return sendSuccess(res, data, "Request approved");
}

export async function rejectRequest(req: Request, res: Response) {
  const data = await certificatesService.rejectRequest(param(req, "id"), requireUserId(req), req.body.rejectionReason);
  return sendSuccess(res, data, "Request rejected");
}

export async function issueCertificate(req: Request, res: Response) {
  const data = await certificatesService.issueCertificate(param(req, "id"), requireUserId(req));
  return sendSuccess(res, data, "Certificate issued", 201);
}

export async function revokeCertificate(req: Request, res: Response) {
  const data = await certificatesService.revokeCertificate(param(req, "id"));
  return sendSuccess(res, data, "Certificate revoked");
}

// ------------------------------------------------------------------ public

export async function verifyCertificate(req: Request, res: Response) {
  const result = await certificatesService.verifyByCode(param(req, "verificationCode"));
  if (!result) {
    return res.status(404).json({
      success: false,
      error: { code: "NOT_FOUND", message: "Certificate not found" },
    });
  }
  return sendSuccess(res, result, result.status === "VALID" ? "Certificate verified" : "Certificate revoked");
}
