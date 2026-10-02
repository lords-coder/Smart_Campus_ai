import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { sendError } from "../utils/response";

interface PgLikeError {
  code?: string;
  constraint?: string;
  message?: string;
}

export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, 404, "NOT_FOUND", `Route ${req.method} ${req.originalUrl} not found`);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof ZodError) {
    sendError(
      res,
      400,
      "VALIDATION_ERROR",
      "Request validation failed",
      error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
    return;
  }

  if (error instanceof ApiError) {
    sendError(res, error.statusCode, error.code, error.message, error.details);
    return;
  }

  const parseError = error as Error & { status?: number; statusCode?: number; type?: string };
  if (parseError?.type === "entity.parse.failed" || (parseError?.name === "SyntaxError" && typeof parseError.status === "number" && parseError.status < 500)) {
    sendError(res, 400, "INVALID_JSON", "Request body must be valid JSON");
    return;
  }

  // body-parser failures (express.json) already carry their own 4xx status and
  // a `type` discriminator. Without this branch an oversized body falls through
  // to the generic 500 below, so a client-side problem is reported as a server
  // error and logged as unhandled.
  if (typeof parseError?.status === "number" && parseError.status >= 400 && parseError.status < 500) {
    const tooLarge = parseError.type === "entity.too.large";
    sendError(
      res,
      parseError.status,
      tooLarge ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST",
      tooLarge ? "Request body is too large" : "Invalid request body",
    );
    return;
  }

  const pgError = error as PgLikeError;
  if (pgError && typeof pgError.code === "string") {
    if (pgError.code === "23505") {
      sendError(res, 409, "DUPLICATE_RESOURCE", "A record with that information already exists");
      return;
    }
    if (pgError.code === "23503") {
      sendError(res, 409, "REFERENCE_ERROR", "Referenced record does not exist");
      return;
    }
    if (pgError.code.startsWith("22") || pgError.code.startsWith("23")) {
      sendError(res, 400, "DATABASE_CONSTRAINT_ERROR", "Invalid data provided");
      return;
    }
  }

  console.error("[api] Unhandled error:", error instanceof Error ? error.stack : error);
  sendError(
    res,
    500,
    "INTERNAL_SERVER_ERROR",
    env.isProduction ? "Something went wrong. Please try again." : String((error as Error)?.message ?? error),
  );
}
