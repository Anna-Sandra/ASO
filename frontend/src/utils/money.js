/** Display Ghana Cedis — whole numbers only (buyer-facing). */
export function formatGhc(amount) {
  const n = Math.ceil(Number(amount) || 0);
  return `GH₵ ${n}`;
}
