import React, { useState } from "react";
import { Check, ChevronDown, Square } from "lucide-react";
import { formatGhc } from "utils/money";
import { buyerDisplayPrice, buyerDisplayMarginalDelta } from "utils/checkoutPricing";
import {
  effectiveListUnitPrice,
  productAddonDefs,
  splitAddonsByKind,
  toggleAddonLabel
} from "utils/productAddons";

const h = React.createElement;

/**
 * Buyer-facing add-on suffix (fees included) — cost of having this option on vs off.
 * @param {{ price?: number; addons?: unknown[] }} product
 * @param {string[]} selectedLabels
 * @param {{ label: string; priceDelta: number }} def
 * @param {{ commissionPercent: number; paystackFeePercent: number; paystackFeeFixedGhs: number } | null | undefined} pricingOpts
 */
function formatBuyerAddonSuffix(product, selectedLabels, def, pricingOpts) {
  const listDelta = Number(def.priceDelta) || 0;
  if (listDelta === 0) return "";
  const norm = (s) => String(s).trim().toLowerCase();
  const lbl = String(def.label).trim();
  const isSelected = selectedLabels.some((s) => norm(s) === norm(lbl));
  const withoutThis = isSelected
    ? effectiveListUnitPrice(
        product,
        selectedLabels.filter((s) => norm(s) !== norm(lbl))
      )
    : effectiveListUnitPrice(product, selectedLabels);
  const withThis = isSelected
    ? effectiveListUnitPrice(product, selectedLabels)
    : effectiveListUnitPrice(product, toggleAddonLabel(selectedLabels, lbl));
  const buyerDelta = pricingOpts
    ? buyerDisplayMarginalDelta(withoutThis, withThis, pricingOpts)
    : Math.ceil(withThis - withoutThis);
  if (buyerDelta === 0) return "";
  if (buyerDelta > 0) return `(+${formatGhc(buyerDelta)})`;
  return `(-${formatGhc(Math.abs(buyerDelta))})`;
}

/**
 * Listings with vendor-defined add-ons / removals (any category).
 * @param {{ addons?: unknown[] } | null | undefined} product
 */
export function productSupportsMealCustomization(product) {
  if (!product || typeof product !== "object") return false;
  return productAddonDefs(product).length > 0;
}

/**
 * Show customization UI on the product page (food / services with a list price).
 * @param {{ category?: string, price?: number, stock?: number } | null | undefined} product
 */
export function productShowsCustomizationUi(product) {
  if (!product || typeof product !== "object") return false;
  const cat = product.category;
  if (cat !== "food_drinks" && cat !== "services") return false;
  const listPx = Number(product.price) || 0;
  if (!(listPx > 0)) return false;
  return (Number(product.stock) || 0) > 0;
}

/**
 * @param {{
 *   product: { price?: number; addons?: unknown[]; category?: string };
 *   selectedLabels: string[];
 *   onChange: (labels: string[]) => void;
 *   orderNotes?: string;
 *   onOrderNotesChange?: (value: string) => void;
 *   pricingOpts?: { commissionPercent: number; paystackFeePercent: number; paystackFeeFixedGhs: number } | null;
 *   className?: string;
 * }} props
 */
