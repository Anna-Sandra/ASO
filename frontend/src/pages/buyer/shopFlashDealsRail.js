import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, Flame, ShoppingBag } from "lucide-react";
import { apiFetch } from "services/api";
import { h } from "utils/h";
import { SITE_NAME, SITE_AUDIENCE_TAGLINE, SITE_TAGLINE } from "config/brand";
import { formatGhc } from "utils/money";
import { buyerDisplayPrice } from "utils/checkoutPricing";
import { useCheckoutPricingOptions } from "hooks/useCheckoutPricing";
import { usePromoCountdown, isPerpetualPromoEnd, PromoTimerPills } from "utils/promoCountdown";

const PROMO_GRADIENTS = {
  violet: "from-orange-500 via-rose-500 to-violet-700",
  sunset: "from-amber-400 via-orange-500 to-rose-600",
  ocean: "from-sky-500 via-cyan-600 to-indigo-800",
  ember: "from-orange-500 via-rose-600 to-fuchsia-800",
  moss: "from-sky-500 via-teal-600 to-indigo-800",
  berry: "from-rose-600 via-orange-500 to-amber-500"
};

function promoGradientClass(key) {
  return PROMO_GRADIENTS[key] || PROMO_GRADIENTS.violet;
}

/** Always-on shop home slides — visible even with no admin promos or deals. */
const STATIC_SHOP_SLIDES = [
  {
    id: "welcome",
    gradientKey: "violet",
    tagBadge: SITE_NAME,
    title: "Food, fashion, tech & more",
    subtitle: SITE_TAGLINE,
    linkTo: "/#buyer-shop-grid",
    cta: "Browse shop"
  },
  {
    id: "local-stores",
    gradientKey: "ocean",
    tagBadge: "LOCAL STORES",
    title: "Discover trusted sellers nearby",
    subtitle: SITE_AUDIENCE_TAGLINE,
    linkTo: "/#buyer-shop-grid",
    cta: "See menu items"
  },
  {
    id: "deals-hub",
    gradientKey: "sunset",
    tagBadge: "HOT DEALS",
    title: "Flash sales & huge discounts",
    subtitle: "Limited-time offers from verified vendors — grab them before they go.",
    linkTo: "/deals",
    cta: "Shop deals"
  },
  {
    id: "food-menu",
    gradientKey: "ember",
    tagBadge: "FOOD",
    title: "Order from local restaurants",
    subtitle: "Browse menus and call or buy in a few taps",
    linkTo: "/#buyer-shop-grid",
    cta: "Find food"
  }
];

function slideFromBanner(b) {
  if (!b?.title) return null;
  return {
    id: `banner_${b.id}`,
    gradientKey: b.gradientKey || "sunset",
    tagBadge: b.tagBadge || "FEATURED",
    title: b.title,
    subtitle: b.subtitle || "",
    imageUrl: b.imageUrl || "",
    linkTo: b.linkPath?.startsWith("/") ? b.linkPath : b.linkPath ? `/${b.linkPath}` : "/deals",
    endsAt: b.endsAt,
    cta: "See offer"
  };
}

function slideFromFlash(promo) {
  if (!promo) return null;
  const p = promo.product;
  const pct =
    promo.discountPercent != null
      ? Math.round(promo.discountPercent)
      : promo.compareAtGhs && promo.salePriceGhs
        ? Math.round((1 - promo.salePriceGhs / promo.compareAtGhs) * 100)
        : null;
  return {
    id: `flash_${promo.id}`,
    gradientKey: "berry",
    tagBadge: String(promo.tagBadge || "FLASH SALE").trim() || "FLASH SALE",
    title: promo.title || p?.name || "Limited-time deal",
    subtitle: p?.name && promo.title ? p.name : "Tap to grab this deal",
    imageUrl: p?.imageUrl || "",
    linkTo: promo.productId ? `/products/${promo.productId}` : "/deals",
    endsAt: promo.endsAt,
    cta: "Grab deal",
    salePriceGhs: promo.salePriceGhs ?? p?.price ?? null,
    compareAtGhs: promo.compareAtGhs ?? null,
    discountPercent: pct
  };
}

