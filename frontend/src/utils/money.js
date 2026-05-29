/** Display Ghana Cedis (amounts are stored as decimal GHS). */
export function formatGhc(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "GH₵ 0.00";
  return `GH₵ ${n.toFixed(2)}`;
}
