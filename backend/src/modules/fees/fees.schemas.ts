import { z } from "zod";
import { PAYMENT_METHODS } from "./fees.types";

const uuidSchema = z.string().uuid("Must be a valid identifier");

const moneySchema = z
  .number()
  .positive("Amount must be greater than zero")
  .max(100_000_000, "Amount is too large")
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, "Amount can have at most 2 decimal places");

export const listFeesQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["PENDING", "PARTIAL", "PAID"]).optional(),
});

export const feeParamsSchema = z.object({ feeId: uuidSchema });

export const recordPaymentSchema = z.object({
  amount: moneySchema,
  paymentMethod: z.enum(PAYMENT_METHODS),
  reference: z
    .string()
    .trim()
    .max(100, "Reference must be 100 characters or fewer")
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export type ListFeesQuery = z.infer<typeof listFeesQuerySchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
