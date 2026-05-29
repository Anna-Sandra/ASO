import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "services/api";
import { useAuth, useNotice } from "context";
import { h, f } from "utils/h";
import { Flame, Gift, Layers, Percent } from "lucide-react";
import { Button, Field, GlassCard, GlassPanel, InlineNotice, TextArea, TextInput } from "components/ui";
import { formatGhc } from "utils/money";

const DEAL_KINDS = [
  { id: "flash_sale", label: "🔥 Flash sale", hint: "Limited time · countdown everywhere" },
  { id: "deal_discount", label: "💰 Discount deal", hint: "Runs until admin ends or you edit end date · optional “no expiry”" },
  { id: "deal_bundle", label: "🎁 Bundle deal", hint: "Describe X+Y free in subtitle — admin review like other deals" }
];

const PROMO_KINDS_EXTRA = [
  { id: "banner", label: "Hero banner" },
  { id: "spotlight", label: "Limited-time card" },
  { id: "vendor_promo", label: "Vendor spotlight block" },
  { id: "coupon", label: "Coupon code" }
];

const ALL_CREATION_KINDS = [...DEAL_KINDS, ...PROMO_KINDS_EXTRA];

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
  const [submitErr, setSubmitErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [creationKind, setCreationKind] = useState("flash_sale");

  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [code, setCode] = useState("");
  const [productId, setProductId] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [noEndDiscount, setNoEndDiscount] = useState(false);
  const [tagBadge, setTagBadge] = useState("FLASH SALE");
  const [gradientKey, setGradientKey] = useState("violet");
  const [compareAt, setCompareAt] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [soldPercent, setSoldPercent] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [discountPct, setDiscountPct] = useState("");
  const [linkPath, setLinkPath] = useState("");

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

  const selectedProduct = useMemo(
    () => products.find((p) => String(p.id) === String(productId)),
    [products, productId]
  );

  useEffect(() => {
    if (!selectedProduct) return;
    setCompareAt(String(selectedProduct.price ?? ""));
    const baseName = String(selectedProduct.name || "").trim().slice(0, 120);
    if (!title.trim() && isProductDealKind(creationKind)) setTitle(`${baseName} promotion`.trim());
    if (creationKind === "flash_sale" && tagBadge.toUpperCase() === "HOT") setTagBadge("FLASH SALE");
  }, [selectedProduct, creationKind]);

  const derivedPct = useMemo(() => {
    if (discountPct.trim()) return Number(discountPct);
    return pctOff(compareAt, salePrice);
  }, [compareAt, salePrice, discountPct]);

  useEffect(() => {
    if (creationKind !== "deal_bundle") return;
    if (!tagBadge.trim()) setTagBadge("BUNDLE");
    if (!subtitle.trim()) setSubtitle("e.g. Buy 2 sleeves, get diaper cream free");
  }, [creationKind]);

  const resetForm = () => {
    setTitle("");
    setSubtitle("");
    setCode("");
    setProductId("");
    setEndsAt("");
    setStartsAt("");
    setNoEndDiscount(false);
    setCompareAt("");
    setSalePrice("");
    setLinkPath("");
    setSoldPercent("");
    setDiscountPct("");
  };

  const submit = async () => {
    setSubmitErr("");
    if (!accessToken) return;
    if (!title.trim()) {
      setSubmitErr("Give the deal a short title.");
      return;
    }
    if (isProductDealKind(creationKind)) {
      if (!productId.trim()) {
        setSubmitErr("Choose a listing.");
        return;
      }
      const cmp = compareAt.trim() !== "" ? Number(compareAt) : NaN;
      const sale = salePrice.trim() !== "" ? Number(salePrice) : NaN;
      if (!(Number.isFinite(cmp) && cmp > 0 && Number.isFinite(sale) && sale > 0)) {
        setSubmitErr("Enter valid original and deal prices.");
        return;
      }
      if (!(sale < cmp)) {
        setSubmitErr("Deal price should be lower than the original/catalog price.");
        return;
      }
    }

    const sendEnds =
      creationKind === "deal_discount" && noEndDiscount
        ? undefined
        : endsAt
          ? new Date(endsAt).toISOString()
          : undefined;

    if (creationKind !== "deal_discount" && !sendEnds && creationKind !== "coupon") {
      setSubmitErr("End date/time is required for this promotion type.");
      return;
    }
    if (
      creationKind !== "deal_discount" &&
      sendEnds &&
      Number.isNaN(new Date(sendEnds).getTime())
    ) {
      setSubmitErr("Invalid end date.");
      return;
    }

    const bodyBase = {
      kind: creationKind,
      title: title.trim(),
      subtitle: subtitle.trim(),
      code: creationKind === "coupon" ? code.trim() : "",
      productId:
        creationKind !== "coupon" && isProductDealKind(creationKind) ? productId.trim() || null : null,
      businessId: businessId.trim() || null,
      endsAt: sendEnds ?? null,
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      tagBadge:
        creationKind === "deal_bundle"
          ? (tagBadge || "BUNDLE").trim()
          : isProductDealKind(creationKind)
            ? tagBadge.trim() || undefined
            : tagBadge.trim(),
      gradientKey: gradientKey.trim() || "violet",
      linkPath: linkPath.trim() || null,
      soldPercent: soldPercent.trim() !== "" ? Number(soldPercent) : null,
      compareAtGhs: compareAt.trim() !== "" ? Number(compareAt) : null,
      salePriceGhs: salePrice.trim() !== "" ? Number(salePrice) : null,
      minOrderGhs: minOrder.trim() !== "" ? Number(minOrder) : null,
      discountPercent: discountPct.trim() !== "" ? Number(discountPct) : derivedPct != null ? derivedPct : null,
      freeDelivery: false,
      priority: 0
    };

    /** @type {Record<string, unknown>} */
    const body = bodyBase;

    setBusy(true);
    try {
      await apiFetch("/api/vendor/promotions", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: body
      });
      toast("Submitted — platform admin will approve before shoppers see it on /deals.", { variant: "success" });
      resetForm();
      setShowCreate(false);
      loadPromos();
    } catch (e) {
      setSubmitErr(e.message || "Submit failed");
    } finally {
      setBusy(false);
    }
  };

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

  return h("div", { className: "space-y-6" }, [
    h(
      "div",
      {
        key: "wrap",
        className:
          "mx-auto max-w-3xl px-4 py-2 lg:mx-auto lg:flex lg:max-w-6xl lg:gap-8 lg:px-8 lg:pb-10"
      },
      [
        h("div", { key: "main", className: "flex-1 space-y-6" }, [
          h("header", { key: "hd", className: "space-y-2" }, [
            h(
              "h1",
              {
                className:
                  "flex flex-wrap items-center gap-3 font-display text-2xl font-bold text-slate-900 dark:text-white"
              },
              [h(Flame, { className: "h-8 w-8 text-orange-400" }), "Promotions & deals"]
            ),
            h(
              "p",
              { className: "text-sm leading-relaxed text-slate-600 dark:text-slate-400" },
              "Publish flash timers, evergreen discounts, and bundle teasers tied to listings. Buyers see prices after admins approve."
            ),
            h(
              "div",
              { className: "flex flex-wrap gap-2 pt-2" },
              h(
                Button,
                {
                  variant: "primary",
                  type: "button",
                  className: "!rounded-2xl",
                  onClick: () => setShowCreate((x) => !x)
                },
                showCreate ? "← Close wizard" : "+ Create new deal"
              )
            )
          ]),

          showCreate &&
            h(
              GlassPanel,
              {
                key: "form",
                className: "!border-orange-400/35 !shadow-lg !shadow-orange-950/10"
              },
              [
                h("h2", { className: "font-display text-lg font-semibold text-slate-900 dark:text-white" }, [
                  "Create new ",
                  isProductDealKind(creationKind) ? "listing deal" : "campaign"
                ]),

                h(Field, { label: "What are you submitting?" }, [
                  h(
                    "select",
                    {
                      className:
                        "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-night-900",
                      value: ALL_CREATION_KINDS.some((o) => o.id === creationKind) ? creationKind : "flash_sale",
                      onChange: (e) => setCreationKind(e.target.value)
                    },
                    ALL_CREATION_KINDS.map((o) => h("option", { key: o.id, value: o.id }, o.label))
                  )
                ]),

                isProductDealKind(creationKind) &&
                  h(f, null, [
                    h("div", { key: "rt", className: "rounded-2xl border border-dashed border-slate-300/70 p-4 dark:border-white/10" }, [
                      h("p", { className: "text-xs font-bold uppercase tracking-wide text-slate-400" }, "Deal type"),
                      ...DEAL_KINDS.filter((d) => d.id === creationKind).map((d) =>
                        h("p", { key: "h", className: "mt-1 text-[13px] text-slate-600 dark:text-slate-400" }, d.hint)
                      ),
                      h(Field, { label: "Product listing", key: "p" }, [
                        inventoryErr &&
                          h(InlineNotice, { key: "ie", variant: "warning", className: "!mb-2" }, inventoryErr),
                        h(
                          "select",
                          {
                            className:
                              "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-night-900",
                            value: productId,
                            onChange: (e) => setProductId(e.target.value)
                          },
                          [
                            h("option", { value: "", key: "ph" }, "Select product ▼"),
                            ...products.map((p) =>
                              h(
                                "option",
                                {
                                  key: p.id,
                                  value: String(p.id)
                                },
                                `${p.name.slice(0, 60)} (${formatGhc(Number(p.price) || 0)})`
                              )
                            )
                          ]
                        )
                      ]),
                      creationKind === "flash_sale" &&
                        h(
                          Field,
                          { label: "Badge label (shown on storefront)", key: "bad" },
                          h(TextInput, {
                            value: tagBadge,
                            onChange: (e) => setTagBadge(e.target.value),
                            placeholder: "FLASH SALE — limited time …"
                          })
                        ),
                      creationKind === "deal_discount" &&
                        h(
                          Field,
                          { label: "Badge label (optional)", key: "bd2" },
                          h(TextInput, {
                            value: tagBadge,
                            onChange: (e) => setTagBadge(e.target.value),
                            placeholder: "SALE · Member pick"
                          })
                        ),
                      creationKind === "deal_bundle" &&
                        h(Field, { label: "Bundle badge", key: "bd3" }, h(TextInput, { value: tagBadge, onChange: (e) => setTagBadge(e.target.value) })),
                      h(Field, { label: "Headline shoppers see before approval", key: "ti" }, h(TextInput, { value: title, onChange: (e) => setTitle(e.target.value) })),
                      h(Field, { label: "Subtitle / mechanics", key: "sub" }, h(TextArea, { value: subtitle, onChange: (e) => setSubtitle(e.target.value), rows: 2 })),
                      h("div", { key: "pr", className: "grid gap-4 sm:grid-cols-2" }, [
                        h(Field, { label: "Original price (GH₵)", key: "c" }, h(TextInput, { type: "number", min: 0, step: 0.01, value: compareAt, onChange: (e) => setCompareAt(e.target.value) })),
                        h(Field, { label: "Deal price (GH₵)", key: "s" }, h(TextInput, { type: "number", min: 0, step: 0.01, value: salePrice, onChange: (e) => setSalePrice(e.target.value) }))
                      ]),
                      derivedPct != null &&
                        Number.isFinite(derivedPct) &&
                        h("p", { key: "pc", className: "rounded-xl bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-800 dark:text-emerald-200" }, `${derivedPct}% off (auto-calculated)`),
                      creationKind === "flash_sale" &&
                        h(Field, { label: '"X% claimed" urgency bar', key: "sp" }, h(TextInput, { type: "number", min: 0, max: 100, value: soldPercent, onChange: (e) => setSoldPercent(e.target.value), placeholder: "e.g. 68" }))
                    ]),

                    h(
                      GlassPanel,
                      {
                        key: "sched",
                        className:
                          "!mt-4 !border-sky-500/25 dark:!border-sky-500/20 [&_.field-label]:font-semibold"
                      },
                      [
                        h(
                          "p",
                          {
                            key: "sh",
                            className: "mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400"
                          },
                          creationKind === "flash_sale" ? "── Flash scheduling ──" : "── Scheduling ──"
                        ),
                        creationKind === "deal_discount" &&
                          h("label", { key: "noe", className: "mb-4 flex cursor-pointer items-center gap-2 text-sm" }, [
                            h("input", {
                              type: "checkbox",
                              checked: noEndDiscount,
                              className: "h-4 w-4 accent-violet-600",
                              onChange: (e) => setNoEndDiscount(e.target.checked)
                            }),
                            h("span", null, 'No expiry (platform stores as “until 2099” — revisit anytime)')
                          ]),
                        h(
                          Field,
                          { label: "Start date/time", key: "st" },
                          h(TextInput, { type: "datetime-local", value: startsAt, onChange: (e) => setStartsAt(e.target.value) })
                        ),
                        h(
                          Field,
                          {
                            label:
                              creationKind === "deal_discount" && noEndDiscount
                                ? "End date/time (skipped — perpetual discount)"
                                : "End date/time",
                            key: "en",
                            ...(creationKind === "deal_discount" && noEndDiscount ? {} : {})
                          },
                          h(TextInput, {
                            type: "datetime-local",
                            disabled: creationKind === "deal_discount" && noEndDiscount,
                            value: endsAt,
                            onChange: (e) => setEndsAt(e.target.value),
                            ...(creationKind === "deal_discount" && noEndDiscount ? {} : {})
                          })
                        )
                      ]
                    )
                  ]),
                ...(creationKind === "coupon"
                  ? [
                      h(Field, { label: "Coupon code", key: "cod" }, h(TextInput, { value: code, onChange: (e) => setCode(e.target.value.toUpperCase()) })),
                      h(Field, { label: "Store id (optional)", key: "bi" }, h(TextInput, { value: businessId, onChange: (e) => setBusinessId(e.target.value.trim()) })),
                      h("div", { key: "cp", className: "grid gap-3 sm:grid-cols-2" }, [
                        h(Field, { label: "Min order (GH₵)", key: "mo" }, h(TextInput, { type: "number", value: minOrder, onChange: (e) => setMinOrder(e.target.value) })),
                        h(Field, { label: "Discount %", key: "dp" }, h(TextInput, { type: "number", value: discountPct, onChange: (e) => setDiscountPct(e.target.value) }))
                      ]),
                      h(Field, { label: "End (promo redemption)", key: "eec" }, h(TextInput, { type: "datetime-local", value: endsAt, onChange: (e) => setEndsAt(e.target.value) }))
                    ]
                  : !isProductDealKind(creationKind)
                    ? [
                        h(Field, { label: "Title", key: "t2" }, h(TextInput, { value: title, onChange: (e) => setTitle(e.target.value) })),
                        h(Field, { label: "Subtitle", key: "su2" }, h(TextArea, { value: subtitle, onChange: (e) => setSubtitle(e.target.value), rows: 2 })),
                        h(Field, { label: "End", key: "e3" }, h(TextInput, { type: "datetime-local", value: endsAt, onChange: (e) => setEndsAt(e.target.value) })),
                        h("div", { key: "mm", className: "grid gap-3 sm:grid-cols-2" }, [
                          h(Field, { label: "Badge", key: "tb2" }, h(TextInput, { value: tagBadge, onChange: (e) => setTagBadge(e.target.value) })),
                          h(Field, { label: "Gradient theme", key: "gk2" }, h(TextInput, { value: gradientKey, onChange: (e) => setGradientKey(e.target.value) }))
                        ]),
                        h(Field, { label: "Link path", key: "lp3" }, h(TextInput, { value: linkPath, onChange: (e) => setLinkPath(e.target.value), placeholder: "/store/your-shop" }))
                      ]
                    : []),

                submitErr && h(InlineNotice, { key: "se", variant: "error", className: "mt-3", onDismiss: () => setSubmitErr("") }, submitErr),

                h("div", { key: "act", className: "mt-5 flex flex-wrap gap-3" }, [
                  h(
                    Button,
                    {
                      type: "button",
                      variant: "ghost",
                      onClick: () => {
                        setShowCreate(false);
                        resetForm();
                      }
                    },
                    "Cancel"
                  ),
                  h(Button, { type: "button", variant: "primary", className: "!rounded-2xl", loading: busy, onClick: () => void submit() }, "Publish deal"),
                  h(
                    Button,
                    { type: "button", variant: "ghost", onClick: resetForm },
                    "Reset draft"
                  )
                ])
              ]
            ),

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
                ? h(GlassCard, { className: "!p-4 text-sm text-slate-500" }, "No product-led deals submitted yet.")
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
        ]),

        h(
          "aside",
          {
            key: "tips",
            className: "mt-10 hidden lg:mt-[4.5rem] lg:block lg:w-72 xl:w-80"
          },
          [
            h(GlassPanel, { key: "k", className: "!sticky !top-28 !border-slate-400/40 !bg-slate-50/95 text-sm dark:!bg-night-950/80" }, [
              h(
                "p",
                {
                  key: "h",
                  className: "text-[11px] font-black uppercase tracking-widest text-slate-500"
                },
                "What shoppers see post-approval"
              ),
              h("ul", { key: "u", className: "mt-3 list-disc space-y-2 ps-5 text-slate-600 dark:text-slate-400" }, [
                h(
                  "li",
                  { key: "l1" },
                  "🔥 Homepage flash rail + countdown for timed promos (ongoing discounts show “save now” cues)"
                ),
                h("li", { key: "l2" }, "Strike-through list price on cards, search, and PDP when a deal is live"),
                h("li", { key: "l3" }, "Checkout uses your deal base price automatically (addons still add on top)"),
                h("li", { key: "l4" }, "Buyers who saved the product get an in-app ping when an admin approves the deal"),
                h("li", { key: "l5" }, "Coupons still publish on /coupons after review")
              ]),
              h("div", { key: "i2", className: "mt-4 flex gap-2 text-violet-500" }, [
                h(Percent, { className: "h-4 w-4" }),
                "Need tweaks? Duplicate this deal & resubmit after rejecting the old submission."
              ])
            ])
          ]
        )
      ]
    )
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
