import { Request, Response } from "express";
import { ApiError } from "../../utils/ApiError";
import { sendSuccess } from "../../utils/response";
import * as messService from "./mess.service";

type Validated<T> = Request & { validatedQuery?: T };

function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

function param(req: Request, name: string): string {
  const value = req.params[name];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

// ------------------------------------------------------------------ student

export async function myPlan(req: Request, res: Response) {
  const data = await messService.getMyEnrollment(requireUserId(req));
  return sendSuccess(res, { enrollment: data }, "Meal plan retrieved");
}

export async function availablePlans(_req: Request, res: Response) {
  const data = await messService.listPlans(true);
  return sendSuccess(res, { plans: data }, "Plans retrieved");
}

export async function enroll(req: Request, res: Response) {
  const { planId, startDate } = req.body as { planId: string; startDate?: string };
  const data = await messService.enrollStudent(requireUserId(req), planId, startDate);
  return sendSuccess(res, data, "Enrolled in meal plan", 201);
}

export async function cancelEnrollment(req: Request, res: Response) {
  const data = await messService.cancelMyEnrollment(requireUserId(req));
  return sendSuccess(res, data, "Enrollment cancelled");
}

export async function menu(req: Request, res: Response) {
  const q = (req as Validated<{ scope?: string; from?: string; to?: string }>).validatedQuery ?? {};
  const range = messService.menuRange(q.scope, q.from, q.to);
  const data = await messService.listMenu(range.from, range.to);
  return sendSuccess(res, { menu: data, from: range.from, to: range.to }, "Menu retrieved");
}

export async function myMeals(req: Request, res: Response) {
  const q = (req as Validated<{ from?: string; to?: string; limit?: number }>).validatedQuery ?? {};
  const data = await messService.myMealHistory(requireUserId(req), q.from, q.to, q.limit);
  return sendSuccess(res, { meals: data }, "Meal attendance retrieved");
}

export async function myBilling(req: Request, res: Response) {
  const data = await messService.studentBilling(requireUserId(req));
  return sendSuccess(res, data, "Billing retrieved");
}

export async function myOrders(req: Request, res: Response) {
  const q = (req as Validated<{ status?: string }>).validatedQuery ?? {};
  const data = await messService.myOrders(requireUserId(req), q.status);
  return sendSuccess(res, { orders: data }, "Orders retrieved");
}

export async function createOrder(req: Request, res: Response) {
  const data = await messService.createOrder(requireUserId(req), req.body.items);
  return sendSuccess(res, data, "Order placed", 201);
}

export async function cancelOrder(req: Request, res: Response) {
  const data = await messService.cancelMyOrder(requireUserId(req), param(req, "id"));
  return sendSuccess(res, data, "Order cancelled");
}

export async function myFeedback(req: Request, res: Response) {
  const data = await messService.myFeedback(requireUserId(req));
  return sendSuccess(res, { feedback: data }, "Feedback retrieved");
}

export async function submitFeedback(req: Request, res: Response) {
  const { mealDate, mealType, rating, comment } = req.body as {
    mealDate?: string;
    mealType: string;
    rating: number;
    comment?: string;
  };
  const data = await messService.submitFeedback(requireUserId(req), mealDate, mealType, rating, comment ?? "");
  return sendSuccess(res, data, "Feedback submitted", 201);
}

// ------------------------------------------------------------------- admin

export async function plans(_req: Request, res: Response) {
  const data = await messService.listPlans(false);
  return sendSuccess(res, { plans: data }, "Plans retrieved");
}

export async function createPlan(req: Request, res: Response) {
  const data = await messService.createPlan(req.body);
  return sendSuccess(res, data, "Plan created", 201);
}

export async function updatePlan(req: Request, res: Response) {
  const data = await messService.updatePlan(param(req, "id"), req.body);
  return sendSuccess(res, data, "Plan updated");
}

export async function enrollments(req: Request, res: Response) {
  const q = (req as Validated<{ status?: string }>).validatedQuery ?? {};
  const data = await messService.listEnrollments(q.status);
  return sendSuccess(res, { enrollments: data }, "Enrollments retrieved");
}

export async function updateEnrollment(req: Request, res: Response) {
  const data = await messService.updateEnrollment(param(req, "id"), req.body);
  return sendSuccess(res, data, "Enrollment updated");
}

export async function adminMenu(req: Request, res: Response) {
  const q = (req as Validated<{ from?: string; to?: string }>).validatedQuery ?? {};
  const today = new Date().toISOString().slice(0, 10);
  const data = await messService.listMenu(q.from ?? today, q.to ?? q.from ?? today);
  return sendSuccess(res, { menu: data }, "Menu retrieved");
}

export async function createMenuEntry(req: Request, res: Response) {
  const { mealDate, mealType, menuDescription, calories } = req.body as {
    mealDate: string;
    mealType: string;
    menuDescription: string;
    calories?: number | null;
  };
  const data = await messService.createMenuEntry(mealDate, mealType, menuDescription, calories ?? null);
  return sendSuccess(res, data, "Menu entry created", 201);
}

export async function updateMenuEntry(req: Request, res: Response) {
  const data = await messService.updateMenuEntry(param(req, "id"), req.body);
  return sendSuccess(res, data, "Menu entry updated");
}

export async function deleteMenuEntry(req: Request, res: Response) {
  const data = await messService.deleteMenuEntry(param(req, "id"));
  return sendSuccess(res, data, "Menu entry deleted");
}

export async function recordMeal(req: Request, res: Response) {
  if (!req.user) throw ApiError.unauthorized();
  const { studentNo, mealDate, mealType, consumed } = req.body as {
    studentNo: string;
    mealDate: string;
    mealType: string;
    consumed?: boolean;
  };
  const data = await messService.recordMealAttendance(req.user.id, studentNo, mealDate, mealType, consumed ?? true);
  return sendSuccess(res, data, "Meal attendance recorded", 201);
}

export async function mealHistory(req: Request, res: Response) {
  const q = (req as Validated<{ studentNo?: string; from?: string; to?: string; limit?: number }>).validatedQuery ?? {};
  const data = await messService.adminMealHistory({ studentNo: q.studentNo, from: q.from, to: q.to, limit: q.limit });
  return sendSuccess(res, { meals: data }, "Meal history retrieved");
}

export async function items(req: Request, res: Response) {
  const q = (req as Validated<{ q?: string; category?: string; available?: boolean }>).validatedQuery ?? {};
  const data = await messService.listItems({ q: q.q, category: q.category, available: q.available });
  return sendSuccess(res, { items: data }, "Canteen items retrieved");
}

export async function createItem(req: Request, res: Response) {
  const data = await messService.createItem(req.body);
  return sendSuccess(res, data, "Item created", 201);
}

export async function updateItem(req: Request, res: Response) {
  const data = await messService.updateItem(param(req, "id"), req.body);
  return sendSuccess(res, data, "Item updated");
}

export async function orders(req: Request, res: Response) {
  const q = (req as Validated<{ status?: string }>).validatedQuery ?? {};
  const data = await messService.listOrders({ status: q.status });
  return sendSuccess(res, { orders: data }, "Orders retrieved");
}

export async function updateOrder(req: Request, res: Response) {
  const data = await messService.updateOrderStatus(param(req, "id"), req.body.status as string);
  return sendSuccess(res, data, "Order updated");
}

export async function generateBilling(req: Request, res: Response) {
  if (!req.user) throw ApiError.unauthorized();
  const { studentNo, month } = req.body as { studentNo?: string; month: string };
  const data = await messService.generateBilling(req.user.id, month, studentNo);
  return sendSuccess(res, data, "Billing generated");
}

export async function feedback(req: Request, res: Response) {
  const data = await messService.feedbackSummary();
  return sendSuccess(res, data, "Feedback summary retrieved");
}

export async function analytics(_req: Request, res: Response) {
  const data = await messService.messAnalytics();
  return sendSuccess(res, data, "Mess analytics retrieved");
}
