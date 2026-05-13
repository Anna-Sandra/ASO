import mongoose, { Schema } from "mongoose";

export interface RiderProfileDoc {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  vehicleType: string;
  /** Public URL (`/uploads/...`) */
  photoUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const riderProfileSchema = new Schema<RiderProfileDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    vehicleType: { type: String, required: true, trim: true, maxlength: 80 },
    photoUrl: { type: String, default: "", trim: true }
  },
  { timestamps: true }
);

export const RiderProfile = mongoose.model<RiderProfileDoc>("RiderProfile", riderProfileSchema);
