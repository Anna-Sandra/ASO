import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "services/api";
import { useAuth, useNotice } from "context";
import { h } from "utils/h";
import { Flame, Gift, Layers, Plus, Sparkles } from "lucide-react";
import { Button, GlassCard, InlineNotice } from "components/ui";
import { formatGhc } from "utils/money";
import { VendorPromoCreateStudio } from "pages/vendor/vendorPromoCreateStudio";

const DEAL_KINDS = [
  { id: "flash_sale", label: "Flash sale" },
  { id: "deal_discount", label: "Discount" },
  { id: "deal_bundle", label: "Bundle" }
];

/** @param {typeof DEAL_KINDS[0]["id"]} id */
function isProductDealKind(id) {
  return id === "flash_sale" || id === "deal_discount" || id === "deal_bundle";
}

function pctOff(compareAt, sale) {
  const c = Number(compareAt);
  const s = Number(sale);
  if (!(c > 0) || !(s >= 0) || !(s < c)) return null;
  return Math.round(((c - s) / c) * 100);
}

function dealTypeLabel(kind) {
  switch (kind) {
    case "flash_sale":
      return "🔥 Flash sale";
    case "deal_discount":
      return "💰 Discount";
    case "deal_bundle":
      return "🎁 Bundle";
    default:
      return kind.replace(/_/g, " ");
  }
}

/** @param {{ kind: string, endsAt: string }} r */
function isOngoingDiscount(r) {
  if (r.kind !== "deal_discount") return false;
  try {
    return new Date(r.endsAt).getFullYear() >= 2090;
  } catch {
    return false;
  }
}

/** @param {Record<string, unknown>} r */
function saleRowMeta(r) {
  const cmp = r.compareAtGhs != null ? Number(r.compareAtGhs) : Number(r.catalogPriceGhs ?? 0);
  const sale = r.salePriceGhs != null ? Number(r.salePriceGhs) : cmp;
  const pct =
    r.discountPercent != null && Number(r.discountPercent) > 0
      ? Math.round(Number(r.discountPercent))
      : pctOff(cmp, sale);
  return { cmp, sale, pct };
}

