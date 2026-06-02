import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Tag, Wallet } from "lucide-react";
import { h, f } from "utils/h";
import { SITE_AUDIENCE_TAGLINE, SITE_NAME } from "config/brand";
import { BuyerLayout, CartDrawer } from "pages/buyer/screensBuyer";
import { GlassPanel } from "components/ui";
export { BuyerDealsPage, BuyerCouponsPage } from "./buyerPromotionsHub";

/** Payments & receipts focus — balances live with Paystack; link to order history. */
export function BuyerWalletPage() {
  const [cartOpen, setCartOpen] = useState(false);
  return h(f, null, [
    h(
      BuyerLayout,
      {
        key: "lay",
        hideSearch: true,
        title: "Wallet & payments",
        onOpenCart: () => setCartOpen(true)
      },
      h("div", { key: "main", className: "mx-auto w-full max-w-3xl space-y-5 px-4 py-10 pb-28 sm:px-6" }, [
        h(
          "p",
          { key: "intro", className: "text-sm text-slate-600 dark:text-slate-400" },
          `${SITE_NAME} collects payments securely (e.g. Paystack). There is no separate stored “wallet balance” in the app — your history is your source of truth.`
        ),
        h(
          GlassPanel,
          { key: "orders", className: "rounded-2xl border border-white/10 p-5" },
          [
            h("div", { key: "h", className: "flex items-center gap-2" }, [
              h(Wallet, { className: "h-5 w-5 text-violet-400" }),
              h("h2", { className: "font-display text-lg font-semibold text-slate-900 dark:text-white" }, "Orders & receipts")
            ]),
            h(
              "p",
              { key: "p", className: "mt-2 text-sm text-slate-600 dark:text-slate-400" },
              "Paid totals and delivery status are listed under My orders. Open an order for tracking and receipts."
            ),
            h(Link, { key: "lnk", to: "/orders", className: "mt-3 inline-flex font-semibold text-violet-600 hover:underline dark:text-violet-300" }, "Go to orders →")
          ]
        ),
        h(
          GlassPanel,
          { key: "methods", className: "rounded-2xl border border-white/10 p-5" },
          [
            h("div", { key: "h", className: "flex items-center gap-2" }, [
              h(Tag, { className: "h-5 w-5 text-sky-400" }),
              h("h2", { className: "font-display text-lg font-semibold text-slate-900 dark:text-white" }, "How you pay")
            ]),
            h(
              "p",
              { key: "p", className: "mt-2 text-sm text-slate-600 dark:text-slate-400" },
              "Complete checkout with card or supported mobile money on the Paystack screen."
            )
          ]
        ),
        h("p", { key: "aud", className: "text-center text-xs text-slate-500 dark:text-slate-500" }, SITE_AUDIENCE_TAGLINE)
      ])
    ),
    h(CartDrawer, { key: "cart", open: cartOpen, onClose: () => setCartOpen(false) })
  ]);
}
