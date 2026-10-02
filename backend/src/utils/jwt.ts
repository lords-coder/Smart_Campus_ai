import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { Role } from "./roles";

export interface TokenPayload {
  sub: string;
  role: Role;
  email: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
    issuer: "smartcampus-ai",
  } as jwt.SignOptions);
}

export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, env.jwtSecret, { issuer: "smartcampus-ai" }) as jwt.JwtPayload;
  if (!decoded || typeof decoded.sub !== "string" || typeof decoded.role !== "string") {
    throw new Error("Malformed token payload");
  }
  return {
    sub: decoded.sub,
    role: decoded.role as Role,
    email: String(decoded.email ?? ""),
  };
}
