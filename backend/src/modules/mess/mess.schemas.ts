import { z } from "zod";

export const uuidSchema = z.string().uuid("Must be a valid UUID");
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const mealTypeSchema = z.enum(["BREAKFAST", "LUNCH", "SNACKS", "DINNER"]);
const monthSchema = z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM");

export const createPlanSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).default(""),
  billingType: z.enum(["MONTHLY", "WEEKLY", "MEAL_BASED"]).default("MONTHLY"),
  price: z.number().min(0).max(1000000),
  mealsPerDay: z.number().int().min(1).max(6).default(4),
});

export const updatePlanSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    price: z.number().min(0).max(1000000).optional(),
    mealsPerDay: z.number().int().min(1).max(6).optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export const enrollSchema = z.object({
  planId: uuidSchema,
  startDate: dateSchema.optional(),
});

export const updateEnrollmentSchema = z
  .object({
    status: z.enum(["ACTIVE", "PAUSED", "CANCELLED", "EXPIRED"]).optional(),
    planId: uuidSchema.optional(),
    endDate: dateSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export const enrollmentListQuerySchema = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "CANCELLED", "EXPIRED"]).optional(),
});

export const menuQuerySchema = z.object({
  scope: z.enum(["today", "tomorrow", "week"]).optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});

export const createMenuSchema = z.object({
  mealDate: dateSchema,
  mealType: mealTypeSchema,
  menuDescription: z.string().trim().min(2).max(1000),
  calories: z.number().int().min(0).max(5000).nullable().optional(),
});

export const updateMenuSchema = z
  .object({
    menuDescription: z.string().trim().min(2).max(1000).optional(),
    calories: z.number().int().min(0).max(5000).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export const recordMealSchema = z.object({
  studentNo: z.string().trim().min(1).max(20),
  mealDate: dateSchema,
  mealType: mealTypeSchema,
  consumed: z.boolean().default(true),
});

export const mealHistoryQuerySchema = z.object({
  studentNo: z.string().trim().max(20).optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(60),
});

export const createItemSchema = z.object({
  name: z.string().trim().min(2).max(200),
  category: z.enum(["BEVERAGE", "SNACK", "MEAL", "DESSERT", "OTHER"]).default("OTHER"),
  description: z.string().trim().max(1000).default(""),
  price: z.number().min(0).max(100000),
});

export const updateItemSchema = z
  .object({
    name: z.string().trim().min(2).max(200).optional(),
    category: z.enum(["BEVERAGE", "SNACK", "MEAL", "DESSERT", "OTHER"]).optional(),
    description: z.string().trim().max(1000).optional(),
    price: z.number().min(0).max(100000).optional(),
    available: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export const itemListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(["BEVERAGE", "SNACK", "MEAL", "DESSERT", "OTHER"]).optional(),
  available: z.coerce.boolean().optional(),
});

export const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: uuidSchema,
        quantity: z.number().int().min(1).max(50),
      }),
    )
    .min(1)
    .max(20),
});

export const updateOrderSchema = z.object({
  status: z.enum(["CONFIRMED", "READY", "COMPLETED", "CANCELLED"]),
});

export const orderListQuerySchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "READY", "COMPLETED", "CANCELLED"]).optional(),
});

export const billingSchema = z.object({
  studentNo: z.string().trim().min(1).max(20).optional(),
  month: monthSchema,
});

export const createFeedbackSchema = z.object({
  mealDate: dateSchema.optional(),
  mealType: mealTypeSchema,
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).default(""),
});

export const idParamsSchema = z.object({
  id: uuidSchema,
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;
