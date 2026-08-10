import mongoose, { Schema } from "mongoose";

export interface ConversationMessage {
  senderId: mongoose.Types.ObjectId;
  senderRole: "buyer" | "seller" | "admin" | "rider";
  text: string;
  createdAt: Date;
}

export interface ConversationDoc {
  _id: mongoose.Types.ObjectId;
  /**
   * `order` / `listing` = buyer ↔ seller;
   * `support` = any user ↔ admin (user stored as buyerId);
   * `delivery` = rider ↔ buyer (sellerId = rider) or rider ↔ vendor (buyerId = rider).
   */
  kind: "order" | "listing" | "support" | "delivery";
  buyerId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  /** Set when thread opened from a product page (listing kind). */
  productId?: mongoose.Types.ObjectId;
  listingProductName?: string;
  messages: ConversationMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<ConversationMessage>(
  {
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    senderRole: { type: String, enum: ["buyer", "seller", "admin", "rider"], required: true },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const conversationSchema = new Schema<ConversationDoc>(
  {
    kind: { type: String, enum: ["order", "listing", "support", "delivery"], default: "order", index: true },
    buyerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", index: true },
    listingProductName: { type: String, trim: true, maxlength: 160 },
    messages: { type: [messageSchema], default: [] }
  },
  { timestamps: true }
);

conversationSchema.index({ buyerId: 1, sellerId: 1, kind: 1 }, { unique: true });

export const Conversation = mongoose.model<ConversationDoc>("Conversation", conversationSchema);
