import { z } from "zod";

const SPECIAL_CHARS = /[^A-Za-z0-9]/;

export const strongPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(72, "Password must be at most 72 characters")
  .regex(/[A-Z]/, "Password must include at least 1 uppercase letter")
  .regex(/[0-9]/, "Password must include at least 1 number")
  .regex(SPECIAL_CHARS, "Password must include at least 1 special character");

// Legacy schema used by parent activation (kept for compatibility)
export const passwordSchema = strongPasswordSchema;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254);

export const universityEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254);

const baseRegistrationFields = z.object({
  email: emailSchema,
  password: strongPasswordSchema,
  confirmPassword: z.string().min(1, "Please confirm your password"),
  firstName: z.string().trim().min(1, "First name is required").max(60),
  lastName: z.string().trim().min(1, "Last name is required").max(60),
  phone: z.string().trim().min(10, "Phone number must be at least 10 digits").max(20),
});

export const studentRegistrationSchema = baseRegistrationFields.extend({
  role: z.literal("STUDENT"),
  studentNo: z.string().trim().min(1, "Student number is required").max(30),
  department: z.string().trim().min(1, "Department is required").max(100),
  semester: z.coerce.number().int().min(1).max(12),
  section: z.string().trim().min(1, "Section is required").max(10),
  batchYear: z.coerce.number().int().min(1950).max(2100),
});

export const facultyRegistrationSchema = baseRegistrationFields.extend({
  role: z.literal("FACULTY"),
  code: z.string().trim().min(1, "Faculty verification code is required"),
  employeeNo: z.string().trim().min(1, "Employee number is required").max(30),
  department: z.string().trim().min(1, "Department is required").max(100),
  designation: z.string().trim().min(1, "Designation is required").max(100),
});

export const adminRegistrationSchema = baseRegistrationFields.extend({
  role: z.literal("ADMIN"),
  code: z.string().trim().min(1, "Admin verification code is required"),
  department: z.string().trim().min(1, "Department is required").max(100),
  jobTitle: z.string().trim().min(1, "Job title is required").max(100),
});

export const registerSchema = z.discriminatedUnion("role", [
  studentRegistrationSchema,
  facultyRegistrationSchema,
  adminRegistrationSchema,
]).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(72),
});

export const passwordHelpSchema = z.object({
  email: emailSchema,
  role: z.enum(["STUDENT", "FACULTY", "ADMIN", "PARENT", "ALUMNI", "SUPER_ADMIN"]).optional(),
  message: z.string().max(2000).optional(),
  contact: z.string().max(200).optional(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: strongPasswordSchema,
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PasswordHelpInput = z.infer<typeof passwordHelpSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;