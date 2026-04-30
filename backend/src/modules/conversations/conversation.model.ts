import mongoose, { Schema } from "mongoose";

export interface ConversationMessage {
  senderId: mongoose.Types.ObjectId;
  senderRole: "buyer" | "seller" | "admin";
  text: string;
  createdAt: Date;
}

export interface ConversationDoc {
  _id: mongoose.Types.ObjectId;
  /** `order` = messaging between buyer & seller for an order; `support` = customer (buyerId) ↔ primary admin (sellerId). */
  kind: "order" | "support";
  buyerId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  messages: ConversationMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<ConversationMessage>(
  {
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    senderRole: { type: String, enum: ["buyer", "seller", "admin"], required: true },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const conversationSchema = new Schema<ConversationDoc>(
  {
    kind: { type: String, enum: ["order", "support"], default: "order", index: true },
    buyerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    messages: { type: [messageSchema], default: [] }
  },
  { timestamps: true }
);

conversationSchema.index({ buyerId: 1, sellerId: 1, kind: 1 }, { unique: true });

export const Conversation = mongoose.model<ConversationDoc>("Conversation", conversationSchema);
