import mongoose, { Schema } from "mongoose";

export type CourierApplicationStatus = "pending" | "approved" | "rejected";

export interface CourierApplicationDoc {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  fullName: string;
  email: string;
  phone: string;
  vehicleType: string;
  notes: string;
  idDocUrl: string;
  status: CourierApplicationStatus;
  adminNote: string;
  reviewedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const courierApplicationSchema = new Schema<CourierApplicationDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    phone: { type: String, required: true, trim: true, maxlength: 40 },
    vehicleType: { type: String, required: true, trim: true, maxlength: 80 },
    notes: { type: String, required: true, trim: true, maxlength: 800 },
    idDocUrl: { type: String, default: "", trim: true, maxlength: 500 },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true
    },
    adminNote: { type: String, default: "", maxlength: 2000 },
    reviewedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

courierApplicationSchema.index({ userId: 1, status: 1 });

export const CourierApplication = mongoose.model<CourierApplicationDoc>("CourierApplication", courierApplicationSchema);
