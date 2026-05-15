import mongoose, { Schema } from "mongoose";

export type ServiceInquiryStatus = "pending" | "read" | "archived";

export interface ServiceInquiryDoc {
  _id: mongoose.Types.ObjectId;
  buyerId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  productName: string;
  message: string;
  preferredTime: string;
  status: ServiceInquiryStatus;
  createdAt: Date;
  updatedAt: Date;
}

const serviceInquirySchema = new Schema<ServiceInquiryDoc>(
  {
    buyerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    productName: { type: String, required: true, trim: true, maxlength: 220 },
    message: { type: String, required: true, trim: true, maxlength: 4000 },
    preferredTime: { type: String, default: "", maxlength: 500 },
    status: {
      type: String,
      enum: ["pending", "read", "archived"],
      default: "pending",
      index: true
    }
  },
  { timestamps: true }
);

serviceInquirySchema.index({ sellerId: 1, createdAt: -1 });
serviceInquirySchema.index({ buyerId: 1, createdAt: -1 });

export const ServiceInquiry = mongoose.model<ServiceInquiryDoc>("ServiceInquiry", serviceInquirySchema);
