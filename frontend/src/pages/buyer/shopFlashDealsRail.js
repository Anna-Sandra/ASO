import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlarmClock, ArrowRight, Flame, ShoppingBag } from "lucide-react";
import { apiFetch } from "services/api";
import { h } from "utils/h";
import { SITE_NAME, SITE_AUDIENCE_TAGLINE, SITE_TAGLINE } from "config/brand";
import { formatGhc } from "utils/money";
import { GlassPanel } from "components/ui";
import { usePromoCountdown, isPerpetualPromoEnd } from "utils/promoCountdown";

const PROMO_GRADIENTS = {
  violet: "from-violet-600 via-indigo-600 to-sky-800",
  sunset: "from-violet-500 via-fuchsia-600 to-indigo-800",
  ocean: "from-sky-500 via-cyan-600 to-violet-800",
  ember: "from-indigo-500 via-violet-600 to-fuchsia-700",
  moss: "from-sky-500 via-violet-600 to-indigo-800",
  berry: "from-fuchsia-600 via-violet-600 to-indigo-900"
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
    tagBadge: "DEALS",
    title: "Flash sales & discounts",
    subtitle: "Limited-time offers from verified vendors",
    linkTo: "/deals",
    cta: "View deals"
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
    gradientKey: b.gradientKey || "violet",
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
  return {
    id: `flash_${promo.id}`,
    gradientKey: "berry",
    tagBadge: String(promo.tagBadge || "FLASH SALE").trim() || "FLASH SALE",
    title: promo.title || p?.name || "Limited-time deal",
    subtitle: p?.name && promo.title ? p.name : "Tap to view this deal",
    imageUrl: p?.imageUrl || "",
    linkTo: promo.productId ? `/products/${promo.productId}` : "/deals",
    endsAt: promo.endsAt,
    cta: "Shop deal"
  };
}

function slideFromProduct(p) {
  if (!p?.id || !p?.name) return null;
  const img = p.imageUrls?.[0] || p.imageUrl || "";
  const price = Number(p.price);
  return {
    id: `pick_${p.id}`,
    gradientKey: "moss",
    tagBadge: "POPULAR",
    title: p.name,
    subtitle: Number.isFinite(price) && price > 0 ? `From ${formatGhc(price)}` : "Trending on the marketplace",
    imageUrl: img,
    linkTo: `/products/${p.id}`,
    cta: "View item"
  };
}

