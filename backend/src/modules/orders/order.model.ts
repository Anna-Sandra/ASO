import mongoose, { Schema } from "mongoose";

export type OrderStatus =
  | "pending_payment"
  /** Buyer submitted off-platform payment details; stock not reduced until vendor(s) confirm receipt. */
  | "awaiting_vendor_payment"
  | "paid"
  | "processing"
  | "sent_for_delivery"
  | "delivered"
  | "cancelled";

export interface OrderLineItem {
  productId: mongoose.Types.ObjectId;
  sellerId: mongoose.Types.ObjectId;
  name: string;
  quantity: number;
  unitPrice: number;
  /** Buyer-paid line gross = unitPrice × quantity (stored implicitly; also derivable). */
  platformFee: number;
  sellerProceeds: number;
}

export interface OrderMessage {
  senderId: mongoose.Types.ObjectId;
  senderRole: "buyer" | "seller";
  text: string;
  createdAt: Date;
}

export interface OrderPaymentDetails {
  /** Mobile money payer phone (MoMo). */
  momoPhone?: string;
  momoAmount?: number;
  /** Bank/card manual: never store full PAN or CVV. */
  cardLast4?: string;
  cardholderName?: string;
  cardExpiry?: string;
}

export interface OrderDoc {
  _id: mongoose.Types.ObjectId;
  buyerId: mongoose.Types.ObjectId;
  items: OrderLineItem[];
  currency: string;
  subtotal: number;
  total: number;
  status: OrderStatus;
  paymentMethod?: "stripe" | "momo" | "bank" | null;
  paymentReference?: string | null;
  paymentDetails?: OrderPaymentDetails | null;
  stripeCheckoutSessionId?: string | null;
  /** Sellers who confirmed they received this order’s off-platform payment (MoMo/bank). When all unique line sellers are listed, order becomes `paid`. */
  confirmedSellerIds?: mongoose.Types.ObjectId[];
  messages: OrderMessage[];
  /** Admin moderation: buyer/seller dispute flag. */
  disputeOpen?: boolean;
  adminNote?: string;
  refundStatus?: "none" | "requested" | "refunded";
  createdAt: Date;
  updatedAt: Date;
}

const lineItemSchema = new Schema<OrderLineItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    platformFee: { type: Number, required: true, min: 0, default: 0 },
    sellerProceeds: { type: Number, required: true, min: 0, default: 0 }
  },
  { _id: false }
);

const orderSchema = new Schema<OrderDoc>(
  {
    buyerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    items: { type: [lineItemSchema], required: true },
    currency: { type: String, default: "ghs" },
    subtotal: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: [
        "pending_payment",
        "awaiting_vendor_payment",
        "paid",
        "processing",
        "sent_for_delivery",
        "delivered",
        "cancelled"
      ],
      default: "pending_payment"
    },
    confirmedSellerIds: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      default: []
    },
    paymentMethod: { type: String, enum: ["stripe", "momo", "bank"], default: null },
    paymentReference: { type: String, default: null },
    paymentDetails: {
      type: {
        momoPhone: { type: String },
        momoAmount: { type: Number },
        cardLast4: { type: String },
        cardholderName: { type: String },
        cardExpiry: { type: String }
      },
      default: null,
      _id: false
    },
    stripeCheckoutSessionId: { type: String, default: null },
    messages: {
      type: [
        new Schema<OrderMessage>(
          {
            senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
            senderRole: { type: String, enum: ["buyer", "seller"], required: true },
            text: { type: String, required: true, trim: true, maxlength: 1000 },
            createdAt: { type: Date, default: Date.now }
          },
          { _id: false }
        )
      ],
      default: []
    },
    disputeOpen: { type: Boolean, default: false, index: true },
    adminNote: { type: String, default: "", maxlength: 4000 },
    refundStatus: { type: String, enum: ["none", "requested", "refunded"], default: "none" }
  },
  { timestamps: true }
);

orderSchema.index({ "items.sellerId": 1, status: 1 });

export const Order = mongoose.model<OrderDoc>("Order", orderSchema);
