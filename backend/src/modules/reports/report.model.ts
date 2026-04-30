import mongoose, { Schema } from "mongoose";

export type ReportCategory =
  | "item_not_delivered"
  | "wrong_item_received"
  | "fake_misleading_product"
  | "seller_not_responding"
  | "buyer_no_show"
  | "payment_not_confirmed"
  | "fraudulent_activity"
  | "abuse_misconduct"
  | "fake_seller"
  | "scam"
  | "bad_product"
  | "chat_abuse"
  | "other";
export type ReportStatus = "open" | "in_review" | "resolved" | "dismissed";
export type ReportPriority = "low" | "medium" | "high";

export interface ReportDoc {
  _id: mongoose.Types.ObjectId;
  reporterId: mongoose.Types.ObjectId;
  category: ReportCategory;
  description: string;
  /** e.g. product, user, order */
  targetType: "product" | "user" | "order" | "other";
  targetId?: string;
  status: ReportStatus;
  /** Triage priority. Auto-derived from category on create; admin can override. */
  priority: ReportPriority;
  adminNote: string;
  /** Up to 3 image URLs (see POST /api/uploads/report-evidence). */
  evidenceUrls: string[];
  resolvedAt?: Date | null;
  resolvedById?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Heuristic for triage when a report is created. */
export function defaultPriorityForCategory(category: ReportCategory): ReportPriority {
  if (
    category === "fraudulent_activity" ||
    category === "scam" ||
    category === "fake_seller" ||
    category === "abuse_misconduct" ||
    category === "chat_abuse"
  )
    return "high";
  if (
    category === "payment_not_confirmed" ||
    category === "item_not_delivered" ||
    category === "wrong_item_received" ||
    category === "fake_misleading_product" ||
    category === "seller_not_responding" ||
    category === "buyer_no_show" ||
    category === "bad_product"
  )
    return "medium";
  return "low";
}

const reportSchema = new Schema<ReportDoc>(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    category: {
      type: String,
      enum: [
        "item_not_delivered",
        "wrong_item_received",
        "fake_misleading_product",
        "seller_not_responding",
        "buyer_no_show",
        "payment_not_confirmed",
        "fraudulent_activity",
        "abuse_misconduct",
        "fake_seller",
        "scam",
        "bad_product",
        "chat_abuse",
        "other"
      ],
      required: true
    },
    description: { type: String, required: true, trim: true, maxlength: 4000 },
    targetType: { type: String, enum: ["product", "user", "order", "other"], required: true, default: "other" },
    targetId: { type: String, default: null, index: true },
    status: { type: String, enum: ["open", "in_review", "resolved", "dismissed"], default: "open", index: true },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium", index: true },
    adminNote: { type: String, default: "", maxlength: 4000 },
    evidenceUrls: { type: [String], default: () => [] },
    resolvedAt: { type: Date, default: null },
    resolvedById: { type: Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ priority: 1, status: 1, createdAt: -1 });

export const Report = mongoose.model<ReportDoc>("Report", reportSchema);
