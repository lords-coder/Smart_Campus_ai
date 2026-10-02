import { Router } from "express";
import * as studentsController from "./students.controller";
import { requireAuth, requireRole } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";

const router = Router();

router.use(requireAuth, requireRole("STUDENT"));

router.get("/me", asyncHandler(studentsController.me));
router.get("/me/attendance-summary", asyncHandler(studentsController.attendanceSummary));
router.get(
  "/me/attendance",
  validate(studentsController.attendanceQuerySchema, "query"),
  asyncHandler(studentsController.attendanceHistory),
);
router.get("/me/fees-summary", asyncHandler(studentsController.feesSummary));
router.get(
  "/me/timetable",
  validate(studentsController.timetableQuerySchema, "query"),
  asyncHandler(studentsController.timetable),
);

export default router;
