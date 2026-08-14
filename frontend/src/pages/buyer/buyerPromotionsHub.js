import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgePercent,
  BellRing,
  Copy,
  Flame,
  Gift,
  Percent,
  ShoppingBag,
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
import { usePromoCountdown, isPerpetualPromoEnd, PromoTimerPills } from "utils/promoCountdown";

/** Deal heroes — warm sale energy, still readable on the buyer shell. */
const GRADIENTS = {
  violet: "from-orange-500 via-rose-500 to-violet-700",
  sunset: "from-amber-400 via-orange-500 to-rose-600",
  ocean: "from-sky-500 via-cyan-600 to-indigo-800",
  ember: "from-orange-500 via-rose-600 to-fuchsia-800",
  moss: "from-sky-500 via-teal-600 to-indigo-800",
  berry: "from-rose-600 via-orange-500 to-amber-500"
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
          "relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 via-rose-500 to-amber-500 p-8 shadow-lg shadow-orange-900/20"
      },
      [
        h("div", { className: "deal-hero-wash pointer-events-none absolute inset-0 bg-gradient-to-br from-orange-400/40 via-transparent to-rose-700/40", "aria-hidden": true }),
        h("span", { className: "relative inline-flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-100" }, [
          h(Flame, { className: "h-3.5 w-3.5 text-amber-300" }),
          "Hot deals"
        ]),
        h("p", { className: "relative mt-3 font-display text-2xl font-black text-white sm:text-3xl" }, "Save big on flash sales"),
        h("p", { className: "relative mt-2 max-w-lg text-sm text-white/90" }, "Timed drops, extra off, and bundles from stores you already shop."),
        h(
          Link,
          {
            to: "/",
            className: "relative mt-5 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-orange-700 shadow-md"
          },
          ["Browse the shop", h(ArrowRight, { className: "h-4 w-4" })]
        )
      ]
    );

  const b = banners[idx];
  return h(HeroSlideInner, { b, idx, setIdx, banners });
}

/** Sub-component so hooks follow rules */

