import mongoose, { Schema } from "mongoose";

export type ReportCategory = "fake_seller" | "scam" | "bad_product" | "chat_abuse" | "other";
export type ReportStatus = "open" | "in_review" | "resolved" | "dismissed";

export interface ReportDoc {
  _id: mongoose.Types.ObjectId;
  reporterId: mongoose.Types.ObjectId;
  category: ReportCategory;
  description: string;
  /** e.g. product, user, order */
  targetType: "product" | "user" | "order" | "other";
  targetId?: string;
  status: ReportStatus;
  adminNote: string;
  resolvedAt?: Date | null;
  resolvedById?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const reportSchema = new Schema<ReportDoc>(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    category: {
      type: String,
      enum: ["fake_seller", "scam", "bad_product", "chat_abuse", "other"],
      required: true
    },
    description: { type: String, required: true, trim: true, maxlength: 4000 },
    targetType: { type: String, enum: ["product", "user", "order", "other"], required: true, default: "other" },
    targetId: { type: String, default: null, index: true },
    status: { type: String, enum: ["open", "in_review", "resolved", "dismissed"], default: "open", index: true },
    adminNote: { type: String, default: "", maxlength: 4000 },
    resolvedAt: { type: Date, default: null },
    resolvedById: { type: Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);

reportSchema.index({ status: 1, createdAt: -1 });

export const Report = mongoose.model<ReportDoc>("Report", reportSchema);