export function VendorPromotionsPage() {
  const { accessToken } = useAuth();
  const { toast, confirm } = useNotice();

  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inventoryErr, setInventoryErr] = useState("");
  const [err, setErr] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const loadPromos = useCallback(() => {
    if (!accessToken) return;
    setLoading(true);
    setErr("");
    apiFetch("/api/vendor/promotions", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => setRows(Array.isArray(d.promotions) ? d.promotions : []))
      .catch((e) => setErr(e.message || "Could not load"))
      .finally(() => setLoading(false));
  }, [accessToken]);

  const loadInventory = useCallback(() => {
    if (!accessToken) return;
    setInventoryErr("");
    apiFetch("/api/products/mine", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => {
        const list = Array.isArray(d.products) ? d.products.filter((x) => x.status === "active") : [];
        setProducts(list);
      })
      .catch((e) => setInventoryErr(e.message || "Could not load listings"));
  }, [accessToken]);

  useEffect(() => {
    loadPromos();
  }, [loadPromos]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const endDeal = async (row) => {
    const ok = await confirm("End this deal now? Buyers will stop seeing the discounted price.", {
      title: "End deal?",
      confirmLabel: "End deal"
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/vendor/promotions/${row.id}/end`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      toast("Deal ended.", { variant: "success" });
      loadPromos();
    } catch (ex) {
      toast(ex.message || "Could not end deal", { variant: "error" });
    }
  };

  const statusTone = useMemo(
    () => ({
      pending: "text-amber-600 dark:text-amber-300",
      approved: "text-sky-600 dark:text-sky-300",
      rejected: "text-rose-600 dark:text-rose-300",
      draft: "text-slate-500"
    }),
    []
  );

  const productDeals = useMemo(() => rows.filter((r) => isProductDealKind(r.kind)), [rows]);

  const otherPromos = useMemo(() => rows.filter((r) => !isProductDealKind(r.kind)), [rows]);

  if (showCreate) {
    return h(VendorPromoCreateStudio, {
      products,
      inventoryErr,
      onCancel: () => setShowCreate(false),
      onSuccess: () => {
        setShowCreate(false);
        loadPromos();
      }
    });
  }

  return h("div", { className: "space-y-6" }, [
    h("div", { key: "wrap", className: "mx-auto max-w-4xl px-4 py-2 lg:px-8 lg:pb-10" }, [
      h("header", { key: "hd", className: "mb-8 space-y-4" }, [
        h(
          "div",
          {
            className:
              "overflow-hidden rounded-3xl border border-violet-500/20 bg-gradient-to-br from-violet-600/10 via-white to-sky-500/10 p-6 dark:border-white/10 dark:from-violet-950/30 dark:via-night-900 dark:to-sky-950/20 sm:p-8"
          },
          [
            h("div", { className: "flex flex-wrap items-start justify-between gap-4" }, [
              h("div", { className: "max-w-xl" }, [
                h(
                  "h1",
                  {
                    className:
                      "flex flex-wrap items-center gap-2 font-display text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl"
                  },
                  [h(Sparkles, { className: "h-7 w-7 text-violet-500" }), "Promotions & deals"]
                ),
                h(
                  "p",
                  { className: "mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400" },
                  "Create eye-catching promos with live preview. After admin approval, buyers see them on the shop carousel, deals page, and your listing cards."
                )
              ]),
              h(
                Button,
                {
                  variant: "primary",
                  type: "button",
                  className: "!rounded-2xl !px-5",
                  onClick: () => setShowCreate(true)
                },
                [h(Plus, { className: "h-4 w-4" }), "Create promo"]
              )
            ])
          ]
        )
      ]),

      h("section", { key: "actv", className: "space-y-3" }, [
            h(
              "h2",
              { className: "flex items-center gap-2 font-display text-xl font-semibold text-slate-900 dark:text-white" },
              [h(Layers, { className: "h-5 w-5 text-violet-400" }), `Active catalogue deals (${productDeals.filter((r) => r.isLive).length})`]
            ),
            err && h(InlineNotice, { key: "le", variant: "error", className: "mb-3", onDismiss: () => setErr("") }, err),
            loading
              ? h("p", { className: "text-sm text-slate-500" }, "Loading…")
              : productDeals.length === 0
                ? h(GlassCard, { className: "!p-6 text-center" }, [
                    h(Flame, { className: "mx-auto mb-3 h-10 w-10 text-violet-400 opacity-80" }),
                    h("p", { className: "font-semibold text-slate-800 dark:text-slate-100" }, "No promos yet"),
                    h("p", { className: "mt-1 text-sm text-slate-500" }, "Create your first promo — buyers will see it after admin approval."),
                    h(
                      Button,
                      {
                        type: "button",
                        variant: "primary",
                        className: "!mt-4 !rounded-2xl",
                        onClick: () => setShowCreate(true)
                      },
                      "Create promo"
                    )
                  ])
                : productDeals.map((r) => {
                    const { cmp, sale, pct } = saleRowMeta(r);
                    const live = r.isLive;
                    const endLabel = isOngoingDiscount(r) ? "No expiry · discount deal" : `Ends ${fmtLocal(r.endsAt)}`;
                    return h(GlassCard, { key: r.id, className: "!overflow-hidden !p-0" }, [
                      h("div", { className: "border-b border-slate-100 bg-gradient-to-r from-orange-500/10 to-violet-500/10 px-4 py-3 dark:border-white/10" }, [
                        h("div", { className: "flex flex-wrap items-center gap-2" }, [
                          h("span", { className: "text-lg font-semibold dark:text-white" }, dealTypeLabel(r.kind)),
                          h(
                            "span",
                            { className: `rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusTone[r.reviewStatus] || ""}` },
                            `${r.reviewStatus}${live ? " · LIVE" : ""}`
                          )
                        ]),
                        r.productName &&
                          h("p", { className: "mt-1 text-sm font-medium text-slate-800 dark:text-slate-100" }, String(r.productName))
                      ]),
                      h("div", { className: "space-y-2 px-4 py-4" }, [
                        h("div", { className: "flex flex-wrap items-baseline gap-2 font-bold" }, [
                          h("span", { className: "text-lg text-violet-600 dark:text-violet-300", key: "s" }, formatGhc(Number(sale) || 0)),
                          cmp > 0 &&
                            h("span", { className: "text-sm font-semibold text-slate-400 line-through", key: "c" }, formatGhc(cmp)),
                          pct != null && h(Gift, { key: "g", className: "mx-1 h-4 w-4 text-emerald-500", "aria-hidden": true }),
                          pct != null && h("span", { key: "p", className: "rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-300" }, `${pct}% off`)
                        ]),
                        h("p", { className: `text-xs font-semibold ${live ? "text-rose-600 dark:text-rose-400" : "text-slate-500"}` }, endLabel),
                        r.tagBadge &&
                          h("p", { className: "text-[11px] uppercase tracking-wide text-slate-500" }, `"${r.tagBadge}"`),
                        live &&
                          h(
                            "div",
                            { className: "mt-3 flex flex-wrap gap-2" },
                            [
                              h(
                                Button,
                                {
                                  type: "button",
                                  variant: "danger",
                                  className: "!text-xs !min-h-[38px]",
                                  onClick: () => endDeal(r)
                                },
                                "End deal now"
                              )
                            ].filter(Boolean)
                          ),
                        !live && r.reviewStatus === "pending" &&
                          h("p", { className: "text-xs text-amber-600 dark:text-amber-300" }, "Awaiting platform approval"),
                        !live && r.reviewStatus === "rejected" && r.rejectionReason &&
                          h("p", { className: "text-xs text-rose-700 dark:text-rose-400" }, `Reason: ${r.rejectionReason}`)
                      ])
                    ]);
                  }),

            otherPromos.length > 0 &&
              h("div", { key: "misc", className: "space-y-2 pt-6" }, [
                h("h3", { className: "text-sm font-bold uppercase tracking-wide text-slate-400" }, "Campaign & coupon drafts"),
                otherPromos.map((r) =>
                  h(GlassCard, { key: r.id, className: "!p-4" }, [
                    h("div", { className: "flex justify-between gap-2" }, [
                      h("p", { className: "font-semibold text-slate-900 dark:text-white" }, r.title),
                      h("span", { className: `text-[10px] font-bold uppercase ${statusTone[r.reviewStatus] || ""}` }, r.reviewStatus)
                    ]),
                    h("p", { className: "text-xs text-slate-500" }, `${r.kind} · ends ${fmtLocal(r.endsAt)}`)
                  ])
                )
              ])
          ])
    ])
  ]);
}

function fmtLocal(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}
