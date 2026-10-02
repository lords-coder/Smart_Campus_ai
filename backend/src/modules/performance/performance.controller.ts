import { Request, Response } from "express";
import { ApiError } from "../../utils/ApiError";
import { sendSuccess } from "../../utils/response";
import * as performanceService from "./performance.service";

export async function getMyPerformance(req: Request, res: Response) {
  const studentId = req.user!.id;
  const features = await performanceService.getStudentPerformanceFeatures(studentId);
  return sendSuccess(res, features, "Student performance features retrieved");
}

export async function getMyPrediction(req: Request, res: Response) {
  const studentId = req.user!.id;
  const prediction = await performanceService.predictPerformance(studentId);
  return sendSuccess(res, prediction, "Performance prediction retrieved");
}