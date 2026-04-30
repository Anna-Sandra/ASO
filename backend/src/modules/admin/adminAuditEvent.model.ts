import mongoose, { Schema } from "mongoose";

export interface AdminAuditEventDoc {
  _id: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  action: string;
  title: string;
  detail: string;
  createdAt: Date;
  updatedAt: Date;
}

const adminAuditEventSchema = new Schema<AdminAuditEventDoc>(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    action: { type: String, required: true, trim: true, maxlength: 80, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    detail: { type: String, default: "", trim: true, maxlength: 500 }
  },
  { timestamps: true }
);

adminAuditEventSchema.index({ createdAt: -1 });

export const AdminAuditEvent = mongoose.model<AdminAuditEventDoc>("AdminAuditEvent", adminAuditEventSchema);

/** Best-effort record for System logs; never throws to callers. */
export async function recordAdminAuditEvent(params: {
  actorId: string | undefined;
  action: string;
  title: string;
  detail?: string;
}): Promise<void> {
  const actorId = params.actorId;
  if (!actorId || !mongoose.isValidObjectId(actorId)) return;
  try {
    await AdminAuditEvent.create({
      actorId: new mongoose.Types.ObjectId(actorId),
      action: params.action.slice(0, 80),
      title: params.title.slice(0, 200),
      detail: (params.detail || "").slice(0, 500)
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[admin-audit] record failed:", err);
  }
}
