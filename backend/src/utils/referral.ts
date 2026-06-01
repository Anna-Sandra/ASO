import crypto from "node:crypto";

const REFERRAL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Human-friendly invite code (8 chars). */
export function generateReferralCode(): string {
  const bytes = crypto.randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    out += REFERRAL_ALPHABET[bytes[i]! % REFERRAL_ALPHABET.length];
  }
  return out;
}

/** Points granted to referrer and referee on referee's first paid order (100 pts = GHS 1). */
export const REFERRAL_REWARD_POINTS_EACH = 1000;
