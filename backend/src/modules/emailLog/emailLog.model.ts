import mongoose, { Schema } from "mongoose";

export interface EmailLogDoc {
  _id: mongoose.Types.ObjectId;
  to: string;
  subject: string;
  category: string;
  status: "sent" | "failed" | "skipped";
  errorMessage?: string;
  createdAt: Date;
}

const emailLogSchema = new Schema<EmailLogDoc>(
  {
    to: { type: String, required: true, maxlength: 320 },
    subject: { type: String, required: true, maxlength: 500 },
    category: { type: String, default: "general", maxlength: 80 },
    status: { type: String, enum: ["sent", "failed", "skipped"], required: true },
    errorMessage: { type: String, maxlength: 2000 }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

emailLogSchema.index({ createdAt: -1 });
/** Drop rows after 45 days to cap collection growth. */
emailLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 45 });

export const EmailLog = mongoose.model<EmailLogDoc>("EmailLog", emailLogSchema);
