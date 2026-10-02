import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { env } from "../../config/env";
import { requireAuth, requireRole } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendError } from "../../utils/response";
import * as aiController from "./ai.controller";
import { askSchema } from "./ai.schemas";

const router = Router();

router.use(requireAuth);

/**
 * Per-user rate limit: every /api/ai/ask call costs an external model request,
 * so a single account cannot generate unlimited spend. Validation runs first so
 * malformed payloads are rejected without consuming quota.
 */
const askLimiter = rateLimit({
  windowMs: env.ai.rateLimitWindowMs,
  limit: env.ai.rateLimitMax,
  // requireAuth always sets req.user for this router; the fallback is defensive.
  keyGenerator: (req) => req.user?.id ?? "anonymous",
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(
      res,
      429,
      "RATE_LIMITED",
      `Too many AI requests. Please wait a moment and try again (limit: ${env.ai.rateLimitMax} per minute).`,
    );
  },
});

router.post(
  "/ask",
  requireRole("STUDENT", "FACULTY", "ADMIN", "PARENT"),
  validate(askSchema),
  askLimiter,
  asyncHandler(aiController.ask),
);

export default router;
