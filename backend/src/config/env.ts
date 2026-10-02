import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const missing: string[] = [];

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    missing.push(name);
    return "";
  }
  return value;
}

const databaseUrl = required("DATABASE_URL");
const jwtSecret = required("JWT_SECRET");
const universityEmailDomain = required("UNIVERSITY_EMAIL_DOMAIN");
const adminRegistrationCode = required("ADMIN_REGISTRATION_CODE");
const facultyRegistrationCode = required("FACULTY_REGISTRATION_CODE");
const superAdminEmail = required("SUPER_ADMIN_EMAIL");
const superAdminPassword = required("SUPER_ADMIN_PASSWORD");

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(", ")}. ` +
      `Copy backend/.env.example to backend/.env and fill in the values.`,
  );
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const nodeEnv = process.env.NODE_ENV ?? "development";

export const env = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl,
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1d",
  corsOrigin: process.env.FRONTEND_URL ?? "http://localhost:3000",
  /** Used to build the reset-password link handed to a password-help requester. */
  frontendUrl: (process.env.FRONTEND_URL ?? "http://localhost:3000").trim().replace(/\/+$/, ""),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 10),

  // Registration system
  universityEmailDomain,
  adminRegistrationCode,
  facultyRegistrationCode,
  superAdminEmail,
  superAdminPassword,
  authRateLimitMax: optionalNumber("AUTH_RATE_LIMIT_MAX", 1000),
  authRateLimitWindowMs: optionalNumber("AUTH_RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000),

  // Phase 4 AI assistant. Secrets stay on the server; the frontend only ever
  // sees generated answers through /api/ai/ask.
  ai: {
    /** "auto" resolves to openai when a key exists, otherwise the deterministic mock. */
    provider: (process.env.AI_PROVIDER ?? "auto").trim().toLowerCase(),
    apiKey: (process.env.OPENAI_API_KEY ?? "").trim(),
    model: (process.env.AI_MODEL ?? "gpt-4o-mini").trim(),
    timeoutMs: optionalNumber("AI_TIMEOUT_MS", 12_000),
    maxTokens: optionalNumber("AI_MAX_TOKENS", 400),
    maxMessageLength: optionalNumber("AI_MAX_MESSAGE_LENGTH", 1_000),
    rateLimitMax: optionalNumber("AI_RATE_LIMIT_MAX", 30),
    rateLimitWindowMs: optionalNumber("AI_RATE_LIMIT_WINDOW_MS", 60_000),
  },

  // Phase 5 ML inference service. The backend is the only caller; the browser
  // never contacts this. Inside Docker Compose use the service name
  // (http://ml-service:8001); for a backend running on the host the default
  // below reaches the published port.
  ml: {
    serviceUrl: (process.env.ML_SERVICE_URL ?? "http://localhost:8001").trim().replace(/\/+$/, ""),
    timeoutMs: optionalNumber("ML_TIMEOUT_MS", 5_000),
  },
};
