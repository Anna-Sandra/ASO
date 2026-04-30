import type { Request, Response } from "express";
import mongoose from "mongoose";
import { asyncHandler } from "../../utils/asyncHandler";
import { defaultPriorityForCategory, Report } from "./report.model";
import { createReportSchema, myReportsQuerySchema } from "./report.schemas";

export const createReport = asyncHandler(async (req: Request, res: Response) => {
  const body = createReportSchema.parse(req.body);
  const reporterId = new mongoose.Types.ObjectId(req.user!.id);
  const evidence = (body.evidenceUrls && body.evidenceUrls.length ? body.evidenceUrls : []).slice(0, 3);
  const r = await Report.create({
    reporterId,
    category: body.category,
    description: body.description,
    targetType: body.targetType,
    targetId: body.targetId || undefined,
    priority: defaultPriorityForCategory(body.category),
    evidenceUrls: evidence
  });
  res.status(201).json({
    report: { id: r._id.toString(), status: r.status, priority: r.priority, createdAt: r.createdAt }
  });
});

export const listMyReports = asyncHandler(async (req: Request, res: Response) => {
  const q = myReportsQuerySchema.parse(req.query);
  const reporterId = new mongoose.Types.ObjectId(req.user!.id);
  const skip = (q.page - 1) * q.limit;
  const filter = { reporterId };
  const [rows, total] = await Promise.all([
    Report.find(filter).sort({ createdAt: -1 }).skip(skip).limit(q.limit).lean(),
    Report.countDocuments(filter)
  ]);
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.json({
    reports: rows.map((r) => ({
      id: r._id.toString(),
      category: r.category,
      description: r.description,
      targetType: r.targetType,
      targetId: r.targetId,
      status: r.status,
      priority: r.priority || "medium",
      adminNote: r.adminNote || "",
      evidenceUrls: Array.isArray(r.evidenceUrls) ? r.evidenceUrls : [],
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt
    })),
    total,
    page: q.page,
    limit: q.limit
  });
});
