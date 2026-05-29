import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Store, User, Utensils } from "lucide-react";
import { h } from "utils/h";
import { productStoreContext } from "utils/productStore";
import { Button } from "components/ui";

/** On product detail: restaurant / store menu, or independent seller when no storefront. */
export function RestaurantContextPanel({ product }) {
  const store = productStoreContext(product);
  const menuLabel = store.isRestaurant ? "View full menu" : "View store";
  const Icon = store.sellerOnly ? User : store.isRestaurant ? Utensils : Store;
  const phone =
    store.sellerOnly && product?.sellerPayment?.phone ? String(product.sellerPayment.phone).trim() : "";
  const sellerEmail =
    store.sellerOnly && product?.sellerPayment?.email ? String(product.sellerPayment.email).trim() : "";

  return h(
    "div",
    {
      className:
        `flex flex-col gap-3 rounded-2xl border p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between ${
          store.sellerOnly
            ? "border-amber-200/90 bg-gradient-to-br from-amber-50/90 to-white dark:border-amber-500/30 dark:from-amber-950/35 dark:to-night-900/80"
            : "border-sky-200/80 bg-gradient-to-br from-sky-50/90 to-white dark:border-sky-500/25 dark:from-sky-950/40 dark:to-night-900/80"
        }`
    },
    [
      h("div", { key: "l", className: "flex min-w-0 items-center gap-3" }, [
        store.logoUrl
          ? h("img", {
              key: "logo",
              src: store.logoUrl,
              alt: "",
              className: "h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-slate-200/80 dark:ring-white/10"
            })
          : h(
              "div",
              {
                key: "ico",
                className: `flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                  store.sellerOnly
                    ? "bg-amber-500/15 text-amber-800 dark:bg-amber-500/20 dark:text-amber-100"
                    : "bg-sky-600/15 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200"
                }`
              },
              h(Icon, { className: "h-6 w-6", "aria-hidden": true })
            ),
        h("div", { key: "tx", className: "min-w-0" }, [
          h(
            "p",
            { className: "text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" },
            store.isRestaurant && !store.sellerOnly ? "From restaurant" : "Sold by"
          ),
          store.href
            ? h(
                Link,
                {
                  to: store.href,
                  className: "mt-0.5 block truncate font-display text-lg font-bold text-slate-900 hover:text-sky-700 dark:text-white dark:hover:text-sky-300"
                },
                store.name
              )
            : h("p", { className: "mt-0.5 truncate font-display text-lg font-bold text-slate-900 dark:text-white" }, store.name),
          h(
            "p",
            { className: "mt-1 text-xs text-slate-600 dark:text-slate-400" },
            store.sellerOnly
              ? store.isRestaurant || product?.category === "food_drinks"
                ? "This seller has not set up a store menu yet. Use the contact options below to order this dish."
                : "This seller lists on SHOPIQGH without a storefront — open contact details below to buy."
              : store.isRestaurant
                ? "This dish is on their menu. Order here or browse everything they serve."
                : "Browse all listings from this store."
          ),
          phone
            ? h(
                "p",
                { key: "ph", className: "mt-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200" },
                ["Contact: ", h("a", { href: `tel:${phone}`, className: "text-sky-700 underline dark:text-sky-300" }, phone)]
              )
            : sellerEmail
              ? h(
                  "p",
                  { key: "em", className: "mt-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200" },
                  [
                    "Email: ",
                    h(
                      "a",
                      { href: `mailto:${sellerEmail}`, className: "text-sky-700 underline dark:text-sky-300" },
                      sellerEmail
                    )
                  ]
                )
              : null
        ])
      ]),
      store.href
        ? h(
            Link,
            {
              key: "cta",
              to: store.href,
              className: "shrink-0"
            },
            h(
              Button,
              { type: "button", className: "w-full gap-1 !rounded-full sm:w-auto" },
              [menuLabel, h(ChevronRight, { className: "h-4 w-4", "aria-hidden": true })]
            )
          )
        : null
    ].filter(Boolean)
  );
}
