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
export function MenuItemFeedCard({ product, className = "" }) {
  if (!product?.id) return null;
  const store = productStoreContext(product);
  const price = productFeedPriceLabel(product);
  const itemTo = `/products/${product.id}`;
  const VendorIcon = store.sellerOnly ? User : Store;

  return h(
    "article",
    {
      className: `group relative aspect-[3/4] w-[min(42vw,11rem)] shrink-0 snap-start overflow-hidden rounded-xl bg-slate-300/50 ring-1 ring-slate-200/80 transition duration-200 hover:z-[1] hover:scale-[1.03] hover:shadow-lg hover:shadow-slate-900/15 hover:ring-sky-500/35 dark:bg-night-800 dark:ring-white/10 dark:hover:shadow-black/40 dark:hover:ring-sky-400/40 ${className}`.trim()
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
      h("div", { key: "meta", className: "absolute bottom-0 left-0 right-0 p-3 pt-12" }, [
        h(
          Link,
          {
            key: "item",
            to: itemTo,
            className:
              "line-clamp-2 text-left text-sm font-semibold leading-snug text-white drop-shadow-md hover:underline"
          },
          product.name || "Item"
        ),
        h("div", { key: "store-row", className: "mt-1.5 flex items-center gap-1.5" }, [
          store.logoUrl
            ? h("img", {
                key: "lo",
                src: store.logoUrl,
                alt: "",
                className: "h-5 w-5 shrink-0 rounded-full object-cover ring-1 ring-white/30"
              })
            : h(VendorIcon, { key: "ic", className: "h-3.5 w-3.5 shrink-0 text-white/80", "aria-hidden": true }),
          store.href
            ? h(
                Link,
                {
                  key: "sn",
                  to: store.href,
                  onClick: (e) => e.stopPropagation(),
                  className:
                    "min-w-0 truncate text-[11px] font-bold uppercase tracking-wide text-white/90 hover:text-white hover:underline"
                },
                store.name
              )
            : h(
                "span",
                {
                  key: "sn",
                  className: "min-w-0 truncate text-[11px] font-bold uppercase tracking-wide text-white/80"
                },
                store.name
              )
        ]),
        price
          ? h("p", { key: "pr", className: "mt-1 text-xs font-bold text-sky-200 drop-shadow-sm" }, price)
          : null
      ])
    ]
  );
}
