/**
 * Vendor-defined product add-ons / removals (food customization).
 */

/** @param {unknown} a */
export function normalizeAddonDef(a) {
  if (!a || typeof a !== "object") return null;
  const label = String(a.label || "").trim();
  if (!label) return null;
  const kind = a.kind === "remove" ? "remove" : "add";
  const priceDelta = Number(a.priceDelta) || 0;
  return { label, kind, priceDelta };
}

/** @param {unknown} productOrAddons */
export function productAddonDefs(productOrAddons) {
  const raw =
    Array.isArray(productOrAddons)
      ? productOrAddons
      : productOrAddons && typeof productOrAddons === "object" && Array.isArray(productOrAddons.addons)
        ? productOrAddons.addons
        : [];
  return raw.map(normalizeAddonDef).filter(Boolean);
}

/** @param {ReturnType<typeof normalizeAddonDef>[]} defs */
export function splitAddonsByKind(defs) {
  const adds = [];
  const removals = [];
  for (const d of defs) {
    if (d.kind === "remove") removals.push(d);
    else adds.push(d);
  }
  return { adds, removals };
}

/**
 * Seller list-price delta for selected option labels (case-insensitive).
 * @param {ReturnType<typeof normalizeAddonDef>[]} defs
 * @param {string[]} selectedLabels
 */
export function addonDeltaFromDefs(defs, selectedLabels) {
  if (!defs.length || !selectedLabels?.length) return 0;
  const byNorm = new Map(defs.map((d) => [d.label.trim().toLowerCase(), d.priceDelta]));
  const seen = new Set();
  let sum = 0;
  for (const raw of selectedLabels) {
    const k = String(raw).trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    if (byNorm.has(k)) sum += byNorm.get(k);
  }
  return Math.round(sum * 100) / 100;
}

/**
 * @param {{ price?: number, addons?: unknown[] }} product
 * @param {string[]} selectedLabels
 */
export function effectiveListUnitPrice(product, selectedLabels) {
  const base = Math.max(0, Number(product?.price) || 0);
  const defs = productAddonDefs(product);
  const delta = addonDeltaFromDefs(defs, selectedLabels);
  return Math.max(0, Math.round((base + delta) * 100) / 100);
}

/** @param {{ addons?: unknown[], selectedAddonLabels?: string[], price?: number }} line */
export function cartLineSellerUnit(line) {
  if (!line || typeof line !== "object") return 0;
  const labels = Array.isArray(line.selectedAddonLabels) ? line.selectedAddonLabels : [];
  const defs = productAddonDefs(line);
  if (defs.length && labels.length) {
    return effectiveListUnitPrice({ price: line.baseListPrice ?? line.price, addons: defs }, labels);
  }
  return Math.max(0, Number(line.price) || 0);
}

/** @param {string[]} selectedLabels @param {string} label */
export function toggleAddonLabel(selectedLabels, label) {
  const norm = String(label).trim().toLowerCase();
  const has = selectedLabels.some((s) => String(s).trim().toLowerCase() === norm);
  if (has) return selectedLabels.filter((s) => String(s).trim().toLowerCase() !== norm);
  return [...selectedLabels, String(label).trim()];
}
