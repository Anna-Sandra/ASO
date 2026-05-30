import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlarmClock,
  ArrowRight,
  BadgePercent,
  BellRing,
  Copy,
  Flame,
  Gift,
  Percent,
  ShoppingBag,
  Sparkles,
  Store,
  Zap,
  TrendingUp,
  Truck
} from "lucide-react";
import { apiFetch , apiErrorMessage} from "services/api";
import { h, f } from "utils/h";
import { BuyerLayout, CartDrawer } from "pages/buyer/screensBuyer";
import { Button, GlassPanel, InlineNotice } from "components/ui";
import { formatGhc } from "utils/money";
import { useNotice } from "context";
import { usePromoCountdown, isPerpetualPromoEnd } from "utils/promoCountdown";

/** Hero gradients — violet + sky/ice to match buyer shell (`screensBuyer`) */
const GRADIENTS = {
  violet: "from-violet-600 via-indigo-600 to-sky-800",
  sunset: "from-violet-500 via-fuchsia-600 to-indigo-800",
  ocean: "from-sky-500 via-cyan-600 to-violet-800",
  ember: "from-indigo-500 via-violet-600 to-fuchsia-700",
  moss: "from-sky-500 via-violet-600 to-indigo-800",
  berry: "from-fuchsia-600 via-violet-600 to-indigo-900"
};

function gradientClass(key) {
  return GRADIENTS[key] || GRADIENTS.violet;
}

const DEAL_KIND_TABS = [
  { id: "all", label: "All", icon: Zap },
  { id: "flash", label: "Flash", icon: Flame },
  { id: "discount", label: "Discount", icon: Percent },
  { id: "bundle", label: "Bundle", icon: Gift }
];

/** @param {Record<string, unknown>} promo */
function matchesDealKindTab(promo, tabId) {
  const k = String(promo.kind || "");
  if (tabId === "all") return true;
  if (tabId === "flash") return k === "flash_sale";
  if (tabId === "discount") return k === "deal_discount";
  if (tabId === "bundle") return k === "deal_bundle";
  return false;
}

function DealHeroCarousel({ banners }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!banners?.length || banners.length <= 1) return undefined;
    const id = window.setInterval(() => setIdx((i) => (i + 1) % banners.length), 6500);
    return () => clearInterval(id);
  }, [banners]);

  if (!banners?.length)
    return h(
      "div",
      {
        className:
          "relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600/25 to-sky-600/20 p-8 ring-1 ring-white/10"
      },
      [
        h(Flame, { className: "h-10 w-10 text-violet-400" }),
        h("p", { className: "mt-3 font-display text-xl font-bold text-white" }, "Flash savings land here"),
        h("p", { className: "mt-2 text-sm text-white/75" }, "Approved vendor & campus campaigns show up automatically.")
      ]
    );

  const b = banners[idx];
  return h(HeroSlideInner, { b, idx, setIdx, banners });
}

/** Sub-component so hooks follow rules */

