import { Router } from "express";
import { requireAuth, requireRole } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../utils/asyncHandler";
import * as messController from "./mess.controller";
import {
  billingSchema,
  createFeedbackSchema,
  createItemSchema,
  createMenuSchema,
  createOrderSchema,
  createPlanSchema,
  enrollSchema,
  enrollmentListQuerySchema,
  idParamsSchema,
  itemListQuerySchema,
  mealHistoryQuerySchema,
  menuQuerySchema,
  orderListQuerySchema,
  recordMealSchema,
  updateEnrollmentSchema,
  updateItemSchema,
  updateMenuSchema,
  updateOrderSchema,
  updatePlanSchema,
} from "./mess.schemas";

/** Student self-service. Mounted at /api/mess. */
const messRouter = Router();

messRouter.use(requireAuth, requireRole("STUDENT"));

messRouter.get("/plan", asyncHandler(messController.myPlan));
messRouter.get("/plans", asyncHandler(messController.availablePlans));
messRouter.post("/enroll", validate(enrollSchema), asyncHandler(messController.enroll));
messRouter.post("/enrollment/cancel", asyncHandler(messController.cancelEnrollment));
messRouter.get("/menu", validate(menuQuerySchema, "query"), asyncHandler(messController.menu));
messRouter.get("/meals", validate(mealHistoryQuerySchema, "query"), asyncHandler(messController.myMeals));
messRouter.get("/billing", asyncHandler(messController.myBilling));
messRouter.get("/orders", validate(orderListQuerySchema, "query"), asyncHandler(messController.myOrders));
messRouter.post("/orders", validate(createOrderSchema), asyncHandler(messController.createOrder));
messRouter.post(
  "/orders/:id/cancel",
  validate(idParamsSchema, "params"),
  asyncHandler(messController.cancelOrder),
);
messRouter.get("/feedback", asyncHandler(messController.myFeedback));
messRouter.post("/feedback", validate(createFeedbackSchema), asyncHandler(messController.submitFeedback));

/** Canteen catalogue reads for students (orders live under /mess). */
messRouter.get("/canteen", validate(itemListQuerySchema, "query"), asyncHandler(messController.items));

/** Admin mess & canteen management. Mounted at /api/admin/mess. */
const messAdminRouter = Router();

messAdminRouter.use(requireAuth, requireRole("ADMIN"));

messAdminRouter.get("/plans", asyncHandler(messController.plans));
messAdminRouter.post("/plans", validate(createPlanSchema), asyncHandler(messController.createPlan));
messAdminRouter.patch(
  "/plans/:id",
  validate(idParamsSchema, "params"),
  validate(updatePlanSchema),
  asyncHandler(messController.updatePlan),
);
messAdminRouter.get(
  "/enrollments",
  validate(enrollmentListQuerySchema, "query"),
  asyncHandler(messController.enrollments),
);
messAdminRouter.patch(
  "/enrollments/:id",
  validate(idParamsSchema, "params"),
  validate(updateEnrollmentSchema),
  asyncHandler(messController.updateEnrollment),
);
messAdminRouter.get("/menu", validate(menuQuerySchema, "query"), asyncHandler(messController.adminMenu));
messAdminRouter.post("/menu", validate(createMenuSchema), asyncHandler(messController.createMenuEntry));
messAdminRouter.patch(
  "/menu/:id",
  validate(idParamsSchema, "params"),
  validate(updateMenuSchema),
  asyncHandler(messController.updateMenuEntry),
);
messAdminRouter.delete(
  "/menu/:id",
  validate(idParamsSchema, "params"),
  asyncHandler(messController.deleteMenuEntry),
);
messAdminRouter.post("/meals/record", validate(recordMealSchema), asyncHandler(messController.recordMeal));
messAdminRouter.get(
  "/meals",
  validate(mealHistoryQuerySchema, "query"),
  asyncHandler(messController.mealHistory),
);
messAdminRouter.get("/items", validate(itemListQuerySchema, "query"), asyncHandler(messController.items));
messAdminRouter.post("/items", validate(createItemSchema), asyncHandler(messController.createItem));
messAdminRouter.patch(
  "/items/:id",
  validate(idParamsSchema, "params"),
  validate(updateItemSchema),
  asyncHandler(messController.updateItem),
);
messAdminRouter.get("/orders", validate(orderListQuerySchema, "query"), asyncHandler(messController.orders));
messAdminRouter.patch(
  "/orders/:id",
  validate(idParamsSchema, "params"),
  validate(updateOrderSchema),
  asyncHandler(messController.updateOrder),
);
messAdminRouter.post("/billing", validate(billingSchema), asyncHandler(messController.generateBilling));
messAdminRouter.get("/feedback", asyncHandler(messController.feedback));
messAdminRouter.get("/analytics", asyncHandler(messController.analytics));

export { messRouter, messAdminRouter };
