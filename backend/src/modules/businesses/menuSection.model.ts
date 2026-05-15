import mongoose, { Schema } from "mongoose";

export interface MenuSectionDoc {
  _id: mongoose.Types.ObjectId;
  businessId: mongoose.Types.ObjectId;
  title: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const menuSectionSchema = new Schema<MenuSectionDoc>(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 80 },
    sortOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
);

menuSectionSchema.index({ businessId: 1, sortOrder: 1 });

export const MenuSection = mongoose.model<MenuSectionDoc>("MenuSection", menuSectionSchema);