function CompactHighlightSlide({ slide, idx, setIdx, slides }) {
  const t = usePromoCountdown(slide.endsAt);
  const to = slide.linkTo?.startsWith("/") ? slide.linkTo : slide.linkTo ? `/${slide.linkTo}` : "/";

  return h(
    Link,
    {
      to,
      className:
        "relative block overflow-hidden rounded-2xl border border-sky-500/25 ring-1 ring-white/10 transition hover:border-violet-400/40 dark:border-white/10"
    },
    [
      h("div", {
        className: `absolute inset-0 bg-gradient-to-br opacity-95 ${promoGradientClass(slide.gradientKey)}`,
        "aria-hidden": true
      }),
      slide.imageUrl
        ? h("img", {
            src: slide.imageUrl,
            alt: "",
            className: "absolute inset-0 h-full w-full object-cover opacity-30 mix-blend-overlay"
          })
        : null,
      h("div", { className: "relative z-[1] flex min-h-[6.5rem] flex-col justify-center px-4 py-3 sm:min-h-[7rem] sm:px-5" }, [
        slide.tagBadge &&
          h(
            "span",
            {
              className:
                "mb-1.5 inline-flex w-fit rounded-full bg-black/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-sky-100 ring-1 ring-sky-400/40"
            },
            slide.tagBadge
          ),
        h(
          "p",
          { className: "line-clamp-2 font-display text-sm font-bold leading-snug text-white sm:text-base" },
          slide.title
        ),
        slide.subtitle &&
          h("p", { className: "mt-1 line-clamp-1 text-[11px] text-white/80 sm:text-xs" }, slide.subtitle),
        h("div", { className: "mt-2 flex flex-wrap items-center gap-2" }, [
          slide.endsAt &&
            !isPerpetualPromoEnd(slide.endsAt) &&
            h(
              "span",
              {
                className: `inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-mono text-[10px] font-bold ${
                  t.urgent
                    ? "bg-rose-950/55 text-rose-100 ring-1 ring-rose-400/60"
                    : "bg-black/35 text-sky-100 ring-1 ring-white/15"
                }`
              },
              t.ended ? "Ended" : t.text
            ),
          h(
            "span",
            { className: "inline-flex items-center gap-1 text-[11px] font-bold text-white/95" },
            [slide.cta || "Explore", h(ArrowRight, { className: "h-3 w-3", "aria-hidden": true })]
          )
        ])
      ]),
      slides.length > 1 &&
        h(
          "div",
          {
            className: "absolute bottom-2 right-2 z-[2] flex gap-1",
            onClick: (e) => e.preventDefault()
          },
          slides.map((_, i) =>
            h("button", {
              key: i,
              type: "button",
              onClick: (e) => {
                e.preventDefault();
                e.stopPropagation();
                setIdx(i);
              },
              className: `h-1.5 rounded-full transition-all ${i === idx ? "w-5 bg-white" : "w-1.5 bg-white/45"}`,
              "aria-label": `Highlight slide ${i + 1}`
            })
          )
        )
    ]
  );
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

/** Compact rotating highlight card — promos, deals, popular picks, and always-on shop tips. */
export function ShopHomePromoCarousel() {
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
        for (const p of flash.slice(0, 2)) {
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
    const id = window.setInterval(() => setIdx((i) => (i + 1) % slides.length), 5500);
    return () => clearInterval(id);
  }, [slides]);

  const safeIdx = slides.length ? idx % slides.length : 0;

  return h(
    "section",
    { key: "shop-highlight-carousel", className: "mb-1 w-full", "aria-label": "Shop highlights" },
    h(CompactHighlightSlide, { slide: slides[safeIdx], idx: safeIdx, setIdx, slides })
  );
}

function FlashRailEndsInBadge({ iso }) {
  const t = usePromoCountdown(iso);
  return h(
    "span",
    {
      className: `rounded-full px-2.5 py-1 font-mono text-[11px] font-bold ring-1 ${
        t.urgent ? "bg-rose-950/55 text-rose-50 ring-rose-400/60" : "bg-black/40 text-white ring-white/25"
      }`
    },
    t.ended ? "Ended" : `Ends in ${t.text}`
  );
}


