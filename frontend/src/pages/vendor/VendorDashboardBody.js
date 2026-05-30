import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, Percent, Repeat, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { h } from "utils/h";
import { formatGhc } from "utils/money";
import { formatOrderFulfillmentLabel } from "utils/orderStatusDisplay";
import { isFoodCallToOrderCategory, refFromId } from "config/catalog";
import { VendorRevenueLineChart } from "components/charts/vendorCharts";
import { revenuePeriodDelta, sliceLastDays, sumDailyRevenue } from "components/charts/vendorDashboardWarm";
import { Badge, Button, GlassCard, GlassPanel, RefImage, SelectInput } from "components/ui";

function panelHead(title, subtitle, action) {
  return h(
    "div",
    {
      className:
        "flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 py-3 dark:border-white/5 sm:px-5"
    },
    [
      h("div", { key: "copy", className: "min-w-0" }, [
        h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, title),
        subtitle
          ? h("p", { className: "mt-0.5 text-xs text-slate-500 dark:text-slate-400" }, subtitle)
          : null
      ]),
      action || null
    ].filter(Boolean)
  );
}

function TrendPill({ pct, up }) {
  const sign = up ? "↗" : "↘";
  return h(
    "span",
    {
      className: `inline-flex items-center gap-1 text-sm font-semibold ${up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`
    },
    [sign, ` ${Math.abs(pct)}%`, h("span", { className: "font-normal text-slate-500 dark:text-slate-400" }, " vs last period")]
  );
}

function perfFromAnalytics(analytics, allOrders) {
  const daily = analytics?.chart?.daily || [];
  let visitors = 0;
  let periodOrders = 0;
  let periodRevenue = 0;
  for (const d of daily) {
    const ec = d.eventCounts || {};
    visitors +=
      (ec.dashboard_view || 0) +
      (ec.products_list_view || 0) +
      (ec.orders_view || 0) +
      (ec.analytics_view || 0) +
      (ec.product_edit_view || 0);
    periodOrders += Number(d.orderCount) || 0;
    periodRevenue += Number(d.revenue) || 0;
  }
  const conversion = visitors > 0 ? ((periodOrders / visitors) * 100).toFixed(1) : "0.0";
  const aov = periodOrders > 0 ? periodRevenue / periodOrders : 0;

  const paid = new Set(["paid", "processing", "sent_for_delivery", "delivered"]);
  const buyerCounts = {};
  for (const o of allOrders || []) {
    if (!paid.has(o.status)) continue;
    const bid = o.buyerId || o.buyer?.id;
    if (!bid) continue;
    buyerCounts[bid] = (buyerCounts[bid] || 0) + 1;
  }
  const buyers = Object.keys(buyerCounts).length;
  const returning = Object.values(buyerCounts).filter((c) => c >= 2).length;
  const returningPct = buyers > 0 ? Math.round((returning / buyers) * 100) : 0;

  return { visitors, conversion, aov, returningPct };
}

function formatProductStatus(st) {
  if (st === "active") return "Active";
  if (st === "pending_approval") return "Pending";
  if (st === "draft") return "Draft";
  return st || "—";
}

function productStatusTone(st) {
  if (st === "active") return "success";
  if (st === "draft" || st === "pending_approval") return "warn";
  return "neutral";
}

const viewAllLinkCls =
  "text-sm font-semibold text-sky-600 hover:underline dark:text-sky-300";

/**
 * Dashboard sections below KPI cards — uses app glass + sky/slate theme.
 */
