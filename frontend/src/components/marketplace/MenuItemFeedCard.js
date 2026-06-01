import React from "react";
import { Link } from "react-router-dom";
import { Heart, ShoppingCart, Star, Store, User, AlarmClock } from "lucide-react";
import { h } from "utils/h";
import { isFoodCallToOrderCategory, isOfflineQuoteCategory } from "config/catalog";
import { ProductCardRotatingImage } from "components/marketplace/ProductCardRotatingImage";
import {
  productFeedPriceLabel,
  productSocialProofLines,
  productStoreContext,
  productTileDeliveryHints
} from "utils/productStore";
import { useCart } from "context";
import { useSavedProducts } from "context/SavedProductsContext";
import { formatGhc } from "utils/money";
import { buyerDisplayPrice } from "utils/checkoutPricing";
import { useCheckoutPricingOptions } from "hooks/useCheckoutPricing";
import { usePromoCountdown, isPerpetualPromoEnd, humanCountdownBrief } from "utils/promoCountdown";

function FeedDealCountdownLine({ endsAt }) {
  const perpetual = !!(endsAt && isPerpetualPromoEnd(endsAt));
  const t = usePromoCountdown(perpetual || !endsAt ? undefined : endsAt);
  if (perpetual || !endsAt) return null;
  return h(
    "div",
    {
      className: `pointer-events-auto mt-0.5 flex items-center gap-0.5 text-[9px] font-bold sm:text-[10px] ${t.urgent ? "text-rose-200" : "text-white/85"}`
    },
    [
      h(AlarmClock, { className: "h-3 w-3 shrink-0", "aria-hidden": true }),
      t.ended ? "Ended" : `${humanCountdownBrief(t.secondsLeft)} left`
    ]
  );
}

