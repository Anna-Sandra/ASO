import { env } from "../config/env";

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Split line gross (buyer-paid) into platform fee and seller proceeds using PLATFORM_COMMISSION_PERCENT. */
export function splitLineGross(gross: number): { platformFee: number; sellerProceeds: number } {
  const rate = env.PLATFORM_COMMISSION_PERCENT / 100;
  const platformFee = roundMoney(gross * rate);
  const sellerProceeds = roundMoney(gross - platformFee);
  return { platformFee, sellerProceeds };
}
