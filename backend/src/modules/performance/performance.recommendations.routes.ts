import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendSuccess } from "../../utils/response";
import { requireAuth, requireRole } from "../../middleware/authenticate";
import { generateRecommendations, generateAiStudyPlan } from "./performance.recommendations";

const router = Router();

// All routes require STUDENT role and authentication
router.use(requireAuth, requireRole("STUDENT"));

/**
 * GET /api/recommendations
 * Returns personalized learning recommendations for the authenticated student.
 * Student identity is derived from JWT (req.user.id).
 * No studentId query parameter is accepted for ownership override.
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const studentId = req.user!.id;
    const result = await generateRecommendations(studentId);
    return sendSuccess(res, result.data, result.message);
  }),
);

/**
 * GET /api/recommendations/study-plan
 * Returns an optional AI-generated study plan based on deterministic recommendations.
 * Uses Phase 4 AI provider abstraction; falls back gracefully if provider fails.
 * Student identity is derived from JWT (req.user.id).
 */
router.get(
  "/study-plan",
  asyncHandler(async (req, res) => {
    const studentId = req.user!.id;
    const result = await generateAiStudyPlan(studentId);
    return sendSuccess(res, result.data, result.message);
  }),
);

export default router;