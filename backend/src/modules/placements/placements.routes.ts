import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import * as placementsController from "./placements.controller";
import {
  applicationListQuerySchema,
  createCompanySchema,
  createDriveSchema,
  createInterviewSchema,
  createOfferSchema,
  driveListQuerySchema,
  idParamsSchema,
  updateApplicationSchema,
  updateCompanySchema,
  updateDriveSchema,
  updateInterviewSchema,
  updateOfferSchema,
} from "./placements.schemas";

/** Student self-service (catalogue reads also serve faculty). Mounted at /api/placements. */
const placementsRouter = Router();

placementsRouter.use(requireAuth);

placementsRouter.get(
  "/drives",
  requireRole("STUDENT", "FACULTY"),
  validate(driveListQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    if (req.user?.role === "FACULTY") return placementsController.openDrives(req, res);
    return placementsController.drives(req, res);
  }),
);
placementsRouter.get(
  "/drives/:id",
  requireRole("STUDENT", "FACULTY"),
  validate(idParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    if (req.user?.role === "FACULTY") return placementsController.publicDriveDetail(req, res);
    return placementsController.driveDetail(req, res);
  }),
);
placementsRouter.get(
  "/drives/:id/eligibility",
  requireRole("STUDENT"),
  validate(idParamsSchema, "params"),
  asyncHandler(placementsController.driveEligibility),
);
placementsRouter.post(
  "/drives/:id/apply",
  requireRole("STUDENT"),
  validate(idParamsSchema, "params"),
  asyncHandler(placementsController.applyToDrive),
);
placementsRouter.get("/applications", requireRole("STUDENT"), asyncHandler(placementsController.myApplications));
placementsRouter.get(
  "/applications/:id",
  requireRole("STUDENT"),
  validate(idParamsSchema, "params"),
  asyncHandler(placementsController.myApplication),
);
placementsRouter.post(
  "/applications/:id/withdraw",
  requireRole("STUDENT"),
  validate(idParamsSchema, "params"),
  asyncHandler(placementsController.withdrawApplication),
);
placementsRouter.get("/history", requireRole("STUDENT"), asyncHandler(placementsController.placementHistory));

/** Admin placement management. Mounted at /api/admin/placements. */
const placementsAdminRouter = Router();

placementsAdminRouter.use(requireAuth, requireRole("ADMIN"));

placementsAdminRouter.get("/companies", asyncHandler(placementsController.companies));
placementsAdminRouter.post("/companies", validate(createCompanySchema), asyncHandler(placementsController.createCompany));
placementsAdminRouter.patch(
  "/companies/:id",
  validate(idParamsSchema, "params"),
  validate(updateCompanySchema),
  asyncHandler(placementsController.updateCompany),
);
placementsAdminRouter.get(
  "/drives",
  validate(driveListQuerySchema, "query"),
  asyncHandler(placementsController.adminDrives),
);
placementsAdminRouter.post("/drives", validate(createDriveSchema), asyncHandler(placementsController.createDrive));
placementsAdminRouter.patch(
  "/drives/:id",
  validate(idParamsSchema, "params"),
  validate(updateDriveSchema),
  asyncHandler(placementsController.updateDrive),
);
placementsAdminRouter.get(
  "/drives/:id/applications",
  validate(idParamsSchema, "params"),
  validate(applicationListQuerySchema, "query"),
  asyncHandler(placementsController.driveApplications),
);
placementsAdminRouter.get(
  "/applications/:id",
  validate(idParamsSchema, "params"),
  asyncHandler(placementsController.applicationDetail),
);
placementsAdminRouter.patch(
  "/applications/:id/shortlist",
  validate(idParamsSchema, "params"),
  asyncHandler(placementsController.shortlistApplication),
);
placementsAdminRouter.patch(
  "/applications/:id/status",
  validate(idParamsSchema, "params"),
  validate(updateApplicationSchema),
  asyncHandler(placementsController.updateApplication),
);
placementsAdminRouter.post(
  "/applications/:id/interviews",
  validate(idParamsSchema, "params"),
  validate(createInterviewSchema),
  asyncHandler(placementsController.scheduleInterview),
);
placementsAdminRouter.patch(
  "/interviews/:id",
  validate(idParamsSchema, "params"),
  validate(updateInterviewSchema),
  asyncHandler(placementsController.updateInterview),
);
placementsAdminRouter.post(
  "/applications/:id/offer",
  validate(idParamsSchema, "params"),
  validate(createOfferSchema),
  asyncHandler(placementsController.createOffer),
);
placementsAdminRouter.patch(
  "/offers/:id",
  validate(idParamsSchema, "params"),
  validate(updateOfferSchema),
  asyncHandler(placementsController.updateOffer),
);
placementsAdminRouter.get("/analytics", asyncHandler(placementsController.analytics));

export { placementsRouter, placementsAdminRouter };