function slideFromProduct(p) {
  if (!p?.id || !p?.name) return null;
  const img = p.imageUrls?.[0] || p.imageUrl || "";
  const price = Number(p.price);
  const cmp = Number(p.compareAtPrice);
  const strike = Number.isFinite(cmp) && Number.isFinite(price) && cmp > price && price > 0;
  const pct = strike ? Math.round(((cmp - price) / cmp) * 100) : null;
  return {
    id: `pick_${p.id}`,
    gradientKey: strike ? "sunset" : "moss",
    tagBadge: strike && pct ? `${pct}% OFF` : "POPULAR",
    title: p.name,
    subtitle: "",
    imageUrl: img,
    linkTo: `/products/${p.id}`,
    cta: "View item",
    salePriceGhs: Number.isFinite(price) ? price : null,
    compareAtGhs: strike ? cmp : null,
    discountPercent: pct
  };
}

function buyerGhs(vendorGhs, pricingOpts) {
  const n = Number(vendorGhs);
  if (!Number.isFinite(n) || n <= 0) return null;
  return buyerDisplayPrice(n, pricingOpts, 1);
}

function badgeAlreadyShowsOff(label) {
  return /%\s*off/i.test(String(label || ""));
}

function ShopHeroSlide({ slide, idx, setIdx, slides, pricingOpts }) {
  const timed = !!(slide.endsAt && !isPerpetualPromoEnd(slide.endsAt));
  const t = usePromoCountdown(timed ? slide.endsAt : undefined);
  const to = slide.linkTo?.startsWith("/") ? slide.linkTo : slide.linkTo ? `/${slide.linkTo}` : "/";
  const pct = slide.discountPercent != null ? Math.round(slide.discountPercent) : null;
  const showOffChip = pct != null && pct > 0 && !badgeAlreadyShowsOff(slide.tagBadge);
  const saleBuyer = buyerGhs(slide.salePriceGhs, pricingOpts);
  const compareBuyer = buyerGhs(slide.compareAtGhs, pricingOpts);
  const hasPrice = saleBuyer != null;

  const go = (dir, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!slides.length) return;
    setIdx((i) => (i + dir + slides.length) % slides.length);
  };

  return h("div", { className: "relative" }, [
    h(
      Link,
      {
        to,
        className:
          "group relative block overflow-hidden rounded-3xl shadow-lg shadow-orange-900/20 ring-1 ring-orange-500/25 transition hover:ring-orange-400/50 dark:shadow-black/40 dark:ring-white/10"
      },
      [
        h("div", {
          className: `deal-hero-wash absolute inset-0 bg-gradient-to-br ${promoGradientClass(slide.gradientKey)}`,
          "aria-hidden": true
        }),
        h("div", {
          className: "pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/20 blur-3xl",
          "aria-hidden": true
        }),
        h(
          "div",
          {
            className:
              "relative z-[1] grid min-h-[11.5rem] grid-cols-1 sm:min-h-[13.5rem] sm:grid-cols-[1fr_minmax(9rem,14rem)] md:min-h-[15.5rem]"
          },
          [
            h("div", { className: "flex flex-col justify-center px-4 py-5 sm:px-6 sm:py-6 md:px-8" }, [
              h("div", { className: "mb-2 flex flex-wrap items-center gap-2" }, [
                slide.tagBadge
                  ? h(
                      "span",
                      {
                        className:
                          "inline-flex w-fit items-center gap-1 rounded-full bg-black/35 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-100 ring-1 ring-white/25"
                      },
                      [h(Flame, { className: "h-3 w-3 text-amber-300", "aria-hidden": true }), slide.tagBadge]
                    )
                  : null,
                showOffChip
                  ? h(
                      "span",
                      {
                        className:
                          "sale-off-badge inline-flex rounded-lg bg-amber-300 px-2 py-1 text-[11px] font-black text-rose-950 shadow-md"
                      },
                      `${pct}% OFF`
                    )
                  : null
              ]),
              h(
                "p",
                {
                  className:
                    "line-clamp-2 font-display text-xl font-black leading-tight text-white drop-shadow-sm sm:text-2xl md:text-3xl"
                },
                slide.title
              ),
              slide.subtitle
                ? h("p", { className: "mt-1.5 line-clamp-2 max-w-xl text-sm text-white/90 sm:text-[15px]" }, slide.subtitle)
                : null,
              hasPrice
                ? h("div", { className: "mt-3 flex flex-wrap items-baseline gap-2" }, [
                    compareBuyer != null && compareBuyer > saleBuyer
                      ? h("span", { className: "text-sm font-semibold text-white/60 line-through" }, formatGhc(compareBuyer))
                      : null,
                    h(
                      "span",
                      { className: "font-display text-2xl font-black text-amber-200 drop-shadow sm:text-3xl" },
                      formatGhc(saleBuyer)
                    )
                  ])
                : null,
              h("div", { className: "mt-4 flex flex-wrap items-center gap-3" }, [
                timed
                  ? h(PromoTimerPills, {
                      secondsLeft: t.secondsLeft,
                      ended: t.ended,
                      urgent: t.urgent
                    })
                  : null,
                h(
                  "span",
                  {
                    className:
                      "inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-black text-orange-700 shadow-lg shadow-black/20 transition group-hover:bg-amber-100"
                  },
                  [slide.cta || "Shop now", h(ArrowRight, { className: "h-4 w-4", "aria-hidden": true })]
                )
              ])
            ]),
            slide.imageUrl
              ? h(
                  "div",
                  {
                    className: "relative hidden overflow-hidden sm:block",
                    "aria-hidden": true
                  },
                  [
                    h("img", {
                      src: slide.imageUrl,
                      alt: "",
                      className:
                        "absolute inset-0 h-full w-full object-cover opacity-95 transition duration-500 group-hover:scale-105"
                    }),
                    h("div", {
                      className: "absolute inset-0 bg-gradient-to-l from-transparent via-transparent to-black/25"
                    })
                  ]
                )
              : null
          ]
        )
      ]
    ),
    slides.length > 1
      ? h("div", { className: "pointer-events-none absolute inset-x-2 top-1/2 z-[2] flex -translate-y-1/2 justify-between sm:inset-x-3" }, [
          h("button", {
            key: "prev",
            type: "button",
            className:
              "pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm ring-1 ring-white/25 transition hover:bg-black/60",
            onClick: (e) => go(-1, e),
            "aria-label": "Previous highlight"
          }, h(ChevronLeft, { className: "h-5 w-5" })),
          h("button", {
            key: "next",
            type: "button",
            className:
              "pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm ring-1 ring-white/25 transition hover:bg-black/60",
            onClick: (e) => go(1, e),
            "aria-label": "Next highlight"
          }, h(ChevronRight, { className: "h-5 w-5" }))
        ])
      : null,
    slides.length > 1
      ? h(
          "div",
          { className: "absolute bottom-3 left-1/2 z-[2] flex -translate-x-1/2 gap-1.5" },
          slides.map((_, i) =>
            h("button", {
              key: i,
              type: "button",
              onClick: (e) => {
                e.preventDefault();
                e.stopPropagation();
                setIdx(i);
              },
              className: `h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-white" : "w-1.5 bg-white/45 hover:bg-white/70"}`,
              "aria-label": `Highlight slide ${i + 1}`
            })
          )
        )
      : null
  ]);
}

