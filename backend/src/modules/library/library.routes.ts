import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import * as libraryController from "./library.controller";
import {
  adminReservationQuerySchema,
  bookListQuerySchema,
  createBookSchema,
  createCopySchema,
  idParamsSchema,
  issueSchema,
  loanListQuerySchema,
  returnSchema,
  updateBookSchema,
  updateCopySchema,
} from "./library.schemas";

/**
 * Catalogue reads: students, faculty (read-only) and admins.
 * Mutations below are student-scoped.
 */
const libraryRouter = Router();

libraryRouter.use(requireAuth);

libraryRouter.get(
  "/books",
  requireRole("STUDENT", "FACULTY", "ADMIN"),
  validate(bookListQuerySchema, "query"),
  asyncHandler(libraryController.books),
);
libraryRouter.get(
  "/books/:id",
  requireRole("STUDENT", "FACULTY", "ADMIN"),
  validate(idParamsSchema, "params"),
  asyncHandler(libraryController.bookDetail),
);

libraryRouter.get(
  "/my-loans",
  requireRole("STUDENT"),
  validate(loanListQuerySchema, "query"),
  asyncHandler(libraryController.myLoans),
);
libraryRouter.get("/my-reservations", requireRole("STUDENT"), asyncHandler(libraryController.myReservations));
libraryRouter.get("/my-fines", requireRole("STUDENT"), asyncHandler(libraryController.myFines));
libraryRouter.post(
  "/books/:id/reserve",
  requireRole("STUDENT"),
  validate(idParamsSchema, "params"),
  asyncHandler(libraryController.reserveBook),
);
libraryRouter.post(
  "/loans/:id/renew",
  requireRole("STUDENT"),
  validate(idParamsSchema, "params"),
  asyncHandler(libraryController.renewLoan),
);
libraryRouter.post(
  "/reservations/:id/cancel",
  requireRole("STUDENT"),
  validate(idParamsSchema, "params"),
  asyncHandler(libraryController.cancelReservation),
);

/** Admin library management. Mounted at /api/admin/library. */
const libraryAdminRouter = Router();

libraryAdminRouter.use(requireAuth, requireRole("ADMIN"));

libraryAdminRouter.get("/books", validate(bookListQuerySchema, "query"), asyncHandler(libraryController.adminBooks));
libraryAdminRouter.post("/books", validate(createBookSchema), asyncHandler(libraryController.createBook));
libraryAdminRouter.patch(
  "/books/:id",
  validate(idParamsSchema, "params"),
  validate(updateBookSchema),
  asyncHandler(libraryController.updateBook),
);
libraryAdminRouter.get("/copies", asyncHandler(libraryController.copies));
libraryAdminRouter.post("/copies", validate(createCopySchema), asyncHandler(libraryController.createCopy));
libraryAdminRouter.patch(
  "/copies/:id",
  validate(idParamsSchema, "params"),
  validate(updateCopySchema),
  asyncHandler(libraryController.updateCopy),
);
libraryAdminRouter.get("/loans", validate(loanListQuerySchema, "query"), asyncHandler(libraryController.loans));
libraryAdminRouter.post("/issue", validate(issueSchema), asyncHandler(libraryController.issueBook));
libraryAdminRouter.post("/return", validate(returnSchema), asyncHandler(libraryController.returnBook));
libraryAdminRouter.get(
  "/reservations",
  validate(adminReservationQuerySchema, "query"),
  asyncHandler(libraryController.reservations),
);
libraryAdminRouter.patch(
  "/reservations/:id/cancel",
  validate(idParamsSchema, "params"),
  asyncHandler(libraryController.cancelAnyReservation),
);
libraryAdminRouter.get("/fines", asyncHandler(libraryController.libraryFines));

export { libraryRouter, libraryAdminRouter };