function HomeFlashCard({ promo }) {
  const t = usePromoCountdown(!promo.endsAt || isPerpetualPromoEnd(promo.endsAt) ? undefined : promo.endsAt);
  const p = promo.product;
  const img = p?.imageUrl;
  const pct =
    promo.discountPercent != null
      ? Math.round(promo.discountPercent)
      : promo.compareAtGhs && promo.salePriceGhs
        ? Math.round((1 - promo.salePriceGhs / promo.compareAtGhs) * 100)
        : null;
  const to = promo.productId ? `/products/${promo.productId}` : "/deals";
  const timed = !!(promo.endsAt && !isPerpetualPromoEnd(promo.endsAt));
  const badgeLabel =
    promo.kind === "deal_discount"
      ? String(promo.tagBadge || "DISCOUNT").trim() || "DISCOUNT"
      : promo.kind === "deal_bundle"
        ? String(promo.tagBadge || "BUNDLE").trim() || "BUNDLE"
        : String(promo.tagBadge || "FLASH SALE").trim() || "FLASH SALE";

  return h(
    Link,
    {
      to,
      className:
        "min-w-[10.5rem] max-w-[11rem] shrink-0 snap-start overflow-hidden rounded-2xl border border-sky-500/20 bg-gradient-to-br from-violet-500/10 via-sky-500/10 to-transparent shadow-sm ring-1 ring-white/5 transition hover:border-violet-400/40 dark:border-white/10 dark:from-violet-500/15 dark:via-sky-500/5"
    },
    h("div", { className: "relative" }, [
      img
        ? h("img", { src: img, alt: "", className: "h-24 w-full object-cover" })
        : h(
            "div",
            { className: "flex h-24 w-full items-center justify-center bg-night-950/50" },
            h(ShoppingBag, { className: "h-8 w-8 text-slate-500" })
          ),
      h(
        "div",
        {
          className:
            "pointer-events-none absolute left-1 top-1 z-[2] max-w-[calc(100%-4rem)] rounded-md bg-rose-600 px-1 py-0.5 text-[8px] font-black uppercase leading-tight tracking-wide text-white shadow-md ring-1 ring-rose-950/35"
        },
        badgeLabel.slice(0, 18)
      ),
      pct != null &&
        h(
          "div",
          {
            className:
              "absolute right-1 top-1 z-[2] rounded-md bg-emerald-600 px-1 py-0.5 text-[9px] font-black text-white shadow-md"
          },
          `${pct}% OFF`
        )
    ]),
    h("div", { className: "border-t border-white/10 bg-white/40 p-2 dark:bg-night-900/50" }, [
      h("p", { className: "line-clamp-2 text-[11px] font-semibold leading-snug text-slate-900 dark:text-white" }, p?.name || promo.title),
      h("div", { className: "mt-1 flex flex-wrap items-baseline gap-1" }, [
        promo.compareAtGhs != null &&
          h("span", { className: "text-[10px] text-slate-400 line-through" }, formatGhc(promo.compareAtGhs)),
        h(
          "span",
          { className: "text-sm font-black text-violet-700 dark:text-violet-300" },
          formatGhc(promo.salePriceGhs ?? p?.price ?? 0)
        )
      ]),
      timed &&
        h(
          "div",
          {
            className: `mt-2 flex items-center gap-1 font-mono text-[10px] font-bold ${t.urgent ? "text-rose-600 dark:text-rose-400" : "text-slate-600 dark:text-slate-400"}`
          },
          [h(AlarmClock, { className: "h-3 w-3 shrink-0" }), t.ended ? "Ended" : t.text]
        )
    ])
  );
}

/** Homepage horizontal rail — uses public deals catalog (no auth). */
export function ShopHomeFlashDealsRail() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const headerCountdownIso = useMemo(() => {
    const timed = rows
      .map((r) => r.endsAt)
      .filter((iso) => iso && !isPerpetualPromoEnd(iso))
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    return timed[0] || null;
  }, [rows]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiFetch("/api/promotions/deals-catalog")
      .then((d) => {
        if (cancelled) return;
        const flash = d?.grouped?.flashSales;
        setRows(Array.isArray(flash) ? flash.slice(0, 12) : []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || rows.length === 0) return null;

  return h("section", { key: "flash-deals-rail", className: "mb-6", "aria-label": "Flash deals" }, [
    h("div", { className: "mb-3 flex flex-wrap items-center justify-between gap-2" }, [
      h("div", { className: "flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3" }, [
        h("div", { className: "flex items-center gap-2" }, [
          h(Flame, { className: "h-5 w-5 shrink-0 text-violet-500 dark:text-violet-400", "aria-hidden": true }),
          h(
            "h2",
            {
              className: "truncate font-display text-lg font-bold text-slate-900 dark:text-white sm:text-xl"
            },
            "Flash deals"
          )
        ]),
        headerCountdownIso
          ? h("div", { className: "flex flex-wrap items-center gap-2 sm:gap-3" }, [
              h(
                "span",
                {
                  key: "dot",
                  className: "hidden text-slate-400 sm:inline dark:text-slate-500",
                  "aria-hidden": true
                },
                "•"
              ),
              h(FlashRailEndsInBadge, { key: "ends", iso: headerCountdownIso })
            ])
          : null
      ]),
      h(
        Link,
        {
          to: "/deals",
          className: "text-xs font-bold text-violet-600 hover:underline dark:text-violet-300"
        },
        "View all →"
      )
    ]),
    h(
      GlassPanel,
      { className: "!border-sky-500/20 !bg-white/50 !p-3 dark:!border-white/10 dark:!bg-night-900/40" },
      h(
        "div",
        {
          className:
            "no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]"
        },
        rows.map((promo) => h(HomeFlashCard, { key: promo.id, promo }))
      )
    ),
  ]);
}