function mergeHighlightSlides(dynamic) {
  const seen = new Set();
  const out = [];
  for (const s of dynamic) {
    if (!s?.id || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  for (const s of STATIC_SHOP_SLIDES) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out.slice(0, 8);
}

/** Rotating shop hero — live deals first, then always-on shop tips. */
export function ShopHomePromoCarousel() {
  const pricingOpts = useCheckoutPricingOptions();
  const [slides, setSlides] = useState(() => STATIC_SHOP_SLIDES);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiFetch("/api/promotions/deals-catalog").catch(() => null),
      apiFetch("/api/products/recommended?limit=12").catch(() => null)
    ]).then(([deals, rec]) => {
      if (cancelled) return;
      const dynamic = [];
      const banners = deals?.grouped?.banners;
      if (Array.isArray(banners)) {
        for (const b of banners.slice(0, 3)) {
          const s = slideFromBanner(b);
          if (s) dynamic.push(s);
        }
      }
      const flash = deals?.grouped?.flashSales;
      if (Array.isArray(flash)) {
        for (const p of flash.slice(0, 3)) {
          const s = slideFromFlash(p);
          if (s) dynamic.push(s);
        }
      }
      const rows = rec?.rows;
      if (Array.isArray(rows)) {
        for (const row of rows.slice(0, 2)) {
          for (const p of (row.products || []).slice(0, 1)) {
            const s = slideFromProduct(p);
            if (s) dynamic.push(s);
          }
        }
      }
      setSlides(mergeHighlightSlides(dynamic));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setIdx(0);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length <= 1) return undefined;
    const id = window.setInterval(() => setIdx((i) => (i + 1) % slides.length), 6500);
    return () => clearInterval(id);
  }, [slides]);

  const safeIdx = slides.length ? idx % slides.length : 0;

  return h(
    "section",
    { key: "shop-highlight-carousel", className: "mb-2 w-full", "aria-label": "Shop highlights" },
    h(ShopHeroSlide, { slide: slides[safeIdx], idx: safeIdx, setIdx, slides, pricingOpts })
  );
}

