import { Router } from "express";
import * as superAdminController from "./super-admin.controller";
import { validate } from "../../middleware/validate";
import { requireAuth, requireRole } from "../../middleware/authenticate";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  rejectRegistrationSchema,
  updateUserStatusSchema,
  updatePasswordHelpSchema,
} from "./super-admin.schemas";

const router = Router();

// Every route in this module is SUPER_ADMIN-only: registering an ADMIN account,
// approving registrations and handling password help are the highest authority
// actions in the system and are never delegated to a normal ADMIN.
router.use(requireAuth, requireRole("SUPER_ADMIN"));

router.get("/registrations", asyncHandler(superAdminController.listRegistrations));
router.get("/registrations/:id", asyncHandler(superAdminController.getRegistration));
router.patch("/registrations/:id/approve", asyncHandler(superAdminController.approveRegistration));
router.patch("/registrations/:id/reject", validate(rejectRegistrationSchema), asyncHandler(superAdminController.rejectRegistration));

router.get("/users", asyncHandler(superAdminController.listUsers));
router.patch("/users/:id/status", validate(updateUserStatusSchema), asyncHandler(superAdminController.updateUserStatus));

router.get("/password-help", asyncHandler(superAdminController.listPasswordHelp));
router.patch("/password-help/:id", validate(updatePasswordHelpSchema), asyncHandler(superAdminController.updatePasswordHelp));
router.post("/password-help/:id/reset", asyncHandler(superAdminController.issueResetToken));

export default router;