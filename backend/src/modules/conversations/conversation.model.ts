import mongoose, { Schema } from "mongoose";

export interface ConversationMessage {
  senderId: mongoose.Types.ObjectId;
  senderRole: "buyer" | "seller";
  text: string;
  createdAt: Date;
}

export interface ConversationDoc {
  _id: mongoose.Types.ObjectId;
  buyerId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  messages: ConversationMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<ConversationMessage>(
  {
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    senderRole: { type: String, enum: ["buyer", "seller"], required: true },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const conversationSchema = new Schema<ConversationDoc>(
  {
    buyerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    messages: { type: [messageSchema], default: [] }
  },
  { timestamps: true }
);

conversationSchema.index({ buyerId: 1, sellerId: 1 }, { unique: true });

export const Conversation = mongoose.model<ConversationDoc>("Conversation", conversationSchema);