function HomeFlashCard({ promo, pricingOpts }) {
  const p = promo.product;
  const img = p?.imageUrl;
  const pct =
    promo.discountPercent != null
      ? Math.round(promo.discountPercent)
      : promo.compareAtGhs && promo.salePriceGhs
        ? Math.round((1 - promo.salePriceGhs / promo.compareAtGhs) * 100)
        : null;
  const to = promo.productId ? `/products/${promo.productId}` : "/deals";
  const badgeLabel =
    promo.kind === "deal_discount"
      ? String(promo.tagBadge || "DISCOUNT").trim() || "DISCOUNT"
      : promo.kind === "deal_bundle"
        ? String(promo.tagBadge || "BUNDLE").trim() || "BUNDLE"
        : String(promo.tagBadge || "FLASH SALE").trim() || "FLASH SALE";
  const showKindBadge = !badgeAlreadyShowsOff(badgeLabel);
  const showOffChip = pct != null && pct > 0 && !badgeAlreadyShowsOff(badgeLabel);
  const saleBuyer = buyerGhs(promo.salePriceGhs ?? p?.price, pricingOpts);
  const compareBuyer = buyerGhs(promo.compareAtGhs, pricingOpts);

  return h(
    Link,
    {
      to,
      className:
        "group min-w-[12.5rem] max-w-[13.5rem] shrink-0 snap-start overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-orange-200/70 transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-orange-400/70 dark:bg-night-900 dark:ring-orange-500/25"
    },
    [
      h("div", { className: "relative" }, [
        img
          ? h("img", { src: img, alt: "", className: "h-32 w-full object-cover transition duration-500 group-hover:scale-105 sm:h-36" })
          : h(
              "div",
              { className: "flex h-32 w-full items-center justify-center bg-orange-50 dark:bg-night-950/50 sm:h-36" },
              h(ShoppingBag, { className: "h-8 w-8 text-orange-300" })
            ),
        showKindBadge
          ? h(
              "div",
              {
                className:
                  "pointer-events-none absolute left-2 top-2 z-[2] max-w-[calc(100%-5.5rem)] rounded-md bg-rose-600 px-1.5 py-1 text-[10px] font-black uppercase leading-tight tracking-wide text-white shadow-md"
              },
              badgeLabel.slice(0, 18)
            )
          : null,
        showOffChip || (!showKindBadge && pct != null && pct > 0)
          ? h(
              "div",
              {
                className:
                  "absolute right-2 top-2 z-[2] rounded-lg bg-amber-300 px-1.5 py-1 text-[11px] font-black text-rose-950 shadow-md"
              },
              `${pct}% OFF`
            )
          : null
      ]),
      h("div", { className: "border-t border-orange-100/80 bg-gradient-to-br from-orange-50/90 to-white p-2.5 dark:border-white/10 dark:from-orange-950/30 dark:to-night-900" }, [
        h(
          "p",
          { className: "line-clamp-2 text-xs font-bold leading-snug text-slate-900 dark:text-white sm:text-[13px]" },
          p?.name || promo.title
        ),
        h("div", { className: "mt-1.5 flex flex-wrap items-baseline gap-1.5" }, [
          compareBuyer != null && saleBuyer != null && compareBuyer > saleBuyer
            ? h("span", { className: "text-[11px] font-semibold text-slate-400 line-through" }, formatGhc(compareBuyer))
            : null,
          h(
            "span",
            { className: "text-base font-black text-orange-600 dark:text-amber-300" },
            formatGhc(saleBuyer ?? 0)
          )
        ])
      ])
    ]
  );
}

export function ShopHomeFlashDealsRail() {
  return null;
}