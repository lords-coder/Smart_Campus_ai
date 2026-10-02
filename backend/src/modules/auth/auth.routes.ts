import { Router } from "express";
import * as authController from "./auth.controller";
import {
  loginSchema,
  registerSchema,
  passwordHelpSchema,
  resetPasswordSchema,
} from "./auth.schemas";
import { validate } from "../../middleware/validate";
import { requireAuth } from "../../middleware/authenticate";
import { asyncHandler } from "../../utils/asyncHandler";
import rateLimit from "express-rate-limit";
import { env } from "../../config/env";

const router = Router();

const authLimiter = rateLimit({
  windowMs: env.authRateLimitWindowMs,
  max: env.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: "RATE_LIMITED", message: "Too many requests, please try again later" } },
});

router.post("/register", authLimiter, validate(registerSchema), asyncHandler(authController.register));
router.post("/login", authLimiter, validate(loginSchema), asyncHandler(authController.login));
router.post("/password-help", authLimiter, validate(passwordHelpSchema), asyncHandler(authController.passwordHelp));
router.post("/reset-password", authLimiter, validate(resetPasswordSchema), asyncHandler(authController.resetPassword));
router.get("/me", requireAuth, asyncHandler(authController.me));
router.post("/logout", requireAuth, asyncHandler(authController.logout));

export default router;