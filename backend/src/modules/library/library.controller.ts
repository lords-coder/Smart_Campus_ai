import { Request, Response } from "express";
import { ApiError } from "../../utils/ApiError";
import { sendSuccess } from "../../utils/response";
import * as libraryService from "./library.service";

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

// ---------------------------------------------------------------- catalogue

export async function books(req: Request, res: Response) {
  const q = (req as Validated<Record<string, unknown>>).validatedQuery ?? {};
  const data = await libraryService.listBooks({
    q: q.q as string | undefined,
    category: q.category as string | undefined,
    author: q.author as string | undefined,
    available: q.available as boolean | undefined,
    page: q.page as number | undefined,
    limit: q.limit as number | undefined,
  });
  return sendSuccess(res, data, "Catalogue retrieved");
}

export async function bookDetail(req: Request, res: Response) {
  const data = await libraryService.getBook(param(req, "id"), req.user?.role !== "ADMIN");
  return sendSuccess(res, data, "Book retrieved");
}

// ------------------------------------------------------------------ student

export async function myLoans(req: Request, res: Response) {
  const q = (req as Validated<{ status?: string }>).validatedQuery ?? {};
  const data = await libraryService.getMyLoans(requireUserId(req), q.status);
  return sendSuccess(res, { loans: data }, "Loans retrieved");
}

export async function myReservations(req: Request, res: Response) {
  const data = await libraryService.getMyReservations(requireUserId(req));
  return sendSuccess(res, { reservations: data }, "Reservations retrieved");
}

export async function myFines(req: Request, res: Response) {
  const data = await libraryService.getMyFines(requireUserId(req));
  return sendSuccess(res, data, "Fine summary retrieved");
}

export async function reserveBook(req: Request, res: Response) {
  const data = await libraryService.reserveBook(requireUserId(req), param(req, "id"));
  return sendSuccess(res, data, "Reservation created", 201);
}

export async function renewLoan(req: Request, res: Response) {
  const data = await libraryService.renewLoan(requireUserId(req), param(req, "id"));
  return sendSuccess(res, data, "Loan renewed");
}

export async function cancelReservation(req: Request, res: Response) {
  const data = await libraryService.cancelReservation(requireUserId(req), param(req, "id"));
  return sendSuccess(res, data, "Reservation cancelled");
}

// ------------------------------------------------------------------- admin

export async function adminBooks(req: Request, res: Response) {
  const q = (req as Validated<Record<string, unknown>>).validatedQuery ?? {};
  const data = await libraryService.listBooks({
    q: q.q as string | undefined,
    category: q.category as string | undefined,
    author: q.author as string | undefined,
    page: q.page as number | undefined,
    limit: q.limit as number | undefined,
    activeOnly: false,
  });
  return sendSuccess(res, data, "Catalogue retrieved");
}

export async function createBook(req: Request, res: Response) {
  const data = await libraryService.createBook(req.body);
  return sendSuccess(res, data, "Book created", 201);
}

export async function updateBook(req: Request, res: Response) {
  const data = await libraryService.updateBook(param(req, "id"), req.body);
  return sendSuccess(res, data, "Book updated");
}

export async function copies(req: Request, res: Response) {
  const q = (req as Validated<{ bookId?: string }>).validatedQuery ?? {};
  const data = await libraryService.listCopies(q.bookId);
  return sendSuccess(res, { copies: data }, "Copies retrieved");
}

export async function createCopy(req: Request, res: Response) {
  const { bookId, accessionNumber, location } = req.body as {
    bookId: string;
    accessionNumber: string;
    location?: string;
  };
  const data = await libraryService.createCopy(bookId, accessionNumber, location ?? "Main Stacks");
  return sendSuccess(res, data, "Copy added", 201);
}

export async function updateCopy(req: Request, res: Response) {
  const data = await libraryService.updateCopy(param(req, "id"), req.body);
  return sendSuccess(res, data, "Copy updated");
}

export async function loans(req: Request, res: Response) {
  const q = (req as Validated<{ status?: string; page?: number; limit?: number }>).validatedQuery ?? {};
  if (q.status === "OVERDUE") {
    const data = await libraryService.overdueLoans(q.page ?? 1, q.limit ?? 20);
    return sendSuccess(res, data, "Overdue loans retrieved");
  }
  const data = await libraryService.listLoans({ status: q.status === "ACTIVE" || q.status === "RETURNED" ? q.status : undefined, page: q.page, limit: q.limit });
  return sendSuccess(res, { loans: data }, "Loans retrieved");
}

export async function issueBook(req: Request, res: Response) {
  if (!req.user) throw ApiError.unauthorized();
  const { studentNo, copyId, loanDays } = req.body as { studentNo: string; copyId: string; loanDays?: number };
  const data = await libraryService.issueBook(req.user.id, studentNo, copyId, loanDays ?? 14);
  return sendSuccess(res, data, "Book issued", 201);
}

export async function returnBook(req: Request, res: Response) {
  if (!req.user) throw ApiError.unauthorized();
  const data = await libraryService.returnBook(req.user.id, req.body.loanId as string);
  return sendSuccess(res, data, "Book returned");
}

export async function reservations(req: Request, res: Response) {
  const q = (req as Validated<{ status?: string; bookId?: string }>).validatedQuery ?? {};
  const data = await libraryService.listReservations({ status: q.status, bookId: q.bookId });
  return sendSuccess(res, { reservations: data }, "Reservations retrieved");
}

export async function cancelAnyReservation(req: Request, res: Response) {
  const data = await libraryService.adminCancelReservation(param(req, "id"));
  return sendSuccess(res, data, "Reservation cancelled");
}

export async function libraryFines(_req: Request, res: Response) {
  const data = await libraryService.listLibraryFines();
  return sendSuccess(res, { fines: data }, "Library fines retrieved");
}
