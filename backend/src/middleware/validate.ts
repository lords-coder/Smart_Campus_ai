import { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodType } from "zod";

/**
 * Central request validation. Usage:
 *   router.post("/login", validate(loginSchema), controller.login)
 * Validated data replaces req.body so controllers can trust their input.
 */
export function validate(schema: ZodType, source: "body" | "query" | "params" = "body"): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(result.error);
    }
    if (source === "body") {
      req.body = result.data;
    } else if (source === "query") {
      (req as Request & { validatedQuery: unknown }).validatedQuery = result.data;
    }
    next();
  };
}
