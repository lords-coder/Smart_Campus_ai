import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/authenticate";
import { asyncHandler } from "../../utils/asyncHandler";
import * as performanceController from "./performance.controller";

const router = Router();

router.use(requireAuth, requireRole("STUDENT"));

router.get("/", asyncHandler(performanceController.getMyPerformance));
router.get("/predict", asyncHandler(performanceController.getMyPrediction));

export default router;