function HeroSlideInner({ b, idx, setIdx, banners }) {
  const timed = !!(b.endsAt && !isPerpetualPromoEnd(b.endsAt));
  const t = usePromoCountdown(timed ? b.endsAt : undefined);
  return h("div", { className: "relative overflow-hidden rounded-3xl shadow-lg shadow-orange-900/20 ring-1 ring-orange-400/20" }, [
    h("div", {
      className: `deal-hero-wash absolute inset-0 bg-gradient-to-br opacity-95 ${gradientClass(b.gradientKey)}`,
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
      { className: "relative z-[1] flex min-h-[220px] flex-col justify-end p-6 sm:min-h-[260px] sm:p-8" },
      [
        b.tagBadge &&
          h(
            "span",
            {
              className:
                "mb-2 inline-flex w-fit items-center gap-1 rounded-full bg-black/35 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-100 ring-1 ring-white/25"
            },
            [h(Flame, { className: "h-3 w-3 text-amber-300" }), b.tagBadge]
          ),
        h("h2", { className: "font-display text-2xl font-black leading-tight text-white sm:text-4xl" }, b.title),
        b.subtitle && h("p", { className: "mt-2 max-w-xl text-sm text-white/90 sm:text-base" }, b.subtitle),
        h("div", { className: "mt-5 flex flex-wrap items-center gap-3" }, [
          timed
            ? h(PromoTimerPills, { secondsLeft: t.secondsLeft, ended: t.ended, urgent: t.urgent })
            : null,
          b.linkPath &&
            h(
              Link,
              {
                to: b.linkPath.startsWith("/") ? b.linkPath : `/${b.linkPath}`,
                className:
                  "inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-black text-orange-700 shadow-lg shadow-black/20"
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
        "!border-orange-300/50 !bg-white !p-0 overflow-hidden shadow-md dark:!border-orange-500/25 dark:!bg-night-900/70"
    },
    [
      h("div", { className: "relative" }, [
        img
          ? h("img", { src: img, alt: "", className: "h-44 w-full object-cover sm:h-52" })
          : h("div", { className: "flex h-44 items-center justify-center bg-orange-50 dark:bg-night-950/50 sm:h-52" }, h(ShoppingBag, { className: "h-12 w-12 text-orange-300" })),
        h(
          "div",
          {
            className:
              "absolute left-2 top-2 z-[2] max-w-[calc(100%-6.5rem)] rounded-lg bg-rose-600 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-lg"
          },
          badgeLabel.slice(0, 22)
        ),
        pct != null &&
          h(
            "div",
            {
              className:
                "absolute right-2 top-2 z-[2] rounded-lg bg-amber-300 px-2 py-1 text-sm font-black text-rose-950 shadow-lg"
            },
            `${pct}% OFF`
          )
      ]),
      h("div", { className: "p-4" }, [
        p?.sellerPayment?.displayName &&
          h("p", { className: "text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, String(p.sellerPayment.displayName)),
        h("p", { className: "line-clamp-2 font-display text-base font-bold text-slate-900 dark:text-white" }, p?.name || promo.title),
        h("div", { className: "mt-2 flex flex-wrap items-baseline gap-2" }, [
          promo.compareAtGhs != null &&
            h("span", { className: "text-sm font-semibold text-slate-400 line-through" }, formatGhc(promo.compareAtGhs)),
          h(
            "span",
            { className: "text-2xl font-black text-orange-600 dark:text-amber-300" },
            formatGhc(promo.salePriceGhs ?? p?.price ?? 0)
          )
        ]),
        pct != null &&
          pct > 0 &&
          promo.compareAtGhs != null &&
          h(
            "p",
            { className: "mt-1 text-xs font-bold text-emerald-700 dark:text-emerald-300" },
            `You save ${formatGhc(Math.max(0, promo.compareAtGhs - (promo.salePriceGhs ?? 0)))}`
          ),
        timed &&
          h("div", { className: "mt-3" }, [
            h(PromoTimerPills, { secondsLeft: t.secondsLeft, ended: t.ended, urgent: t.urgent, compact: true })
          ]),
        !timed && promo.kind === "deal_discount" &&
          h("p", { className: "mt-2 text-xs font-bold uppercase tracking-wide text-orange-600 dark:text-amber-400" }, "On now — no rush timer"),
        promo.kind === "flash_sale" &&
          sold > 0 &&
          h("div", { className: "mt-3" }, [
            h("div", { className: "h-2 overflow-hidden rounded-full bg-orange-100 dark:bg-white/10" }, [
              h("div", {
                className: "h-full rounded-full bg-gradient-to-r from-orange-500 to-rose-500 transition-all",
                style: { width: `${sold}%` }
              })
            ]),
            h(
              "p",
              { className: "mt-1 text-[10px] font-bold uppercase tracking-wide text-orange-700 dark:text-amber-300" },
              `${sold}% claimed — don’t sleep on it`
            )
          ]),
        promo.productId &&
          h(
            Link,
            {
              to: `/products/${promo.productId}`,
              className:
                "mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-orange-500 py-2.5 text-sm font-black text-white shadow-md shadow-orange-900/25 hover:bg-orange-600"
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
        "!p-0 overflow-hidden !border-orange-300/50 !bg-white dark:!border-orange-500/25 dark:!bg-night-900/70"
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
              className: "mt-3 inline-flex w-full items-center justify-center rounded-full bg-orange-500 py-2 text-xs font-black text-white hover:bg-orange-600"
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
            "pointer-events-none fixed inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-orange-400/20 via-rose-400/10 to-transparent dark:from-orange-600/15 dark:via-rose-600/8"
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
                  [h(Flame, { className: "h-6 w-6 text-orange-500" }), "Grab these before they’re gone"]
                ),
                h(
                  "p",
                  { className: "mt-1 text-sm text-slate-500 dark:text-slate-400" },
                  "Flash timers, extra-off prices, and bundles — tap a card to shop."
                )
              ]),
              h(Link, { to: "/", className: "text-xs font-black text-orange-600 hover:underline dark:text-amber-300" }, "Browse full shop →")
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
                  className: `flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-xs font-black transition sm:text-sm ${
                    tab === tb.id
                      ? "bg-orange-500 text-white shadow-md shadow-orange-900/25"
                      : "border border-orange-200/80 bg-white text-orange-800 dark:border-white/10 dark:bg-night-900/60 dark:text-amber-100"
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
          ])
      ])
    ),
    h(CartDrawer, { key: "cart", open: cartOpen, onClose: () => setCartOpen(false) })
  ]);
}

function CouponTicket({ c, onCopy, toastFn }) {
  const scope = c.scope === "vendor";
  const accent = scope ? "from-orange-500 to-rose-600" : "from-amber-400 to-orange-600";
  return h(
    "div",
    {
      key: c.id,
      className:
        "relative flex flex-col overflow-hidden rounded-2xl border-2 border-dashed border-orange-300 bg-white shadow-lg dark:border-orange-500/40 dark:bg-night-900 sm:flex-row"
    },
    [
      h(
        "div",
        {
          className: `relative flex shrink-0 flex-col justify-center bg-gradient-to-br px-5 py-6 text-white sm:w-48 ${accent}`
        },
        [
          h("div", {
            className: "absolute left-0 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-100 dark:bg-night-950 sm:left-full"
          }),
          c.freeDelivery ? h(Truck, { className: "h-8 w-8 opacity-95" }) : h(BadgePercent, { className: "h-8 w-8 opacity-95" }),
          h("p", { className: "mt-3 font-mono text-xl font-black tracking-wide" }, c.code || "DEAL"),
          h("p", { className: "text-[10px] font-black uppercase tracking-widest text-white/80" }, scope ? "Store code" : "Sitewide")
        ]
      ),
      h("div", { className: "flex flex-1 flex-col justify-center border-l border-dashed border-orange-200 px-5 py-5 dark:border-orange-500/20" }, [
        h("p", { className: "font-display text-base font-bold text-slate-900 dark:text-white" }, c.title),
        c.subtitle && h("p", { className: "mt-1 text-sm text-slate-600 dark:text-slate-400" }, c.subtitle),
        h("div", { className: "mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-orange-800 dark:text-amber-200" }, [
          c.minOrderGhs != null && c.minOrderGhs > 0
            ? h("span", { className: "rounded-md bg-orange-100 px-2 py-0.5 dark:bg-orange-500/20" }, `Min ${formatGhc(c.minOrderGhs)}`)
            : null,
          h("span", { className: "rounded-md bg-orange-100 px-2 py-0.5 dark:bg-orange-500/20" }, `Until ${new Date(c.endsAt).toLocaleDateString()}`)
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
                className: "!rounded-full !bg-orange-500 text-sm hover:!bg-orange-600",
                onClick: () =>
                  onCopy(c.code).then(() => toastFn("Code copied — paste at checkout", { variant: "success" }))
              },
              [h(Copy, { className: "mr-1.5 h-4 w-4" }), "Copy code"]
            ),
            h(
              Link,
              {
                to: "/checkout",
                className: "self-center text-xs font-black text-orange-600 hover:underline dark:text-amber-300"
              },
              "Use at checkout →"
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
            "pointer-events-none fixed inset-x-0 top-0 -z-10 h-64 bg-gradient-to-b from-orange-400/18 via-amber-300/10 to-transparent dark:from-orange-600/15 dark:via-amber-500/8"
        }),
        err && h(InlineNotice, { key: "e", variant: "error", className: "mb-4", onDismiss: () => setErr("") }, err),
        h(
          "div",
          {
            key: "hero",
            className:
              "mb-6 overflow-hidden rounded-3xl bg-gradient-to-r from-orange-500 via-amber-500 to-rose-500 p-6 text-white shadow-lg sm:p-8"
          },
          [
            h("p", { className: "text-[10px] font-black uppercase tracking-[0.2em] text-amber-100" }, "Save at checkout"),
            h("h1", { className: "mt-1 font-display text-2xl font-black sm:text-3xl" }, "Coupon codes"),
            h("p", { className: "mt-2 max-w-lg text-sm text-white/90" }, "Copy a code, then paste it when you pay. Store codes work on that vendor’s items.")
          ]
        ),
        h("div", { key: "stats", className: "grid gap-3 sm:grid-cols-2" }, [
          h(
            GlassPanel,
            { className: "!border-orange-300/50 !bg-orange-50 !p-4 dark:!border-orange-500/25 dark:!bg-orange-950/25" },
            [
              h("p", { className: "text-[10px] font-black uppercase tracking-wider text-orange-700 dark:text-amber-300" }, "Est. saved"),
              h(
                "p",
                { className: "mt-1 font-display text-2xl font-black text-slate-900 dark:text-white" },
                stats?.savedThisMonthGhs != null ? formatGhc(stats.savedThisMonthGhs) : "—"
              ),
              h("p", { className: "text-[10px] text-slate-500" }, "From codes used at checkout")
            ]
          ),
          h(
            GlassPanel,
            { className: "!border-orange-200 !p-4 dark:!border-orange-500/20" },
            [
              h("p", { className: "text-[10px] font-black uppercase tracking-wider text-orange-700 dark:text-amber-300" }, "Live now"),
              h(
                "p",
                { className: "mt-1 font-display text-2xl font-black text-slate-900 dark:text-white" },
                String(stats?.activeCount ?? coupons.length)
              ),
              h("p", { className: "text-[10px] text-slate-500" }, "Tap copy, then checkout")
            ]
          )
        ]),
        h("div", { key: "tabs", className: "mt-6 flex flex-wrap gap-2" }, [
          { id: "all", label: "All" },
          { id: "global", label: "Sitewide" },
          { id: "vendor", label: "Stores" }
        ].map((t) =>
          h(
            "button",
            {
              key: t.id,
              type: "button",
              onClick: () => setFilter(t.id),
              className: `rounded-full px-4 py-2 text-xs font-black transition sm:text-sm ${
                filter === t.id
                  ? "bg-orange-500 text-white shadow-md"
                  : "border border-orange-200 bg-white text-orange-800 dark:border-white/10 dark:bg-night-900/70 dark:text-amber-100"
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
              "No coupons in this tab yet. Check back soon — new codes drop here."
            ),
          filtered.map((c) => h(CouponTicket, { key: c.id, c, onCopy, toastFn: toast }))
        ])
      ])
    ),
    h(CartDrawer, { key: "cart", open: cartOpen, onClose: () => setCartOpen(false) })
  ]);
}
