import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import * as transportController from "./transport.controller";
import {
  assignStudentSchema,
  assignmentListQuerySchema,
  createAlertSchema,
  createDriverSchema,
  createRouteSchema,
  createStopSchema,
  createVehicleSchema,
  idParamsSchema,
  simulationSchema,
  telemetrySchema,
  updateAlertSchema,
  updateRouteSchema,
  updateStopSchema,
  updateVehicleSchema,
  vehicleListQuerySchema,
} from "./transport.schemas";

const routeIdQuerySchema = z.object({
  routeId: z.string().uuid().optional(),
});

/** Student self-service. Mounted at /api/transport. */
const transportRouter = Router();

transportRouter.use(requireAuth, requireRole("STUDENT"));

transportRouter.get("/me", asyncHandler(transportController.myTransport));

/** Admin transport management. Mounted at /api/admin/transport. */
const transportAdminRouter = Router();

transportAdminRouter.use(requireAuth, requireRole("ADMIN"));

transportAdminRouter.get("/dashboard", asyncHandler(transportController.dashboard));
transportAdminRouter.get("/vehicles", validate(vehicleListQuerySchema, "query"), asyncHandler(transportController.vehicles));
transportAdminRouter.post("/vehicles", validate(createVehicleSchema), asyncHandler(transportController.createVehicle));
transportAdminRouter.patch(
  "/vehicles/:id",
  validate(idParamsSchema, "params"),
  validate(updateVehicleSchema),
  asyncHandler(transportController.updateVehicle),
);
transportAdminRouter.get("/drivers", asyncHandler(transportController.drivers));
transportAdminRouter.post("/drivers", validate(createDriverSchema), asyncHandler(transportController.createDriver));
transportAdminRouter.get("/routes", asyncHandler(transportController.routes));
transportAdminRouter.post("/routes", validate(createRouteSchema), asyncHandler(transportController.createRoute));
transportAdminRouter.get("/routes/:id", validate(idParamsSchema, "params"), asyncHandler(transportController.routeDetail));
transportAdminRouter.patch(
  "/routes/:id",
  validate(idParamsSchema, "params"),
  validate(updateRouteSchema),
  asyncHandler(transportController.updateRoute),
);
transportAdminRouter.post("/stops", validate(createStopSchema), asyncHandler(transportController.addStop));
transportAdminRouter.patch(
  "/stops/:id",
  validate(idParamsSchema, "params"),
  validate(updateStopSchema),
  asyncHandler(transportController.updateStop),
);
transportAdminRouter.get(
  "/assignments",
  validate(assignmentListQuerySchema, "query"),
  asyncHandler(transportController.assignments),
);
transportAdminRouter.post("/assignments", validate(assignStudentSchema), asyncHandler(transportController.assignStudent));
transportAdminRouter.patch(
  "/assignments/:id/end",
  validate(idParamsSchema, "params"),
  asyncHandler(transportController.endAssignment),
);
transportAdminRouter.get("/alerts", validate(routeIdQuerySchema, "query"), asyncHandler(transportController.alerts));
transportAdminRouter.post("/alerts", validate(createAlertSchema), asyncHandler(transportController.createAlert));
transportAdminRouter.patch(
  "/alerts/:id",
  validate(idParamsSchema, "params"),
  validate(updateAlertSchema),
  asyncHandler(transportController.updateAlert),
);
transportAdminRouter.post("/telemetry", validate(telemetrySchema), asyncHandler(transportController.ingestPoint));
transportAdminRouter.post("/simulation", validate(simulationSchema), asyncHandler(transportController.simulate));
transportAdminRouter.get("/tracking", asyncHandler(transportController.tracking));
transportAdminRouter.get(
  "/vehicles/:id/location",
  validate(idParamsSchema, "params"),
  asyncHandler(transportController.vehicleLocation),
);

export { transportRouter, transportAdminRouter };