function HeroSlideInner({ b, idx, setIdx, banners }) {
  const t = usePromoCountdown(b.endsAt);
  return h("div", { className: "relative overflow-hidden rounded-3xl ring-1 ring-white/10" }, [
    h("div", {
      className: `absolute inset-0 bg-gradient-to-br opacity-95 ${gradientClass(b.gradientKey)}`,
      "aria-hidden": true
    }),
    b.imageUrl
      ? h("img", {
          src: b.imageUrl,
          alt: "",
          className: "absolute inset-0 h-full w-full object-cover opacity-35 mix-blend-overlay"
        })
      : null,
    h(
      "div",
      { className: "relative z-[1] flex min-h-[200px] flex-col justify-end p-6 sm:min-h-[220px] sm:p-8" },
      [
        b.tagBadge &&
          h(
            "span",
            {
              className:
                "mb-2 inline-flex w-fit rounded-full bg-black/30 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-sky-100 ring-1 ring-sky-400/40"
            },
            b.tagBadge
          ),
        h("h2", { className: "font-display text-2xl font-black leading-tight text-white sm:text-3xl" }, b.title),
        b.subtitle && h("p", { className: "mt-2 max-w-xl text-sm text-white/85" }, b.subtitle),
        h("div", { className: "mt-4 flex flex-wrap items-center gap-3" }, [
          h(
            "span",
            {
              className: t.urgent
                ? "inline-flex items-center gap-1.5 rounded-xl bg-rose-950/55 px-3 py-2 font-mono text-sm font-bold text-rose-100 ring-1 ring-rose-400/65"
                : "inline-flex items-center gap-1.5 rounded-xl bg-black/35 px-3 py-2 font-mono text-sm font-bold text-sky-100 ring-1 ring-white/15"
            },
            [
              h(Timer, { className: "h-4 w-4 shrink-0", "aria-hidden": true }),
              t.ended ? "Ended" : `Ends in ${t.text}`
            ]
          ),
          b.linkPath &&
            h(
              Link,
              {
                to: b.linkPath.startsWith("/") ? b.linkPath : `/${b.linkPath}`,
                className:
                  "inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-sky-900 shadow-lg shadow-black/20"
              },
              ["Shop now", h(ArrowRight, { className: "h-4 w-4" })]
            )
        ])
      ]
    ),
    banners.length > 1 &&
      h(
        "div",
        { className: "absolute bottom-4 right-4 z-[2] flex gap-1.5" },
        banners.map((_, i) =>
          h("button", {
            key: i,
            type: "button",
            onClick: () => setIdx(i),
            className: `h-2 rounded-full transition-all ${i === idx ? "w-8 bg-white" : "w-2 bg-white/40"}`,
            "aria-label": `Slide ${i + 1}`
          })
        )
      )
  ]);
}

