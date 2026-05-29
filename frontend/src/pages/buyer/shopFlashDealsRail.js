import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlarmClock, Flame, ShoppingBag } from "lucide-react";
import { apiFetch } from "services/api";
import { h } from "utils/h";
import { formatGhc } from "utils/money";
import { GlassPanel } from "components/ui";
import { usePromoCountdown, isPerpetualPromoEnd } from "utils/promoCountdown";

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
