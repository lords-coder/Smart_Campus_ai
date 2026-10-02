import { Router } from "express";
import * as timetableController from "./timetable.controller";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import {
  createTimetableSchema,
  deleteTimetableQuerySchema,
  timetableListQuerySchema,
  timetableParamsSchema,
  updateTimetableSchema,
} from "./timetable.schemas";

const router = Router();

router.use(requireAuth);

// Admin-only reference data for the create/edit form (courses, faculty, sections).
router.get("/options", requireRole("ADMIN"), asyncHandler(timetableController.options));

// Reading: ADMIN sees everything (with filters), FACULTY sees its own classes.
router.get(
  "/",
  requireRole("FACULTY", "ADMIN"),
  validate(timetableListQuerySchema, "query"),
  asyncHandler(timetableController.list),
);

router.get(
  "/:entryId",
  requireRole("FACULTY", "ADMIN"),
  validate(timetableParamsSchema, "params"),
  asyncHandler(timetableController.get),
);

// Writing: ADMIN only. Students and faculty are rejected by requireRole.
router.post("/", requireRole("ADMIN"), validate(createTimetableSchema), asyncHandler(timetableController.create));

router.patch(
  "/:entryId",
  requireRole("ADMIN"),
  validate(timetableParamsSchema, "params"),
  validate(updateTimetableSchema),
  asyncHandler(timetableController.update),
);

router.delete(
  "/:entryId",
  requireRole("ADMIN"),
  validate(timetableParamsSchema, "params"),
  validate(deleteTimetableQuerySchema, "query"),
  asyncHandler(timetableController.remove),
);

export default router;