function FlashSaleCard({ promo }) {
  const timed = !!(promo.endsAt && !isPerpetualPromoEnd(promo.endsAt));
  const t = usePromoCountdown(!timed ? undefined : promo.endsAt);
  const p = promo.product;
  const img = p?.imageUrl;
  const pct =
    promo.discountPercent != null
      ? Math.round(promo.discountPercent)
      : promo.compareAtGhs && promo.salePriceGhs
        ? Math.round((1 - promo.salePriceGhs / promo.compareAtGhs) * 100)
        : null;
  const sold = Math.min(100, Math.max(0, Number(promo.soldPercent) || 0));
  const badgeLabel =
    promo.kind === "deal_discount"
      ? String(promo.tagBadge || "DISCOUNT").trim() || "DISCOUNT"
      : promo.kind === "deal_bundle"
        ? String(promo.tagBadge || "BUNDLE").trim() || "BUNDLE"
        : String(promo.tagBadge || "FLASH SALE").trim() || "FLASH SALE";

  return h(
    GlassPanel,
    {
      key: promo.id,
      className:
        "!border-sky-500/25 !bg-gradient-to-br from-violet-500/10 via-sky-500/10 to-transparent dark:!from-violet-500/15 dark:!via-sky-500/5 !p-0 overflow-hidden"
    },
    [
      h("div", { className: "relative" }, [
        img
          ? h("img", { src: img, alt: "", className: "h-36 w-full object-cover sm:h-40" })
          : h("div", { className: "flex h-36 items-center justify-center bg-night-950/50 sm:h-40" }, h(ShoppingBag, { className: "h-12 w-12 text-slate-600" })),
        h(
          "div",
          {
            className:
              "absolute left-2 top-2 z-[2] max-w-[calc(100%-6rem)] rounded-lg bg-rose-600 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-lg shadow-rose-900/35 ring-1 ring-rose-950/30"
          },
          badgeLabel.slice(0, 22)
        ),
        pct != null &&
          h(
            "div",
            {
              className:
                "absolute right-2 top-2 z-[2] rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-black text-white shadow-lg shadow-emerald-900/30"
            },
            `${pct}% OFF`
          )
      ]),
      h("div", { className: "p-4" }, [
        p?.sellerPayment?.displayName &&
          h("p", { className: "text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, String(p.sellerPayment.displayName)),
        h("p", { className: "line-clamp-2 font-semibold text-slate-900 dark:text-white" }, p?.name || promo.title),
        h("div", { className: "mt-2 flex flex-wrap items-baseline gap-2" }, [
          promo.compareAtGhs != null &&
            h("span", { className: "text-sm text-slate-400 line-through" }, formatGhc(promo.compareAtGhs)),
          h(
            "span",
            { className: "text-xl font-black text-violet-700 dark:text-violet-300" },
            formatGhc(promo.salePriceGhs ?? p?.price ?? 0)
          ),
          pct != null &&
            pct > 0 &&
            h(
              "span",
              { className: "rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-black text-emerald-700 dark:text-emerald-300" },
              `${pct}% OFF`
            )
        ]),
        timed &&
          h(
            "div",
            {
              className: `mt-2 flex items-center gap-2 font-mono text-sm font-bold ${t.urgent ? "text-rose-600 dark:text-rose-400" : "text-slate-600 dark:text-slate-400"}`
            },
            [h(AlarmClock, { className: "h-4 w-4 shrink-0" }), t.ended ? "Ended" : t.text]
          ),
        !timed && promo.kind === "deal_discount" &&
          h("p", { className: "mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400" }, "Runs until seller or admin ends · no countdown"),
        promo.kind === "flash_sale" &&
          sold > 0 &&
          h("div", { className: "mt-3" }, [
            h("div", { className: "h-2 overflow-hidden rounded-full bg-white/10" }, [
              h("div", {
                className: "h-full rounded-full bg-gradient-to-r from-sky-500 to-violet-600 transition-all",
                style: { width: `${sold}%` }
              })
            ]),
            h(
              "p",
              { className: "mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500" },
              `${sold}% claimed — don’t sleep on it`
            )
          ]),
        promo.productId &&
          h(
            Link,
            {
              to: `/products/${promo.productId}`,
              className:
                "mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-2.5 text-sm font-bold text-white shadow-md shadow-violet-900/30 hover:bg-violet-500"
            },
            addToCartLinkLabel(canBuyRailProduct(p))
          )
      ])
    ].filter(Boolean)
  );
}

function canBuyRailProduct(p) {
  if (!p || typeof p !== "object") return false;
  return (Number(p.stock) || 0) > 0;
}

/** @param {boolean} ok */
function addToCartLinkLabel(ok) {
  return ok ? "Add to cart" : "View listing";
}

function SpotlightScroller({ items }) {
  if (!items?.length) return null;
  return h(
    "div",
    { className: "relative" },
    h(
      "div",
      {
        className:
          "no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 pt-1 [-webkit-overflow-scrolling:touch]"
      },
      items.map((promo) =>
        h(
          Link,
          {
            key: promo.id,
            to: promo.linkPath?.startsWith("/") ? promo.linkPath : promo.linkPath ? `/${promo.linkPath}` : "/",
            className:
              "min-w-[min(78vw,16rem)] snap-start overflow-hidden rounded-2xl bg-gradient-to-br p-[1px] shadow-lg " +
              (promo.tagBadge === "HOT"
                ? "from-sky-400 via-violet-500 to-fuchsia-600"
                : "from-violet-400/80 via-sky-500/60 to-fuchsia-600/80")
          },
          h(
            "div",
            {
              className: "h-full rounded-[0.9rem] bg-night-950/95 p-4 backdrop-blur-sm dark:bg-night-900/95"
            },
            [
              promo.tagBadge &&
                h(
                  "span",
                  {
                    className:
                      "mb-2 inline-block rounded-md bg-violet-500/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white"
                  },
                  promo.tagBadge
                ),
              h("p", { className: "font-display text-base font-bold leading-snug text-white" }, promo.title),
              promo.subtitle && h("p", { className: "mt-2 line-clamp-2 text-xs text-slate-400" }, promo.subtitle),
              h(
                "span",
                { className: "mt-3 inline-flex items-center gap-1 text-xs font-bold text-sky-200" },
                ["View", h(ArrowRight, { className: "h-3.5 w-3.5" })]
              )
            ]
          )
        )
      )
    )
  );
}

function VendorPromoCard({ promo }) {
  return h(
    GlassPanel,
    {
      className:
        "!p-0 overflow-hidden !border-violet-500/30 !bg-gradient-to-br from-violet-600/15 to-fuchsia-600/10"
    },
    [
      h("div", { className: "relative h-28 bg-night-950/40" }, [
        promo.imageUrl
          ? h("img", { src: promo.imageUrl, alt: "", className: "h-full w-full object-cover opacity-90" })
          : h("div", { className: "flex h-full items-center justify-center" }, h(Store, { className: "h-10 w-10 text-violet-400/60" })),
        h("div", {
          className: "absolute inset-0 bg-gradient-to-t from-night-950 via-night-950/20 to-transparent"
        }),
        h(
          "div",
          { className: "absolute bottom-2 left-3 right-3" },
          h("p", { className: "truncate font-bold text-white drop-shadow" }, promo.businessName || "Vendor")
        )
      ]),
      h("div", { className: "p-4" }, [
        h("p", { className: "font-display text-sm font-bold text-slate-900 dark:text-white" }, promo.title),
        promo.subtitle && h("p", { className: "mt-1 text-xs text-slate-500 dark:text-slate-400" }, promo.subtitle),
        promo.linkPath &&
          h(
            Link,
            {
              to: promo.linkPath.startsWith("/") ? promo.linkPath : `/${promo.linkPath}`,
              className: "mt-3 block text-center text-xs font-bold text-violet-600 hover:underline dark:text-violet-300"
            },
            "Open store →"
          )
      ])
    ]
  );
}

export function BuyerDealsPage() {
  const [cartOpen, setCartOpen] = useState(false);
  const [tab, setTab] = useState("all");
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    setErr("");
    apiFetch("/api/promotions/deals-catalog")
      .then(setData)
      .catch((e) => setErr(apiErrorMessage(e, "Could not load deals")));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = data?.grouped || {};
  const banners = grouped.banners || [];
  const flash = grouped.flashSales || [];
  const bundles = grouped.bundles || [];
  const spots = grouped.spotlights || [];
  const vendors = grouped.vendorPromos || [];

  const flashFiltered = useMemo(
    () => [...flash, ...bundles].filter((p) => matchesDealKindTab(p, tab)),
    [flash, bundles, tab]
  );

  return h(f, null, [
    h(
      BuyerLayout,
      {
        key: "lay",
        hideSearch: false,
        title: "Deals",
        onOpenCart: () => setCartOpen(true)
      },
      h("div", { key: "main", className: "mx-auto w-full max-w-6xl px-4 py-6 pb-28 sm:px-6" }, [
        h("div", {
          key: "burst",
          className:
            "pointer-events-none fixed inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-violet-500/12 via-sky-500/8 to-transparent dark:from-violet-600/10 dark:via-sky-500/5"
        }),
        err &&
          h(InlineNotice, { key: "e", variant: "error", className: "mb-4", onDismiss: () => setErr("") }, err),
        h(DealHeroCarousel, { key: "hero", banners }),
        h("section", { key: "flash", className: "mt-10" }, [
          h(
            "div",
            { className: "mb-4 flex flex-wrap items-end justify-between gap-3" },
            [
              h("div", {}, [
                h(
                  "h2",
                  {
                    className:
                      "flex items-center gap-2 font-display text-xl font-black text-slate-900 dark:text-white sm:text-2xl"
                  },
                  [h(Flame, { className: "h-6 w-6 text-violet-500 dark:text-violet-400" }), "Hot deals & flash sales"]
                ),
                h(
                  "p",
                  { className: "mt-1 text-sm text-slate-500 dark:text-slate-400" },
                  "Filter by deal type — flash timers, evergreen discounts, and bundles from approved sellers."
                )
              ]),
              h(Link, { to: "/", className: "text-xs font-bold text-violet-600 hover:underline dark:text-violet-300" }, "Browse full shop →")
            ]
          ),
          h(
            "div",
            { key: "cats", className: "mb-4 flex gap-2 overflow-x-auto pb-1" },
            DEAL_KIND_TABS.map((tb) =>
              h(
                "button",
                {
                  key: tb.id,
                  type: "button",
                  onClick: () => setTab(tb.id),
                  className: `flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-xs font-bold transition sm:text-sm ${
                    tab === tb.id
                      ? "bg-violet-600 text-white shadow-md shadow-violet-900/30"
                      : "border border-slate-200/80 bg-white/80 text-slate-700 dark:border-white/10 dark:bg-night-900/60 dark:text-slate-200"
                  }`
                },
                [h(tb.icon, { className: "h-3.5 w-3.5 sm:h-4 sm:w-4" }), tb.label]
              )
            )
          ),
          flashFiltered.length === 0
            ? h(
                GlassPanel,
                { key: "emp", className: "border-dashed text-center text-sm text-slate-500" },
                "No listings in this tab right now — pick another filter or check back once admins approve new deals."
              )
            : h(
                "div",
                {
                  className: "grid gap-5 sm:grid-cols-2 xl:grid-cols-3"
                },
                flashFiltered.map((p) => h(FlashSaleCard, { key: p.id, promo: p }))
              )
        ]),
        spots.length > 0 &&
          h("section", { key: "spot", className: "mt-12" }, [
            h(
              "h2",
              {
                className:
                  "mb-4 flex items-center gap-2 font-display text-xl font-black text-slate-900 dark:text-white"
              },
              [h(BellRing, { className: "h-6 w-6 text-sky-500 dark:text-sky-400" }), "Limited-time picks"]
            ),
            h(SpotlightScroller, { items: spots })
          ]),
        vendors.length > 0 &&
          h("section", { key: "vend", className: "mt-12" }, [
            h(
              "h2",
              {
                className:
                  "mb-4 flex items-center gap-2 font-display text-xl font-black text-slate-900 dark:text-white"
              },
              [h(TrendingUp, { className: "h-6 w-6 text-violet-500 dark:text-violet-400" }), "Vendor spotlights"]
            ),
            h(
              "div",
              { className: "grid gap-5 sm:grid-cols-2 lg:grid-cols-3" },
              vendors.map((p) => h(VendorPromoCard, { key: p.id, promo: p }))
            )
          ]),
        h(InlineNotice, { key: "fee", variant: "info", className: "mt-10" }, [
          h(Percent, { className: "mr-2 inline h-4 w-4 shrink-0", "aria-hidden": true }),
          "Totals at checkout include platform and payment fees where applicable — see the cart breakdown."
        ])
      ])
    ),
    h(CartDrawer, { key: "cart", open: cartOpen, onClose: () => setCartOpen(false) })
  ]);
}

function CouponTicket({ c, onCopy, toastFn }) {
  const scope = c.scope === "vendor";
  const accent =
    scope ? "from-violet-600/90 to-indigo-900" : "from-sky-600/90 to-violet-900";
  return h(
    "div",
    {
      key: c.id,
      className:
        "relative flex flex-col overflow-hidden rounded-2xl border border-dashed border-white/25 bg-night-900/40 shadow-xl sm:flex-row"
    },
    [
      h(
        "div",
        {
          className: `relative flex shrink-0 flex-col justify-center bg-gradient-to-br px-5 py-6 text-white sm:w-44 ${accent}`
        },
        [
          h("div", {
            className: "absolute left-0 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-night-950 sm:left-full"
          }),
          c.freeDelivery ? h(Truck, { className: "h-8 w-8 opacity-90" }) : h(BadgePercent, { className: "h-8 w-8 opacity-90" }),
          h("p", { className: "mt-3 font-mono text-lg font-black tracking-wide" }, c.code || "DEAL"),
          h("p", { className: "text-[10px] font-bold uppercase tracking-widest text-white/70" }, scope ? "Vendor" : "Global")
        ]
      ),
      h("div", { className: "flex flex-1 flex-col justify-center border-l border-dashed border-white/10 px-5 py-5" }, [
        h("p", { className: "font-semibold text-slate-900 dark:text-white" }, c.title),
        c.subtitle && h("p", { className: "mt-1 text-sm text-slate-600 dark:text-slate-400" }, c.subtitle),
        h("div", { className: "mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500" }, [
          c.minOrderGhs != null && c.minOrderGhs > 0
            ? h("span", { className: "rounded-md bg-white/10 px-2 py-0.5" }, `Min ${formatGhc(c.minOrderGhs)}`)
            : null,
          h("span", { className: "rounded-md bg-white/10 px-2 py-0.5" }, `Until ${new Date(c.endsAt).toLocaleDateString()}`)
        ]),
        h(
          "div",
          { className: "mt-4 flex flex-wrap gap-2" },
          [
            h(
              Button,
              {
                type: "button",
                variant: "primary",
                className: "!rounded-xl text-sm",
                onClick: () =>
                  onCopy(c.code).then(() => toastFn("Code copied — paste at checkout", { variant: "success" }))
              },
              [h(Copy, { className: "mr-1.5 h-4 w-4" }), "Copy code"]
            ),
            h(
              Link,
              {
                to: "/checkout",
                className: "self-center text-xs font-bold text-violet-600 hover:underline dark:text-violet-300"
              },
              "Go to checkout →"
            )
          ]
        )
      ])
    ]
  );
}

export function BuyerCouponsPage() {
  const { toast } = useNotice();
  const [cartOpen, setCartOpen] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    setErr("");
    apiFetch("/api/promotions/coupons-catalog")
      .then(setData)
      .catch((e) => setErr(apiErrorMessage(e, "Could not load coupons")));
  }, []);

  const coupons = data?.coupons || [];
  const stats = data?.savingsStats;

  const filtered = useMemo(() => {
    if (filter === "global") return coupons.filter((c) => c.scope === "global");
    if (filter === "vendor") return coupons.filter((c) => c.scope === "vendor");
    return coupons;
  }, [coupons, filter]);

  const onCopy = async (code) => {
    const t = String(code || "").trim();
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      window.prompt("Copy this code:", t);
    }
  };

  return h(f, null, [
    h(
      BuyerLayout,
      {
        key: "lay",
        hideSearch: false,
        title: "Coupons",
        onOpenCart: () => setCartOpen(true)
      },
      h("div", { key: "main", className: "mx-auto w-full max-w-3xl px-4 py-6 pb-28 sm:px-6" }, [
        h("div", {
          key: "wash",
          className:
            "pointer-events-none fixed inset-x-0 top-0 -z-10 h-64 bg-gradient-to-b from-violet-500/10 via-sky-500/8 to-transparent dark:from-violet-600/10 dark:via-sky-500/5"
        }),
        err && h(InlineNotice, { key: "e", variant: "error", className: "mb-4", onDismiss: () => setErr("") }, err),
        h("div", { key: "stats", className: "grid gap-3 sm:grid-cols-3" }, [
          h(
            GlassPanel,
            { className: "!border-sky-500/25 !bg-sky-500/5 !p-4 dark:!bg-sky-950/20" },
            [
              h("p", { className: "text-[10px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-300" }, "Est. saved"),
              h(
                "p",
                { className: "mt-1 font-display text-2xl font-black text-slate-900 dark:text-white" },
                stats?.savedThisMonthGhs != null ? formatGhc(stats.savedThisMonthGhs) : "—"
              ),
              h("p", { className: "text-[10px] text-slate-500" }, "When checkout tracks codes")
            ]
          ),
          h(
            GlassPanel,
            { className: "!border-violet-500/25 !p-4" },
            [
              h("p", { className: "text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-300" }, "Active"),
              h(
                "p",
                { className: "mt-1 font-display text-2xl font-black text-slate-900 dark:text-white" },
                String(stats?.activeCount ?? coupons.length)
              ),
              h("p", { className: "text-[10px] text-slate-500" }, "Live codes below")
            ]
          ),
          h(
            GlassPanel,
            {
              className:
                "!border-slate-200/90 !bg-white/70 !p-4 dark:!border-white/10 dark:!bg-night-900/40"
            },
            [
              h("p", { className: "text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400" }, "Your wallet"),
              h("p", { className: "mt-1 font-display text-2xl font-black text-slate-900 dark:text-white" }, "Promos"),
              h("p", { className: "text-[10px] text-slate-500" }, "Copy before you pay")
            ]
          )
        ]),
        h("div", { key: "tabs", className: "mt-6 flex flex-wrap gap-2" }, [
          { id: "all", label: "All" },
          { id: "global", label: "Global" },
          { id: "vendor", label: "Stores" }
        ].map((t) =>
          h(
            "button",
            {
              key: t.id,
              type: "button",
              onClick: () => setFilter(t.id),
              className: `rounded-full px-4 py-2 text-xs font-bold transition sm:text-sm ${
                filter === t.id
                  ? "bg-violet-600 text-white shadow-md"
                  : "border border-slate-200 bg-white/80 text-slate-700 dark:border-white/10 dark:bg-night-900/70 dark:text-slate-200"
              }`
            },
            t.label
          )
        )),
        h("section", { key: "list", className: "mt-8 space-y-5" }, [
          filtered.length === 0 &&
            h(
              GlassPanel,
              { className: "text-center text-sm text-slate-500" },
              "No coupons in this tab yet. Approved vendor & platform codes appear here."
            ),
          filtered.map((c) => h(CouponTicket, { key: c.id, c, onCopy, toastFn: toast }))
        ]),
        h(
          GlassPanel,
          {
            key: "auto",
            className: "mt-8 !border-sky-500/30 !bg-sky-500/10 dark:!bg-sky-950/25"
          },
          [
            h("div", { className: "flex items-start gap-3" }, [
              h(Sparkles, { className: "h-5 w-5 shrink-0 text-sky-500 dark:text-sky-400" }),
              h("div", {}, [
                h("p", { className: "font-semibold text-slate-900 dark:text-white" }, "Best coupon auto-applied"),
                h(
                  "p",
                  { className: "mt-1 text-sm text-slate-600 dark:text-slate-400" },
                  "Ships on the roadmap: we’ll maximize savings at Paystack checkout automatically."
                )
              ])
            ])
          ]
        ),
        h(
          GlassPanel,
          {
            key: "daily",
            className: "mt-6 flex flex-wrap items-center justify-between gap-4 !border-white/15 !bg-night-900/30 dark:!border-white/10"
          },
          [
            h("div", { className: "flex items-center gap-3" }, [
              h(Gift, { className: "h-10 w-10 text-violet-400" }),
              h("div", {}, [
                h("p", { className: "font-bold text-slate-900 dark:text-white" }, "Daily check-in & spins"),
                h("p", { className: "text-sm text-slate-600 dark:text-slate-400" }, "Extra addictive rewards — planned as a follow-up.")
              ])
            ]),
            h(Button, { type: "button", variant: "outline", className: "!rounded-2xl", disabled: true }, "Soon")
          ]
        )
      ])
    ),
    h(CartDrawer, { key: "cart", open: cartOpen, onClose: () => setCartOpen(false) })
  ]);
}