export function ProductCustomizationPanel({
  product,
  selectedLabels,
  onChange,
  orderNotes = "",
  onOrderNotesChange,
  pricingOpts,
  className = ""
}) {
  const defs = productAddonDefs(product);
  const hasVendorOptions = defs.length > 0;
  const [customizeOpen, setCustomizeOpen] = useState(hasVendorOptions);

  const isFood = product.category === "food_drinks";
  const isService = product.category === "services";
  const { adds, removals: rawRemovals } = splitAddonsByKind(defs);
  const removals = isService ? [] : rawRemovals;
  const listUnit = effectiveListUnitPrice(product, selectedLabels);
  const payUnit = pricingOpts ? buyerDisplayPrice(listUnit, pricingOpts, 1) : Math.ceil(listUnit);

  const toggle = (label) => {
    onChange(toggleAddonLabel(selectedLabels, label));
  };

  const isOn = (label) =>
    selectedLabels.some((s) => String(s).trim().toLowerCase() === String(label).trim().toLowerCase());

  const optionRow = (def) => {
    const checked = isOn(def.label);
    const suffix = formatBuyerAddonSuffix(product, selectedLabels, def, pricingOpts);
    return h(
      "button",
      {
        key: def.label,
        type: "button",
        onClick: () => toggle(def.label),
        className: `flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
          checked
            ? "border-sky-400/60 bg-sky-50/90 dark:border-sky-500/40 dark:bg-sky-950/40"
            : "border-slate-200/80 bg-white hover:border-sky-200 hover:bg-slate-50/80 dark:border-white/10 dark:bg-night-900/40 dark:hover:border-sky-500/25"
        }`
      },
      [
        checked
          ? h(Check, {
              key: "ic",
              className: "mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300",
              strokeWidth: 2.5
            })
          : h(Square, {
              key: "ic",
              className: "mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500",
              strokeWidth: 2
            }),
        h("span", { key: "tx", className: "min-w-0 flex-1 leading-snug text-slate-800 dark:text-slate-100" }, [
          def.label,
          suffix
            ? h("span", { key: "pr", className: "ml-1 font-semibold text-slate-600 dark:text-slate-300" }, suffix)
            : null
        ])
      ]
    );
  };

  const section = (key, title, items) =>
    items.length > 0
      ? h("div", { key, className: "space-y-2" }, [
          h("p", { className: "text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, title),
          h("div", { className: "space-y-1.5" }, items.map(optionRow))
        ])
      : null;

  const customizeTitle = isFood ? "Customize your meal" : "Customize this service";
  const addsTitle = isFood ? "Add-ons" : "Optional add-ons";
  const removalsTitle = isFood ? "Removals" : "Remove / adjust";

  return h(
    "div",
    {
      className: `rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-night-900/50 ${className}`
    },
    [
      h(
        "button",
        {
          key: "toggle",
          type: "button",
          "aria-expanded": customizeOpen,
          onClick: () => setCustomizeOpen((o) => !o),
          className: `flex w-full items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left font-semibold transition ${
            customizeOpen
              ? "border-sky-400 bg-sky-50 text-sky-950 dark:border-sky-500/50 dark:bg-sky-950/50 dark:text-sky-100"
              : "border-slate-200 bg-slate-50 text-slate-900 hover:border-sky-300 hover:bg-sky-50/80 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-sky-500/30"
          }`
        },
        [
          h("span", { key: "lbl" }, customizeTitle),
          h(ChevronDown, {
            key: "ch",
            className: `h-5 w-5 shrink-0 transition-transform ${customizeOpen ? "rotate-180" : ""}`
          })
        ]
      ),

      customizeOpen
        ? h(
            "div",
            { key: "opts", className: "mt-4 space-y-4 border-t border-slate-100 pt-4 dark:border-white/10" },
            [
              hasVendorOptions
                ? [
                    section("adds", addsTitle, adds),
                    section("rems", removalsTitle, removals),
                    !adds.length && !removals.length ? section("all", "Options", defs) : null
                  ].filter(Boolean)
                : h(
                    "p",
                    {
                      key: "empty",
                      className: "text-sm leading-relaxed text-slate-600 dark:text-slate-300"
                    },
                    isFood
                      ? "This seller has not listed extras yet (e.g. extra protein, no shito). You can still add special instructions below — the restaurant sees them on your order."
                      : "This seller has not listed add-ons yet. Add any preferences below and they will see them on your order."
                  ),
              typeof onOrderNotesChange === "function"
                ? h("div", { key: "notes", className: "space-y-1.5" }, [
                    h(
                      "label",
                      {
                        htmlFor: "product-order-notes",
                        className: "text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                      },
                      isFood ? "Special instructions" : "Your preferences"
                    ),
                    h("textarea", {
                      id: "product-order-notes",
                      value: String(orderNotes || ""),
                      onChange: (e) => onOrderNotesChange(e.target.value.slice(0, 280)),
                      rows: 3,
                      placeholder: isFood
                        ? "e.g. No wele · extra gari · mild shito · pack separately"
                        : "e.g. Timing, scope, materials included…",
                      className:
                        "w-full resize-y rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none ring-sky-500/30 placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 dark:border-white/15 dark:bg-night-900/60 dark:text-slate-100"
                    }),
                    h(
                      "p",
                      { className: "text-[11px] text-slate-500 dark:text-slate-400" },
                      "Optional. Do not include phone numbers or email — checkout is in-app only."
                    )
                  ])
                : null
            ].flat().filter(Boolean)
          )
        : null,

      h(
        "div",
        {
          key: "total",
          className: "mt-4 rounded-xl border border-sky-500/25 bg-sky-50/80 px-4 py-3 dark:border-sky-500/30 dark:bg-sky-950/30"
        },
        [
          h("p", { className: "text-xs font-medium text-slate-600 dark:text-slate-400" }, "Your price"),
          h("p", { key: "tot", className: "text-2xl font-bold text-sky-600 dark:text-sky-300" }, formatGhc(payUnit))
        ]
      )
    ]
  );
}
