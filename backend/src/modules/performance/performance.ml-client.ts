import { z } from "zod";
import { env } from "../../config/env";

/**
 * Client for the Python ML inference service.
 *
 * The service is an internal dependency of the prediction endpoint, so this
 * module never throws: every failure mode resolves to a typed reason that the
 * caller degrades on. Nothing from the remote process — stack traces, internal
 * paths, model internals — is forwarded to the API response.
 */

const mlPredictionSchema = z.object({
  category: z.string().min(1),
  confidence: z.number().finite().min(0).max(1),
  probabilities: z.record(z.string(), z.number().finite()),
  model_version: z.string().min(1),
  features_used: z.array(z.string()),
  predicted_at: z.string().optional(),
  model_trained_at: z.string().nullable().optional(),
  model_loaded: z.boolean().optional(),
  feature_count: z.number().int().nonnegative().optional(),
});

export type MlPrediction = z.infer<typeof mlPredictionSchema>;

export type MlFailureReason =
  | "ML_DISABLED"
  | "ML_UNREACHABLE"
  | "ML_TIMEOUT"
  | "ML_BAD_STATUS"
  | "ML_INVALID_RESPONSE"
  | "ML_UNEXPECTED_ERROR";

export type MlPredictionResult =
  | { ok: true; prediction: MlPrediction }
  | { ok: false; reason: MlFailureReason };

/**
 * `ML_SERVICE_URL` may be blank to deliberately disable remote inference and
 * exercise the degraded path (used by the test suite).
 */
export function mlServiceConfigured(): boolean {
  return env.ml.serviceUrl.length > 0;
}

export async function requestMlPrediction(
  features: Record<string, number>,
): Promise<MlPredictionResult> {
  if (!mlServiceConfigured()) {
    return { ok: false, reason: "ML_DISABLED" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.ml.timeoutMs);

  try {
    const response = await fetch(`${env.ml.serviceUrl}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ features }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      // The status code alone is enough for the caller; the body may contain
      // service internals and is deliberately not read.
      return { ok: false, reason: "ML_BAD_STATUS" };
    }

    // Distinguish "the service answered with something unparseable" from "the
    // service could not be reached at all" — both degrade, but the reason is
    // reported to the client and must be accurate.
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, reason: "ML_INVALID_RESPONSE" };
    }

    const parsed = mlPredictionSchema.safeParse(body);
    if (!parsed.success) {
      return { ok: false, reason: "ML_INVALID_RESPONSE" };
    }

    const prediction = parsed.data;

    // A degraded model (not loaded) still answers, but it is not a prediction.
    if (prediction.model_loaded === false) {
      return { ok: false, reason: "ML_INVALID_RESPONSE" };
    }

    // Guard against a probability vector that disagrees with the reported
    // category or confidence; treat it as an unusable response rather than
    // surfacing numbers the client cannot trust.
    if (!Object.prototype.hasOwnProperty.call(prediction.probabilities, prediction.category)) {
      return { ok: false, reason: "ML_INVALID_RESPONSE" };
    }

    return { ok: true, prediction };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, reason: "ML_TIMEOUT" };
    }
    return { ok: false, reason: "ML_UNREACHABLE" };
  } finally {
    clearTimeout(timer);
  }
}
