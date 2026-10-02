import { clearToken, getToken } from "./auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Broadcast whenever the backend rejects the current token. */
export const UNAUTHORIZED_EVENT = "smartcampus:unauthorized";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: { code: string; message: string; details?: unknown };
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
  /** Abort the request after this many milliseconds (used by the AI chat). */
  timeoutMs?: number;
}

/**
 * Single API client for the whole app. Returns the `data` payload of the
 * backend envelope and throws ApiError for any non-2xx or malformed response.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, timeoutMs } = options;
  const token = options.token !== undefined ? options.token : getToken();

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: controller?.signal,
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw new ApiError(0, "TIMEOUT", "The request timed out. Please try again.");
    }
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the server. Check your connection.");
  } finally {
    if (timer) clearTimeout(timer);
  }

  let payload: Envelope<T> | null = null;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    throw new ApiError(response.status, "INVALID_RESPONSE", "The server returned an unreadable response.");
  }

  if (!response.ok || !payload.success) {
    if (response.status === 401 && token) {
      clearToken();
      if (typeof window !== "undefined") {
        // AuthProvider listens for this and flips the app to the signed-out state.
        window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      }
    }
    throw new ApiError(
      response.status,
      payload.error?.code ?? "REQUEST_FAILED",
      payload.error?.message ?? payload.message ?? "Request failed",
      payload.error?.details,
    );
  }

  return payload.data as T;
}

export const apiErrorMessage = (error: unknown): string =>
  error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
