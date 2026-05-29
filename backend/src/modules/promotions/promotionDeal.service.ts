import mongoose from "mongoose";
import { roundMoney } from "../../utils/commission";
import { Promotion } from "./promotion.model";

/** Product-linked storefront deals surfaced to buyers / checkout */
export const PUBLIC_PRODUCT_DEAL_KINDS = ["flash_sale", "deal_discount", "deal_bundle"] as const;
export type PublicProductDealKind = (typeof PUBLIC_PRODUCT_DEAL_KINDS)[number];

const dealKindFilter = { $in: [...PUBLIC_PRODUCT_DEAL_KINDS] } as const;

function nowEligibleDealFilter() {
  const now = new Date();
  return {
    reviewStatus: "approved" as const,
    kind: dealKindFilter,
    endsAt: { $gt: now },
    $or: [{ startsAt: null }, { startsAt: { $exists: false } }, { startsAt: { $lte: now } }]
  };
}

export type LeanProductDeal = {
  _id: mongoose.Types.ObjectId;
  kind: string;
  productId?: mongoose.Types.ObjectId | null;
  salePriceGhs?: number | null;
  compareAtGhs?: number | null;
  endsAt?: Date;
  startsAt?: Date | null;
  priority?: number;
  tagBadge?: string;
  title?: string;
  subtitle?: string;
};

/**
 * Best promotion per product (priority desc, ends soonest).
 */
export async function findBestDealPerProduct(
  productOids: mongoose.Types.ObjectId[]
): Promise<Map<string, LeanProductDeal>> {
  const out = new Map<string, LeanProductDeal>();
  if (!productOids.length) return out;
  const rows = (await Promotion.find({
    ...nowEligibleDealFilter(),
    productId: { $in: productOids },
    salePriceGhs: { $gt: 0 }
  })
    .sort({ priority: -1, endsAt: 1 })
    .select("kind productId salePriceGhs compareAtGhs endsAt startsAt priority tagBadge title subtitle")
    .lean()) as LeanProductDeal[];

  for (const r of rows) {
    const pid = r.productId ? r.productId.toString() : "";
    if (!pid || out.has(pid)) continue;
    out.set(pid, r);
  }
  return out;
}

/** Apply approved deal price + `activeDeal` snapshot for public JSON (buyer catalog / PDP). */
export function applyDealToPublicProduct<T extends Record<string, unknown>>(p: T, deal: LeanProductDeal): T {
  const sale = Number(deal.salePriceGhs);
  if (!(sale > 0)) return p;
  const catalog = Number(p.price) || 0;
  const compareFromDeal = deal.compareAtGhs != null ? Number(deal.compareAtGhs) : catalog;
  const existingCompare = Number(p.compareAtPrice) || 0;
  const strikeWas = Math.max(catalog, compareFromDeal, existingCompare);
  if (!(sale < strikeWas)) return p;
  const next = { ...p } as Record<string, unknown>;
  next.compareAtPrice = strikeWas;
  next.price = roundMoney(sale);
  const savings = roundMoney(strikeWas - sale);
  const pct = strikeWas > 0 ? Math.round((savings / strikeWas) * 100) : undefined;
  next.activeDeal = {
    id: deal._id.toString(),
    kind: deal.kind,
    endsAt: deal.endsAt ? new Date(deal.endsAt).toISOString() : null,
    tagBadge: deal.tagBadge || undefined,
    title: String(deal.title || "").trim() || undefined,
    subtitle: String(deal.subtitle || "").trim() || undefined,
    savingsGhs: savings,
    discountPercent: pct != null && pct > 0 && pct < 100 ? pct : undefined
  };
  return next as T;
}

export async function attachDealPricingToPublicProducts<T extends Record<string, unknown>>(products: T[]): Promise<T[]> {
  if (!products.length) return products;
  const ids = products
    .map((x) => (typeof x.id === "string" ? x.id : ""))
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  const map = await findBestDealPerProduct(ids);
  return products.map((p) => {
    const oid = typeof p.id === "string" ? p.id : "";
    const deal = oid ? map.get(oid) : undefined;
    if (!deal) return p;
    return applyDealToPublicProduct(p, deal);
  });
}

/** Unit listing price before add-ons — honors active deal vs stored catalogue price */
export async function checkoutListingUnitBeforeAddons(
  productId: mongoose.Types.ObjectId,
  catalogPriceFromDb: number
): Promise<number> {
  const map = await findBestDealPerProduct([productId]);
  const deal = map.get(productId.toString());
  if (!deal) return roundMoney(Number(catalogPriceFromDb) || 0);
  const sale = Number(deal.salePriceGhs);
  if (!(sale > 0)) return roundMoney(Number(catalogPriceFromDb) || 0);
  const cat = Number(catalogPriceFromDb) || 0;
  const was = deal.compareAtGhs != null ? Number(deal.compareAtGhs) : cat;
  const strikeWas = Math.max(cat, was);
  if (sale < strikeWas) return roundMoney(sale);
  return roundMoney(cat);
}
