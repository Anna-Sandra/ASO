import React from "react";
import { Link } from "react-router-dom";
import { Store, User } from "lucide-react";
import { h } from "utils/h";
import { refFromId } from "config/catalog";
import { RefImage } from "components/ui";
import { productFeedPriceLabel, productStoreContext } from "utils/productStore";

/**
 * Discovery rail tile: dish + parent restaurant/store + price.
 * Primary tap → item detail; store name links to full menu.
 */
export function MenuItemFeedCard({ product, className = "", compact = false }) {
  if (!product?.id) return null;
  const store = productStoreContext(product);
  const price = productFeedPriceLabel(product);
  const itemTo = `/products/${product.id}`;
  const VendorIcon = store.sellerOnly ? User : Store;

  /** Default: slightly smaller poster tiles (home “Popular on …” rails). `compact` = extra-small for dense rows. */
  const tile =
    compact
      ? "aspect-[3/4] w-[min(30vw,7.25rem)] sm:min-w-0 sm:max-w-[7.25rem] sm:w-[7.25rem]"
      : "aspect-[3/4] w-[min(36vw,8.75rem)] sm:min-w-0 sm:max-w-[9rem] sm:w-[9rem]";

  return h(
    "article",
    {
      className:
        `group relative ${tile} shrink-0 snap-start overflow-hidden rounded-lg bg-slate-300/50 ring-1 ring-slate-200/80 transition duration-200 hover:z-[1] hover:scale-[1.02] hover:shadow-md hover:shadow-slate-900/15 hover:ring-sky-500/35 dark:bg-night-800 dark:ring-white/10 dark:hover:shadow-black/40 dark:hover:ring-sky-400/40 ${className}`.trim()
    },
    [
      h(Link, {
        key: "img",
        to: itemTo,
        "aria-label": product.name,
        className: "absolute inset-0 block focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
      }, [
        h(RefImage, {
          key: "pic",
          src: product.imageUrls?.[0],
          n: refFromId(product.id),
          alt: "",
          className: "h-full w-full object-cover transition duration-300 group-hover:scale-105"
        }),
        h("div", {
          key: "ovl",
          className: "pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent",
          "aria-hidden": true
        })
      ]),
      h(
        "div",
        {
          key: "meta",
          className: compact
            ? "absolute bottom-0 left-0 right-0 p-2 pt-7 sm:pt-8"
            : "absolute bottom-0 left-0 right-0 p-2.5 pt-9 sm:p-3 sm:pt-10"
        },
        [
          h(
            Link,
            {
              key: "item",
              to: itemTo,
              className: compact
                ? "line-clamp-2 text-left text-[11px] font-semibold leading-tight text-white drop-shadow-md hover:underline sm:text-xs"
                : "line-clamp-2 text-left text-xs font-semibold leading-snug text-white drop-shadow-md hover:underline sm:text-sm"
            },
            product.name || "Item"
          ),
          h("div", { key: "store-row", className: compact ? "mt-1 flex items-center gap-1" : "mt-1.5 flex items-center gap-1.5" }, [
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
              ? h(
                  Link,
                  {
                    key: "sn",
                    to: store.href,
                    onClick: (e) => e.stopPropagation(),
                    className: compact
                      ? "min-w-0 truncate text-[9px] font-bold uppercase tracking-wide text-white/90 hover:text-white hover:underline sm:text-[10px]"
                      : "min-w-0 truncate text-[10px] font-bold uppercase tracking-wide text-white/90 hover:text-white hover:underline sm:text-[11px]"
                  },
                  store.name
                )
              : h(
                  "span",
                  {
                    key: "sn",
                    className: compact
                      ? "min-w-0 truncate text-[9px] font-bold uppercase tracking-wide text-white/80 sm:text-[10px]"
                      : "min-w-0 truncate text-[10px] font-bold uppercase tracking-wide text-white/80 sm:text-[11px]"
                  },
                  store.name
                )
          ]),
          price
            ? h(
                "p",
                {
                  key: "pr",
                  className: compact
                    ? "mt-0.5 text-[10px] font-bold text-sky-200 drop-shadow-sm sm:text-[11px]"
                    : "mt-1 text-[11px] font-bold text-sky-200 drop-shadow-sm sm:text-xs"
                },
                price
              )
            : null
        ]
      )
    ]
  );
}
