/** Display Ghana Cedis (amounts are stored as decimal GHS). */
export function formatGhc(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "Ghc 0.00";
  return `Ghc ${n.toFixed(2)}`;
}
