import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Package, Plus } from "lucide-react";
import { isServiceProviderStore } from "config/catalog";
import { h } from "utils/h";
import { storeStatusLabel } from "utils/storeStatus";

function buildSetupChecks(business) {
  const geo = business?.geoLocation;
  const hasGeo = geo && Number.isFinite(Number(geo.lat)) && Number.isFinite(Number(geo.lng));
  const isService = isServiceProviderStore(business);
  return [
    { id: "logo", label: "Logo uploaded", done: Boolean(business?.logoUrl), href: "#store-branding" },
    { id: "banner", label: "Banner uploaded", done: Boolean(business?.bannerUrl), href: "#store-branding" },
    {
      id: "location",
      label: isService ? "Service location" : "Live map pin",
      done: hasGeo || Boolean(String(business?.locationLabel || "").trim()),
      href: "#store-location"
    },
    isService
      ? null
      : {
          id: "service",
          label: "Pickup or delivery",
          done: Boolean(business?.pickupAvailable || business?.deliveryAvailable),
          href: "#store-service"
        }
  ].filter(Boolean);
}

export function StoreSetupSidebar({ business, listingCount, reviewCount, slug, onSubmit, canSubmit }) {
  const checks = buildSetupChecks(business);
  const done = checks.filter((c) => c.done).length;
  const total = checks.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return h("div", { className: "space-y-4 lg:sticky lg:top-24" }, [
    h(
      "div",
      {
        className:
          "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-night-900"
      },
      [
        h("p", { className: "text-[10px] font-bold uppercase tracking-wider text-slate-500" }, "Store setup"),
        h("div", { className: "mt-2 flex items-end justify-between gap-2" }, [
          h("p", { className: "font-display text-2xl font-black text-slate-900 dark:text-white" }, `${done}/${total}`),
          h("span", { className: "text-xs font-semibold text-slate-500" }, `${pct}%`)
        ]),
        h("div", { className: "mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10" }, [
          h("div", {
            className: "h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all",
            style: { width: `${pct}%` }
          })
        ]),
        h("ul", { className: "mt-4 space-y-1" }, [
          ...checks.map((c) =>
            h("li", { key: c.id }, [
              h(
                "a",
                {
                  href: c.href,
                  className: `flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition hover:bg-slate-50 dark:hover:bg-white/5 ${
                    c.done ? "text-slate-700 dark:text-slate-200" : "text-slate-600 dark:text-slate-400"
                  }`
                },
                [
                  h(
                    "span",
                    {
                      className: `flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        c.done ? "bg-emerald-500 text-white" : "border border-slate-300 dark:border-white/20"
                      }`
                    },
                    c.done ? "✓" : ""
                  ),
                  h("span", { className: "flex-1 font-medium" }, c.label),
                  !c.done ? h(ChevronRight, { className: "h-3.5 w-3.5 opacity-50" }) : null
                ]
              )
            ])
          )
        ]),
        canSubmit
          ? h(
              "button",
              {
                type: "button",
                className:
                  "mt-4 w-full rounded-xl bg-sky-600 px-3 py-2.5 text-xs font-bold text-white shadow-md hover:bg-sky-500",
                onClick: onSubmit
              },
              business?.status === "rejected" ? "Resubmit for approval" : "Submit for approval"
            )
          : null,
        business?.status === "pending_approval"
          ? h(
              "p",
              { className: "mt-3 text-center text-xs font-medium text-amber-700 dark:text-amber-200" },
              "Waiting for admin review…"
            )
          : null
      ]
    ),
    h(
      "div",
      {
        className:
          "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-night-900"
      },
      [
        h("div", { className: "flex items-center justify-between gap-2" }, [
          h("p", { className: "text-sm font-bold text-slate-900 dark:text-white" }, "Menu & listings"),
          h(Package, { className: "h-4 w-4 text-slate-400" })
        ]),
        h("p", { className: "mt-1 text-xs text-slate-500" }, "Add products from here — not from account settings."),
        h("p", { className: "mt-3 font-display text-3xl font-black text-slate-900 dark:text-white" }, String(listingCount)),
        h("p", { className: "text-[10px] font-semibold uppercase tracking-wide text-slate-500" }, "live listings"),
        h(
          Link,
          {
            to: "/vendor/products/new",
            className:
              "mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs font-bold text-sky-800 hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-950/40 dark:text-sky-100"
          },
          [h(Plus, { className: "h-4 w-4" }), " Add listing"]
        ),
        slug && business?.businessType === "food_restaurant"
          ? h(
              Link,
              {
                to: `/vendor/stores/${encodeURIComponent(slug)}/menu`,
                className: "mt-2 block text-center text-xs font-bold text-sky-600 hover:underline dark:text-sky-300"
              },
              "Edit menu sections →"
            )
          : null
      ]
    ),
    h(
      "div",
      {
        className:
          "rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-night-950/50"
      },
      [
        h("p", { className: "text-[10px] font-bold uppercase tracking-wider text-slate-500" }, "Performance"),
        h("div", { className: "mt-2 grid grid-cols-2 gap-2" }, [
          h("div", { className: "rounded-xl bg-white p-3 dark:bg-night-900" }, [
            h("p", { className: "text-[10px] text-slate-500" }, "Reviews"),
            h("p", { className: "font-display text-xl font-black" }, String(reviewCount))
          ]),
          h("div", { className: "rounded-xl bg-white p-3 dark:bg-night-900" }, [
            h("p", { className: "text-[10px] text-slate-500" }, "Status"),
            h(
              "p",
              { className: "text-xs font-bold uppercase text-emerald-600 dark:text-emerald-300" },
              storeStatusLabel(business?.status)
            )
          ])
        ])
      ]
    )
  ]);
}
