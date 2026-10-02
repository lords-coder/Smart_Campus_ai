import { NextFunction, Request, RequestHandler, Response } from "express";
import { queryOne } from "../config/db";
import { ApiError } from "../utils/ApiError";
import { verifyToken } from "../utils/jwt";
import { Role } from "../utils/roles";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
}

function extractBearerToken(req: Request): string | null {
  const header = req.header("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

/**
 * Verifies the JWT and loads the user from the database so that role changes,
 * deleted accounts, and status changes take effect immediately.
 */
export const requireAuth: RequestHandler = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      throw ApiError.unauthorized("Missing access token");
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw ApiError.unauthorized("Invalid or expired token", "INVALID_TOKEN");
    }

    const user = await queryOne<UserRow>(
      "SELECT id, name, email, role, status FROM users WHERE id = $1",
      [payload.sub],
    );
    if (!user) {
      throw ApiError.unauthorized("Account no longer exists", "INVALID_TOKEN");
    }

    if (user.status !== "ACTIVE") {
      throw ApiError.unauthorized("Account is not active", "ACCOUNT_DISABLED");
    }

    req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Role gate. Must be mounted after requireAuth.
 * SUPER_ADMIN is implicitly allowed wherever ADMIN is allowed (full admin privileges).
 */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return next(ApiError.unauthorized());
    }

    const isSuperAdmin = user.role === "SUPER_ADMIN";
    const allowed = isSuperAdmin && roles.includes("ADMIN") ? true : roles.includes(user.role);

    if (!allowed) {
      return next(
        ApiError.forbidden(`Role ${user.role} is not allowed to access this resource`),
      );
    }
    next();
  };
}