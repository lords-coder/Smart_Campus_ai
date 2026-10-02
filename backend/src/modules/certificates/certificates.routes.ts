import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { requireAuth, requireRole } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import { sendError } from "../../utils/response";
import * as certificatesController from "./certificates.controller";
import {
  createRequestSchema,
  idParamsSchema,
  rejectSchema,
  requestListQuerySchema,
  verificationCodeParamsSchema,
} from "./certificates.schemas";

/** Student self-service. Mounted at /api/certificates. */
const certificatesRouter = Router();

certificatesRouter.use(requireAuth, requireRole("STUDENT"));

certificatesRouter.post("/requests", validate(createRequestSchema), asyncHandler(certificatesController.createRequest));
certificatesRouter.get("/requests", asyncHandler(certificatesController.myRequests));
certificatesRouter.get("/", asyncHandler(certificatesController.myCertificates));
certificatesRouter.get("/:id", validate(idParamsSchema, "params"), asyncHandler(certificatesController.myCertificate));
certificatesRouter.get(
  "/:id/download",
  validate(idParamsSchema, "params"),
  asyncHandler(certificatesController.downloadCertificate),
);

/** Admin certificate management. Mounted at /api/admin/certificates. */
const certificatesAdminRouter = Router();

certificatesAdminRouter.use(requireAuth, requireRole("ADMIN"));

certificatesAdminRouter.get(
  "/requests",
  validate(requestListQuerySchema, "query"),
  asyncHandler(certificatesController.adminRequests),
);
certificatesAdminRouter.get(
  "/requests/:id",
  validate(idParamsSchema, "params"),
  asyncHandler(certificatesController.adminRequestDetail),
);
certificatesAdminRouter.patch(
  "/requests/:id/approve",
  validate(idParamsSchema, "params"),
  asyncHandler(certificatesController.approveRequest),
);
certificatesAdminRouter.patch(
  "/requests/:id/reject",
  validate(idParamsSchema, "params"),
  validate(rejectSchema),
  asyncHandler(certificatesController.rejectRequest),
);
certificatesAdminRouter.post(
  "/requests/:id/issue",
  validate(idParamsSchema, "params"),
  asyncHandler(certificatesController.issueCertificate),
);
certificatesAdminRouter.patch(
  "/:id/revoke",
  validate(idParamsSchema, "params"),
  asyncHandler(certificatesController.revokeCertificate),
);

/**
 * Public verification. Mounted at /api/certificates/verify (no auth).
 * Rate-limited per IP so the endpoint cannot be flooded.
 */
const certificatesVerifyRouter = Router();

const verifyLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 429, "RATE_LIMITED", "Too many verification requests. Please wait a moment and try again.");
  },
});

certificatesVerifyRouter.get(
  "/:verificationCode",
  verifyLimiter,
  validate(verificationCodeParamsSchema, "params"),
  asyncHandler(certificatesController.verifyCertificate),
);

export { certificatesRouter, certificatesAdminRouter, certificatesVerifyRouter };
