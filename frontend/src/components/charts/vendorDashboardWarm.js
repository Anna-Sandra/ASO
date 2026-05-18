/** Revenue window helpers for the vendor dashboard (theme-agnostic). */

/** @param {Array<{ date: string; revenue: number }>} daily */
export function sliceLastDays(daily, days) {
  const n = Math.max(1, Math.floor(days));
  return (daily || []).slice(-n);
}

/** @param {Array<{ date: string; revenue: number }>} daily */
export function sumDailyRevenue(daily) {
  return (daily || []).reduce((s, d) => s + (Number(d.revenue) || 0), 0);
}

/**
 * Compare last `periodDays` vs the previous `periodDays` window.
 * @param {Array<{ date: string; revenue: number }>} daily
 */
export function revenuePeriodDelta(daily, periodDays) {
  const n = Math.max(1, periodDays);
  const all = daily || [];
  const current = sliceLastDays(all, n);
  const prior = all.length > n ? all.slice(-n * 2, -n) : [];
  const curSum = sumDailyRevenue(current);
  const prevSum = sumDailyRevenue(prior);
  if (prevSum <= 0) return { pct: curSum > 0 ? 100 : 0, up: curSum >= prevSum };
  const pct = Math.round(((curSum - prevSum) / prevSum) * 100);
  return { pct, up: pct >= 0 };
}
