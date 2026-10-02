import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import * as parentController from "./parent.controller";
import { activateParentSchema, createInvitationSchema, updateLinkSchema } from "./parent.schemas";

const daySchema = z.object({
  day: z.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]).optional(),
});

/** Parent self-service + public invitation activation. Mounted at /api/parent. */
const parentRouter = Router();

// Public: invitation-based activation (no JWT; the token is the credential).
parentRouter.post("/activate", validate(activateParentSchema), asyncHandler(parentController.activate));

parentRouter.use(requireAuth, requireRole("PARENT"));

parentRouter.get("/students", asyncHandler(parentController.myStudents));
parentRouter.get("/students/:studentId/overview", asyncHandler(parentController.overview));
parentRouter.get("/students/:studentId/attendance", asyncHandler(parentController.attendance));
parentRouter.get("/students/:studentId/fees", asyncHandler(parentController.fees));
parentRouter.get(
  "/students/:studentId/timetable",
  validate(daySchema, "query"),
  asyncHandler(parentController.timetable),
);
parentRouter.get("/students/:studentId/recommendations", asyncHandler(parentController.recommendations));
parentRouter.get("/students/:studentId/notices", asyncHandler(parentController.notices));
parentRouter.get("/students/:studentId/transport", asyncHandler(parentController.transport));
parentRouter.get("/students/:studentId/hostel", asyncHandler(parentController.hostel));
parentRouter.get("/students/:studentId/certificates", asyncHandler(parentController.certificates));
parentRouter.get("/students/:studentId/library", asyncHandler(parentController.library));
parentRouter.get("/students/:studentId/mess", asyncHandler(parentController.mess));
parentRouter.get("/students/:studentId/placements", asyncHandler(parentController.placements));

/** Admin parent management. Mounted at /api/admin/parents. */
const parentAdminRouter = Router();

parentAdminRouter.use(requireAuth, requireRole("ADMIN"));

parentAdminRouter.get("/", asyncHandler(parentController.listParents));
parentAdminRouter.get("/invitations", asyncHandler(parentController.listInvitations));
parentAdminRouter.post("/invitations", validate(createInvitationSchema), asyncHandler(parentController.createInvitation));
parentAdminRouter.patch("/invitations/:invitationId/revoke", asyncHandler(parentController.revokeInvitation));
parentAdminRouter.patch("/links/:linkId", validate(updateLinkSchema), asyncHandler(parentController.updateLink));

export { parentRouter, parentAdminRouter };
