import type { HydratedDocument } from "mongoose";
import { sha256 } from "../auth/jwt";
import { User } from "../auth/user.model";
import type { OrderDoc } from "../orders/order.model";
import { sendEmail } from "../../utils/mailer";
import { logOtpToConsole } from "../../utils/otpLog";
import { sendSms } from "../../utils/sms";
import type { DeliveryDoc } from "./delivery.model";

const DELIVERY_OTP_TTL_MS = 30 * 60 * 1000;

function sixDigitOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function resolveOrderBuyerContact(order: HydratedDocument<OrderDoc>): Promise<{
  email: string;
  phone: string;
  displayName: string;
}> {
  const guest = order.guestContact;
  if (guest?.email || guest?.phone) {
    return {
      email: String(guest.email || "").trim().toLowerCase(),
      phone: String(guest.phone || "").trim(),
      displayName: String(guest.displayName || "Customer").trim() || "Customer"
    };
  }
  if (order.buyerId) {
    const buyer = await User.findById(order.buyerId).select("email phone displayName").lean();
    if (buyer) {
      return {
        email: String(buyer.email || "").trim().toLowerCase(),
        phone: String(buyer.phone || "").trim(),
        displayName: String(buyer.displayName || "Customer").trim() || "Customer"
      };
    }
  }
  return { email: "", phone: "", displayName: "Customer" };
}

function deliveryOtpSmsBody(otp: string) {
  return (
    `SHOPIQGH delivery code: ${otp}. ` +
    `Do NOT share this code until you have your order in your hands. ` +
    `Only give it to the rider when you receive your items. Expires in 30 min.`
  );
}

function deliveryOtpEmailHtml(otp: string, displayName: string) {
  const name = displayName || "there";
  return `<p>Hi ${name},</p>
<p>Your delivery verification code is:</p>
<p style="font-size:24px;font-weight:bold;letter-spacing:6px">${otp}</p>
<p><strong>Do not share this code</strong> until you have your order in your hands. Only tell the rider when you receive your items.</p>
<p>This code expires in 30 minutes.</p>`;
}

/** Generate, store (hashed), and notify buyer — no image upload required. */
export async function sendDeliveryOtpToBuyer(
  order: HydratedDocument<OrderDoc>,
  delivery: HydratedDocument<DeliveryDoc>
): Promise<{ sent: boolean; channels: string[] }> {
  const otp = sixDigitOtp();
  delivery.deliveryOtpHash = sha256(otp);
  delivery.deliveryOtpExpiresAt = new Date(Date.now() + DELIVERY_OTP_TTL_MS);
  delivery.deliveryOtpSentAt = new Date();

  const contact = await resolveOrderBuyerContact(order);
  const channels: string[] = [];

  if (contact.phone) {
    try {
      await sendSms(contact.phone, deliveryOtpSmsBody(otp));
      channels.push("sms");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[delivery-otp] SMS failed:", err instanceof Error ? err.message : err);
    }
  }

  if (contact.email) {
    logOtpToConsole("delivery_confirm", contact.email, otp);
    try {
      await sendEmail(
        contact.email,
        "Your SHOPIQGH delivery code",
        deliveryOtpEmailHtml(otp, contact.displayName),
        { category: "delivery_otp" }
      );
      channels.push("email");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[delivery-otp] Email failed:", err instanceof Error ? err.message : err);
    }
  }

  return { sent: channels.length > 0, channels };
}

export function verifyDeliveryOtp(delivery: HydratedDocument<DeliveryDoc>, rawOtp: string): boolean {
  const code = String(rawOtp || "").trim();
  if (!/^\d{6}$/.test(code)) return false;
  const hash = String(delivery.deliveryOtpHash || "").trim();
  if (!hash) return false;
  const exp = delivery.deliveryOtpExpiresAt;
  if (!exp || exp.getTime() < Date.now()) return false;
  return sha256(code) === hash;
}

export function clearDeliveryOtp(delivery: HydratedDocument<DeliveryDoc>) {
  delivery.deliveryOtpHash = "";
  delivery.deliveryOtpExpiresAt = null;
}
