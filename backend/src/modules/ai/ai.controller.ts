import { Request, Response } from "express";
import { ApiError } from "../../utils/ApiError";
import { sendSuccess } from "../../utils/response";
import type { AskInput } from "./ai.schemas";
import * as aiService from "./ai.service";

/**
 * Thin controller: identity comes from `req.user` (set by requireAuth after
 * JWT verification) and the message comes from the validated body.
 */
export async function ask(req: Request, res: Response) {
  const user = req.user;
  if (!user) throw ApiError.unauthorized();

  const { message } = req.body as AskInput;
  const data = await aiService.ask(user, message);
  return sendSuccess(res, data, "AI response generated");
}
