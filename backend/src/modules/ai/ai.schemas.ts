import { z } from "zod";
import { env } from "../../config/env";

/**
 * The only client-supplied input. Identity fields (studentId, userId, role...)
 * are intentionally not part of the schema: unknown keys are stripped by Zod
 * and the caller always comes from the verified JWT.
 */
export const askSchema = z.object({
  message: z
    .string({ error: "Message must be a string" })
    .trim()
    .min(1, "Message cannot be empty")
    .max(env.ai.maxMessageLength, `Message must be at most ${env.ai.maxMessageLength} characters`),
});

export type AskInput = z.infer<typeof askSchema>;
