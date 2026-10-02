import { Router } from "express";
import { pingDatabase } from "../config/db";
import { sendSuccess } from "../utils/response";
import { asyncHandler } from "../utils/asyncHandler";
import authRoutes from "../modules/auth/auth.routes";
import studentRoutes from "../modules/students/students.routes";
import attendanceRoutes from "../modules/attendance/attendance.routes";
import feesRoutes from "../modules/fees/fees.routes";
import timetableRoutes from "../modules/timetable/timetable.routes";
import aiRoutes from "../modules/ai/ai.routes";
import recommendationsRoutes from "../modules/performance/performance.recommendations.routes";
import riskRoutes from "../modules/performance/performance.risk.routes";
import performanceRoutes from "../modules/performance/performance.routes";
import { parentAdminRouter, parentRouter } from "../modules/parent/parent.routes";
import { hostelAdminRouter, hostelRouter } from "../modules/hostel/hostel.routes";
import { transportAdminRouter, transportRouter } from "../modules/transport/transport.routes";
import {
  certificatesAdminRouter,
  certificatesRouter,
  certificatesVerifyRouter,
} from "../modules/certificates/certificates.routes";
import { libraryAdminRouter, libraryRouter } from "../modules/library/library.routes";
import { placementsAdminRouter, placementsRouter } from "../modules/placements/placements.routes";
import { alumniAdminRouter, alumniRouter } from "../modules/alumni/alumni.routes";
import { messAdminRouter, messRouter } from "../modules/mess/mess.routes";
import superAdminRoutes from "../modules/super-admin/super-admin.routes";

const router = Router();

router.get(
  "/health",
  asyncHandler(async (_req, res) => {
    const databaseUp = await pingDatabase();
    return sendSuccess(
      res,
      {
        status: databaseUp ? "ok" : "degraded",
        database: databaseUp ? "up" : "down",
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
      databaseUp ? "Service healthy" : "Database unreachable",
      databaseUp ? 200 : 503,
    );
  }),
);

router.use("/auth", authRoutes);
router.use("/students", studentRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/fees", feesRoutes);
router.use("/timetable", timetableRoutes);
router.use("/ai", aiRoutes);
router.use("/recommendations", recommendationsRoutes);
router.use("/risk", riskRoutes);
router.use("/performance", performanceRoutes);
router.use("/parent", parentRouter);
router.use("/admin/parents", parentAdminRouter);
router.use("/hostel", hostelRouter);
router.use("/admin/hostel", hostelAdminRouter);
router.use("/transport", transportRouter);
router.use("/admin/transport", transportAdminRouter);
router.use("/certificates/verify", certificatesVerifyRouter);
router.use("/certificates", certificatesRouter);
router.use("/admin/certificates", certificatesAdminRouter);
router.use("/library", libraryRouter);
router.use("/admin/library", libraryAdminRouter);
router.use("/placements", placementsRouter);
router.use("/admin/placements", placementsAdminRouter);
router.use("/alumni", alumniRouter);
router.use("/admin/alumni", alumniAdminRouter);
router.use("/mess", messRouter);
router.use("/admin/mess", messAdminRouter);
router.use("/super-admin", superAdminRoutes);

export default router;