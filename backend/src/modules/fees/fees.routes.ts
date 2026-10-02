import { Router } from "express";
import * as feesController from "./fees.controller";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { feeParamsSchema, listFeesQuerySchema, recordPaymentSchema } from "./fees.schemas";

const router = Router();

router.use(requireAuth);

router.get("/", requireRole("ADMIN"), validate(listFeesQuerySchema, "query"), asyncHandler(feesController.list));

router.get(
  "/:feeId/payments",
  requireRole("ADMIN", "STUDENT"),
  validate(feeParamsSchema, "params"),
  asyncHandler(feesController.payments),
);

router.post(
  "/:feeId/payments",
  requireRole("ADMIN"),
  validate(feeParamsSchema, "params"),
  validate(recordPaymentSchema),
  asyncHandler(feesController.recordPayment),
);

export default router;