export function VendorDashboardBody({ analytics, allOrders, myProducts }) {
  const [revPeriod, setRevPeriod] = useState("7");

  const dailyAll = analytics?.chart?.daily || [];
  const revDays = revPeriod === "30" ? 30 : 7;
  const chartDaily = useMemo(() => sliceLastDays(dailyAll, revDays), [dailyAll, revDays]);
  const periodRevenue = useMemo(() => sumDailyRevenue(chartDaily), [chartDaily]);
  const revDelta = useMemo(() => revenuePeriodDelta(dailyAll, revDays), [dailyAll, revDays]);

  const recentOrders = useMemo(() => (allOrders || []).slice(0, 5), [allOrders]);

  const topProductCards = useMemo(() => {
    const byId = new Map((myProducts || []).map((p) => [p.id, p]));
    const tops = (analytics?.topProducts || []).slice(0, 4);
    const fromSales = tops.map((t) => {
      const full = byId.get(t.productId);
      return {
        id: t.productId,
        name: t.name || full?.name || "Product",
        revenue: t.revenue,
        imageUrls: full?.imageUrls,
        price: full?.price,
        category: full?.category,
        status: full?.status || "active"
      };
    });
    if (fromSales.length > 0) return fromSales;
    return (myProducts || [])
      .filter((p) => p.status === "active")
      .slice(0, 4)
      .map((p) => ({
        id: p.id,
        name: p.name || "Product",
        revenue: 0,
        imageUrls: p.imageUrls,
        price: p.price,
        category: p.category,
        status: p.status || "active"
      }));
  }, [analytics?.topProducts, myProducts]);

  const perf = useMemo(() => perfFromAnalytics(analytics, allOrders), [analytics, allOrders]);

  const perfBlocks = [
    { label: "Hub sessions", value: String(perf.visitors), icon: Eye },
    { label: "Order rate", value: `${perf.conversion}%`, icon: Percent },
    { label: "Avg. order value", value: formatGhc(perf.aov), icon: Wallet },
    { label: "Repeat buyers", value: `${perf.returningPct}%`, icon: Repeat }
  ];

  return h("div", { key: "dash-body", className: "space-y-6" }, [
    h("div", { key: "row-mid", className: "grid grid-cols-1 gap-6 lg:grid-cols-3" }, [
      h(
        GlassPanel,
        { key: "revenue", className: "lg:col-span-2 !overflow-hidden !p-0" },
        [
          panelHead(
            "Revenue overview",
            "Track your revenue performance over time.",
            h(SelectInput, {
              key: "rev-sel",
              className: "!min-h-9 !w-auto !py-1.5 !pl-3 !pr-8 !text-sm",
              value: revPeriod,
              onChange: (e) => setRevPeriod(e.target.value),
              "aria-label": "Revenue period"
            }, [
              h("option", { key: "7", value: "7" }, "This week"),
              h("option", { key: "30", value: "30" }, "Last 30 days")
            ])
          ),
          h("div", { key: "rev-body", className: "px-4 py-4 sm:px-5" }, [
            h("div", { className: "flex flex-wrap items-end justify-between gap-4" }, [
              h("div", { key: "rev-stats" }, [
                h("p", { className: "text-3xl font-bold text-slate-900 dark:text-white" }, formatGhc(periodRevenue)),
                h("div", { className: "mt-2" }, h(TrendPill, { pct: revDelta.pct, up: revDelta.up }))
              ])
            ]),
            chartDaily.length
              ? h("div", { key: "chart", className: "mt-4" }, h(VendorRevenueLineChart, { daily: chartDaily }))
              : h(
                  "p",
                  {
                    key: "rev-empty",
                    className: "mt-4 rounded-2xl border border-white/10 bg-white/20 px-4 py-10 text-center text-sm text-slate-500 dark:bg-white/5 dark:text-slate-400"
                  },
                  "Chart data will appear after your first paid orders."
                )
          ])
        ]
      ),
      h(GlassPanel, { key: "recent", className: "flex flex-col !overflow-hidden !p-0 lg:col-span-1" }, [
        panelHead(
          "Recent orders",
          null,
          h(Link, { key: "va", to: "/vendor/orders", className: viewAllLinkCls }, "View all")
        ),
        recentOrders.length === 0
          ? h("div", { className: "flex flex-1 flex-col items-center justify-center px-5 py-10 text-center" }, [
              h(
                "div",
                {
                  className:
                    "mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-600 dark:text-sky-300"
                },
                h(ShoppingBag, { className: "h-8 w-8" })
              ),
              h("p", { className: "font-semibold text-slate-900 dark:text-white" }, "No orders yet"),
              h("p", { className: "mt-2 max-w-[220px] text-sm text-slate-500 dark:text-slate-400" }, "When buyers place orders, they'll show up here."),
              h(
                Link,
                { key: "cta", to: "/vendor/orders", className: "mt-6" },
                h(Button, { className: "!rounded-full" }, "View all orders")
              )
            ])
          : h(
              "ul",
              { className: "divide-y divide-white/10" },
              recentOrders.map((o) =>
                h("li", { key: o.id, className: "flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 sm:px-5" }, [
                  h("span", { className: "font-mono text-sm text-slate-600 dark:text-slate-300" }, `#${o.id.slice(-8)}`),
                  h("span", { className: "text-sm font-semibold text-slate-900 dark:text-white" }, formatGhc(o.vendorLineGross ?? o.total)),
                  h(Badge, { tone: "neutral" }, formatOrderFulfillmentLabel(o))
                ])
              )
            )
      ])
    ]),
    h("div", { key: "row-bot", className: "grid grid-cols-1 gap-6 lg:grid-cols-3" }, [
      h(GlassPanel, { key: "top-prod", className: "lg:col-span-2 !overflow-hidden !p-0" }, [
        panelHead(
          "Top products",
          "Best performers by proceeds — or your live listings when you have no sales yet.",
          h(Link, { key: "va", to: "/vendor/products", className: viewAllLinkCls }, "View all")
        ),
        topProductCards.length === 0
          ? h("p", { className: "px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400" }, "No sales yet — add products and share your shop.")
          : h(
              "div",
              {
                className:
                  "no-scrollbar flex gap-4 overflow-x-auto px-4 py-5 pb-6 sm:px-5"
              },
              topProductCards.map((p) =>
                h(
                  Link,
                  {
                    key: p.id,
                    to: `/vendor/products/${encodeURIComponent(p.id)}`,
                    className:
                      "group w-[min(100%,200px)] shrink-0 rounded-2xl border border-white/15 bg-white/30 p-3 transition hover:border-sky-400/40 hover:bg-white/45 dark:border-white/10 dark:bg-white/5 dark:hover:border-sky-500/35 dark:hover:bg-white/10"
                  },
                  [
                    h(RefImage, {
                      src: p.imageUrls?.[0],
                      n: refFromId(p.id),
                      alt: p.name,
                      className: "aspect-square w-full rounded-xl object-cover"
                    }),
                    h("p", { className: "mt-3 line-clamp-2 text-sm font-semibold text-slate-900 dark:text-white" }, p.name),
                    h("div", { className: "mt-2 flex items-center justify-between gap-2" }, [
                      h(
                        "span",
                        { className: "text-sm font-bold text-sky-700 dark:text-sky-300" },
                        p.category === "services"
                          ? "Quote"
                          : isFoodCallToOrderCategory(p)
                            ? "Call to order"
                            : formatGhc(p.price ?? 0)
                      ),
                      h(Badge, { tone: productStatusTone(p.status) }, formatProductStatus(p.status))
                    ])
                  ]
                )
              )
            )
      ]),
      h(GlassPanel, { key: "perf", className: "!overflow-hidden !p-0" }, [
        panelHead("Store performance", "Last 30 days from your analytics window."),
        h(
          "div",
          { className: "grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5" },
          perfBlocks.map((b) => {
            const Icon = b.icon;
            return h(
              GlassCard,
              { key: b.label, className: "!p-3.5" },
              [
                h("div", { className: "flex items-start justify-between gap-2" }, [
                  h(
                    "span",
                    {
                      className:
                        "flex h-9 w-9 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-600 dark:text-sky-300"
                    },
                    h(Icon, { className: "h-4 w-4" })
                  ),
                  h(TrendingUp, { className: "h-4 w-4 text-emerald-500/50 dark:text-emerald-400/50" })
                ]),
                h("p", { className: "mt-3 text-xs font-medium text-slate-500 dark:text-slate-400" }, b.label),
                h("p", { className: "mt-0.5 text-lg font-bold text-slate-900 dark:text-white" }, b.value)
              ]
            );
          })
        )
      ])
    ])
  ]);
}
