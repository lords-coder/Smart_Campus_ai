import { Router } from "express";
import * as attendanceController from "./attendance.controller";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { classQuerySchema, classParamsSchema, submitAttendanceSchema } from "./attendance.schemas";

const router = Router();

router.use(requireAuth, requireRole("FACULTY", "ADMIN"));

router.get("/classes", asyncHandler(attendanceController.listClasses));

router.get(
  "/classes/:timetableEntryId",
  validate(classParamsSchema, "params"),
  validate(classQuerySchema, "query"),
  asyncHandler(attendanceController.classState),
);

router.post("/", validate(submitAttendanceSchema), asyncHandler(attendanceController.submit));

export default router;