export function MenuItemFeedCard({
  product,
  className = "",
  compact = false,
  /** `grid` = full-width cell in a vertical catalog grid; default = narrow tile for horizontal rails */
  layout = "rail",
  showRating = false,
  showSave = false,
  showQuickAdd = false,
  showDeliveryHints = false
}) {
  const { add } = useCart();
  const { isSaved, toggleSaved } = useSavedProducts();
  const pricingOpts = useCheckoutPricingOptions();

  if (!product?.id) return null;

  const store = productStoreContext(product);
  const price = productFeedPriceLabel(product);
  const activeDeal = product.activeDeal && typeof product.activeDeal === "object" ? product.activeDeal : null;
  const listP = Number(product.price) || 0;
  const buyerP = buyerDisplayPrice(listP, pricingOpts, 1);
  const cmpAt = Number(product.compareAtPrice);
  const avg = Number(product.reviewAvg);
  const hasRating = showRating && Number.isFinite(avg) && (Number(product.reviewCount) || 0) > 0;
  const saved = isSaved(product.id);
  const quote = isOfflineQuoteCategory(product) || isFoodCallToOrderCategory(product);

  const strikeDisplay =
    !quote &&
    Number.isFinite(cmpAt) &&
    Number.isFinite(listP) &&
    cmpAt > listP &&
    listP > 0;

  const dealPct =
    strikeDisplay && activeDeal?.discountPercent != null && Number(activeDeal.discountPercent) > 0
      ? Math.round(Number(activeDeal.discountPercent))
      : strikeDisplay && cmpAt > listP
        ? Math.round(((cmpAt - listP) / cmpAt) * 100)
        : null;

  const itemTo = `/products/${product.id}`;
  const VendorIcon = store.sellerOnly ? User : Store;
  const canBuy = !quote && (Number(product.stock) || 0) > 0;
  const hints = showDeliveryHints ? productTileDeliveryHints(product) : [];
  const socialLines = productSocialProofLines(product);

  const tile =
    layout === "grid"
      ? "aspect-[3/4] w-full min-w-0"
      : compact
        ? "aspect-[3/4] w-[min(30vw,7.25rem)] sm:min-w-0 sm:max-w-[7.25rem] sm:w-[7.25rem]"
        : "aspect-[3/4] w-[min(36vw,8.75rem)] sm:min-w-0 sm:max-w-[9rem] sm:w-[9rem]";
  const tileLayout =
    layout === "grid" ? "" : " shrink-0 snap-start";

  const ringHover = "hover:ring-violet-500/45 dark:hover:ring-violet-400/45";

  const onHeart = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await toggleSaved(product.id);
    } catch { /* toast elsewhere */ }
  };

  const onQuick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canBuy) return;
    add(product, 1);
  };

  return h(
    "article",
    {
      className:
        `group relative ${tile}${tileLayout} overflow-hidden rounded-lg bg-slate-300/50 ring-1 ring-slate-200/80 transition duration-200 hover:z-[1] hover:scale-[1.02] hover:shadow-md hover:shadow-slate-900/15 ${ringHover} dark:bg-night-800 dark:ring-white/10 dark:hover:shadow-black/40 ${className}`.trim()
    },
    [
      hints.length
        ? h("div", {
            key: "hints",
            className: "pointer-events-none absolute left-1.5 top-1.5 z-[3] flex max-w-[calc(100%-3rem)] flex-col gap-0.5"
          },
          hints.map((hint) =>
            h("span", {
              key: hint.key,
              className: "inline-flex w-fit max-w-full truncate rounded-md bg-black/55 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white backdrop-blur-sm sm:text-[9px]"
            }, hint.label)
          )
        )
        : null,

      showSave
        ? h("button", {
            key: "save",
            type: "button",
            className: "absolute right-1 top-1 z-[4] flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white shadow backdrop-blur-sm transition hover:bg-black/55",
            onClick: onHeart,
            "aria-label": saved ? "Remove from saved" : "Save item",
            "aria-pressed": saved
          },
          h(Heart, {
            className: `h-3.5 w-3.5 ${saved ? "fill-rose-400 text-rose-400" : "text-white"}`,
            strokeWidth: 2
          })
        )
        : null,

      h(Link, {
        key: "img",
        to: itemTo,
        "aria-label": product.name,
        className: "absolute inset-0 z-[1] block focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
      }, [
        h(ProductCardRotatingImage, {
          key: "rot",
          product,
          wrapperClassName: "absolute inset-0",
          imageClassName: "h-full w-full object-cover transition-all duration-700 group-hover:scale-105",
          dotsClassName:
            "pointer-events-none absolute bottom-10 left-0 right-0 z-[3] flex justify-center gap-1"
        }),
        h("div", {
          key: "ovl",
          className: "pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent",
          "aria-hidden": true
        })
      ]),

      showQuickAdd && canBuy
        ? h("button", {
            key: "cart",
            type: "button",
            className: "absolute bottom-14 right-1 z-[4] flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg shadow-black/30 transition hover:bg-violet-500 sm:bottom-16",
            onClick: onQuick,
            "aria-label": "Add to cart"
          },
          h(ShoppingCart, { className: "h-4 w-4", "aria-hidden": true })
        )
        : null,

      h("div", {
        key: "meta",
        className: compact
          ? "pointer-events-none absolute bottom-0 left-0 right-0 z-[2] p-2 pt-7 sm:pt-8"
          : "pointer-events-none absolute bottom-0 left-0 right-0 z-[2] p-2.5 pt-9 sm:p-3 sm:pt-10"
      }, [
        h(Link, {
          key: "item",
          to: itemTo,
          className:
            "pointer-events-auto line-clamp-2 text-left text-[11px] font-semibold leading-tight text-white drop-shadow-md hover:underline sm:text-xs " +
            (compact ? "" : "sm:text-sm"),
          onClick: (e) => e.stopPropagation()
        }, product.name || "Item"),

        hasRating
          ? h("div", {
              key: "stars",
              className: "pointer-events-auto mt-0.5 flex items-center gap-0.5 text-[9px] font-semibold text-amber-200 sm:text-[10px]"
            }, [
              h(Star, { key: "s", className: "h-3 w-3 fill-amber-400 text-amber-400", "aria-hidden": true }),
              h("span", { key: "n" }, `${avg.toFixed(1)}`)
            ])
          : null,

        socialLines.length
          ? h(
              "p",
              {
                key: "social",
                className: "pointer-events-none mt-0.5 line-clamp-1 text-[9px] font-medium text-white/80 sm:text-[10px]"
              },
              socialLines.map((ln) => ln.text).join(" · ")
            )
          : null,

        h("div", {
          key: "store-row",
          className: compact ? "mt-1 flex items-center gap-1" : "mt-1.5 flex items-center gap-1.5"
        }, [
          store.logoUrl
            ? h("img", {
                key: "lo",
                src: store.logoUrl,
                alt: "",
                className: compact
                  ? "h-4 w-4 shrink-0 rounded-full object-cover ring-1 ring-white/30"
                  : "h-[18px] w-[18px] shrink-0 rounded-full object-cover ring-1 ring-white/30 sm:h-5 sm:w-5"
              })
            : h(VendorIcon, {
                key: "ic",
                className: compact ? "h-3 w-3 shrink-0 text-white/80" : "h-3.5 w-3.5 shrink-0 text-white/80",
                "aria-hidden": true
              }),
          store.href
            ? h(Link, {
                key: "sn",
                to: store.href,
                onClick: (e) => e.stopPropagation(),
                className: compact
                  ? "pointer-events-auto min-w-0 truncate text-[9px] font-bold uppercase tracking-wide text-white/90 hover:text-white hover:underline sm:text-[10px]"
                  : "pointer-events-auto min-w-0 truncate text-[10px] font-bold uppercase tracking-wide text-white/90 hover:text-white hover:underline sm:text-[11px]"
              }, store.name)
            : h("span", {
                key: "sn",
                className: compact
                  ? "min-w-0 truncate text-[9px] font-bold uppercase tracking-wide text-white/80 sm:text-[10px]"
                  : "min-w-0 truncate text-[10px] font-bold uppercase tracking-wide text-white/80 sm:text-[11px]"
              }, store.name)
        ]),

        quote
          ? price
            ? h("p", {
                key: "pr",
                className: compact
                  ? "mt-0.5 text-[10px] font-bold text-violet-200 drop-shadow-sm sm:text-[11px]"
                  : "mt-1 text-[11px] font-bold text-violet-200 drop-shadow-sm sm:text-xs"
              }, price)
            : null
          : h("div", { key: "pr-stack", className: compact ? "mt-0.5" : "mt-1" }, [
              strikeDisplay &&
                h("span", {
                  key: "was",
                  className: compact
                    ? "mr-1 inline text-[10px] font-semibold text-white/55 line-through sm:text-[11px]"
                    : "mr-1.5 inline text-[11px] font-semibold text-white/55 line-through sm:text-xs"
                }, formatGhc(cmpAt)),
              h("span", {
                key: "now",
                className: compact
                  ? "inline text-[10px] font-bold text-violet-200 drop-shadow-sm sm:text-[11px]"
                  : "inline text-[11px] font-bold text-violet-200 drop-shadow-sm sm:text-xs"
              }, formatGhc(buyerP)),
              dealPct != null && dealPct > 0 &&
                h("span", {
                  key: "pct",
                  className: compact
                    ? "ml-1 inline text-[10px] font-black text-emerald-300 drop-shadow-sm"
                    : "ml-1.5 inline text-[11px] font-black text-emerald-300 drop-shadow-sm sm:text-xs"
                }, `${dealPct}% OFF`),
              strikeDisplay && Boolean(activeDeal?.endsAt) &&
                h(FeedDealCountdownLine, { key: "dc", endsAt: activeDeal.endsAt })
            ].filter(Boolean))
      ])
    ].filter(Boolean)
  );
}