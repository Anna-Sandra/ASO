import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler";
import { HttpError } from "../../utils/httpError";
import { Report } from "./report.model";
import { createReportSchema } from "./report.schemas";

export const createReport = asyncHandler(async (req: Request, res: Response) => {
  const body = createReportSchema.parse(req.body);
  const reporterId = new mongoose.Types.ObjectId(req.user!.id);
  const r = await Report.create({
    reporterId,
    category: body.category,
    description: body.description,
    targetType: body.targetType,
    targetId: body.targetId || undefined
  });
  res.status(201).json({ report: { id: r._id.toString(), status: r.status, createdAt: r.createdAt } });
});
