import { z } from "zod";

export const uuidSchema = z.string().uuid("Must be a valid UUID");

export const bookListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(60).optional(),
  author: z.string().trim().max(120).optional(),
  available: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createBookSchema = z.object({
  title: z.string().trim().min(2).max(300),
  subtitle: z.string().trim().max(300).default(""),
  isbn: z.string().trim().min(5).max(30),
  author: z.string().trim().max(200).default("Unknown"),
  publisher: z.string().trim().max(200).default(""),
  category: z.string().trim().max(60).default("General"),
  edition: z.string().trim().max(60).default(""),
  description: z.string().trim().max(5000).default(""),
  publicationYear: z.number().int().min(1500).max(2100).nullable().optional(),
});

export const updateBookSchema = z
  .object({
    title: z.string().trim().min(2).max(300).optional(),
    subtitle: z.string().trim().max(300).optional(),
    author: z.string().trim().max(200).optional(),
    publisher: z.string().trim().max(200).optional(),
    category: z.string().trim().max(60).optional(),
    edition: z.string().trim().max(60).optional(),
    description: z.string().trim().max(5000).optional(),
    publicationYear: z.number().int().min(1500).max(2100).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export const createCopySchema = z.object({
  bookId: uuidSchema,
  accessionNumber: z.string().trim().min(2).max(40),
  location: z.string().trim().max(80).default("Main Stacks"),
});

export const updateCopySchema = z
  .object({
    status: z.enum(["AVAILABLE", "ISSUED", "RESERVED", "LOST", "DAMAGED", "MAINTENANCE"]).optional(),
    location: z.string().trim().max(80).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export const issueSchema = z.object({
  studentNo: z.string().trim().min(1).max(20),
  copyId: uuidSchema,
  loanDays: z.number().int().min(1).max(90).default(14),
});

export const idParamsSchema = z.object({
  id: uuidSchema,
});

export const returnSchema = z.object({
  loanId: uuidSchema,
});

export const adminReservationQuerySchema = z.object({
  status: z.enum(["WAITING", "READY", "FULFILLED", "CANCELLED", "EXPIRED"]).optional(),
  bookId: uuidSchema.optional(),
});

export const loanListQuerySchema = z.object({
  status: z.enum(["ACTIVE", "RETURNED", "OVERDUE"]).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const reservationListQuerySchema = z.object({
  status: z.enum(["WAITING", "READY", "FULFILLED", "CANCELLED", "EXPIRED"]).optional(),
});

export type BookListQuery = z.infer<typeof bookListQuerySchema>;
export type CreateBookInput = z.infer<typeof createBookSchema>;
