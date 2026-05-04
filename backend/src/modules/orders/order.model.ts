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
  /** Line list subtotal = unitPrice × quantity (vendor’s intended proceeds). */
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
  /**
   * 1 = legacy (buyer’s `total` equals listing subtotal; commission taken from seller share).
   * 2 = fees on top (buyer pays subtotal + service + Paystack processing; seller nets list price per line).
   */
  pricingVersion?: number;
  /** Buyer-paid Paystack / processing margin (GHS), included in `total`. Only set for pricingVersion ≥ 2. */
  processingFeeTotal?: number;
  status: OrderStatus;
  paymentMethod?: "stripe" | "momo" | "bank" | "paystack" | null;
  paymentReference?: string | null;
  paymentDetails?: OrderPaymentDetails | null;
  stripeCheckoutSessionId?: string | null;
  /** When true, this order’s Paystack charge used split/subaccount at initialize — do not run transfer payouts. */
  paystackUsedCheckoutSplit?: boolean;
  /** Paystack transaction reference from /transaction/initialize (webhook matches this). */
  paystackReference?: string | null;
  /** Paystack’s numeric transaction id from /transaction/verify (used for refunds API). */
  paystackTransactionId?: number | null;
  /** After online payment, automatic vendor bank transfers (Paystack Transfers) status. */
  paystackPayoutStatus?: "none" | "in_progress" | "complete" | "partial" | "skipped";
  paystackPayouts?: {
    sellerId: mongoose.Types.ObjectId;
    amountGross: number;
    transferId?: string;
    reference?: string;
    status: "ok" | "skipped_no_recipient" | "error";
    message?: string;
  }[];
  /** Sellers who confirmed they received this order’s off-platform payment (MoMo/bank). When all unique line sellers are listed, order becomes `paid`. */
  confirmedSellerIds?: mongoose.Types.ObjectId[];
  messages: OrderMessage[];
  /** Admin moderation: buyer/seller dispute flag. */
  disputeOpen?: boolean;
  adminNote?: string;
  /**
   * Refund tracking. `refunded` is only set after Paystack reports refund `processed`.
   * `refund_processing` = refund initiated with Paystack, settlement pending.
   */
  refundStatus?: "none" | "requested" | "refund_processing" | "refunded";
  paystackRefundId?: number | null;
  paystackRefundRemoteStatus?: string;
  refundStockRestored?: boolean;
  /** Timestamp when admin confirmed receipt of payment (for orders paid via Paystack). */
  adminPaymentConfirmedAt?: Date | null;
  /** Paystack settlement status: pending (funds held), settled (in admin account), or failed. */
  paystackSettlementStatus?: "pending" | "settled" | "failed" | null;
  /** Estimated or actual settlement date from Paystack (typically T+2 in Ghana). */
  paystackSettlementDate?: Date | null;
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
    pricingVersion: { type: Number, min: 1, max: 2, default: 1 },
    processingFeeTotal: { type: Number, min: 0, default: 0 },
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
    paymentMethod: { type: String, enum: ["stripe", "momo", "bank", "paystack"], default: null },
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
    paystackUsedCheckoutSplit: { type: Boolean, default: false },
    paystackReference: { type: String, default: null, index: true },
    paystackTransactionId: { type: Number, default: null },
    paystackPayoutStatus: {
      type: String,
      enum: ["none", "in_progress", "complete", "partial", "skipped"],
      default: "none"
    },
    paystackPayouts: {
      type: [
        {
          sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
          amountGross: { type: Number, required: true },
          transferId: { type: String, default: "" },
          reference: { type: String, default: "" },
          status: { type: String, enum: ["ok", "skipped_no_recipient", "error"], required: true },
          message: { type: String, default: "" }
        }
      ],
      default: []
    },
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
    refundStatus: {
      type: String,
      enum: ["none", "requested", "refund_processing", "refunded"],
      default: "none"
    },
    paystackRefundId: { type: Number, default: null },
    paystackRefundRemoteStatus: { type: String, default: "" },
    refundStockRestored: { type: Boolean, default: false },
    adminPaymentConfirmedAt: { type: Date, default: null },
    paystackSettlementStatus: {
      type: String,
      enum: ["pending", "settled", "failed"],
      default: null
    },
    paystackSettlementDate: { type: Date, default: null }
  },
  { timestamps: true }
);

orderSchema.index({ "items.sellerId": 1, status: 1 });

export const Order = mongoose.model<OrderDoc>("Order", orderSchema);
