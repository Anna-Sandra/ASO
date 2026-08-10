import React, { useCallback, useEffect, useState } from "react";
import { Clock, LogOut, Navigation2, Package, RefreshCw } from "lucide-react";
import { useAuth, useTheme } from "context";
import { apiFetch, apiErrorMessage } from "services/api";
import { DeliveryLive } from "components/features/DeliveryLive";
import { ThemeToggleButton } from "components/ui";
import { h } from "utils/h";

/**
 * Backend contract:
 * GET  /api/deliveries/rider/assignments
 * PATCH /api/deliveries/order/:orderId/stage  { stage }
 * POST /api/deliveries/order/:orderId/confirm-delivery
 * POST /api/deliveries/order/:orderId/rider-location
 * Live map + handoff controls live in DeliveryLive (mode="rider").
 */

const STAGE_LABELS = {
  order_placed: "Order placed",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready_for_pickup: "Ready for pickup",
  picked_up: "Picked up",
  on_the_way: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled"
};

function getAddress(a) {
  return (
    a.dropoffLabel ||
    a.delivery?.dropoffLabel ||
    a.deliveryAddress ||
    a.address ||
    a.customerAddress ||
    a.dropoffAddress ||
    ""
  );
}

function getStage(a) {
  return a.deliveryStage || a.delivery?.currentStage || "";
}

function navigateUrl(a) {
  const label = getAddress(a);
  const lat = a.dropoffLatitude ?? a.delivery?.dropoffLatitude;
  const lng = a.dropoffLongitude ?? a.delivery?.dropoffLongitude;
  if (typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`;
  }
  if (!label) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(label)}`;
}

function formatMoney(n, currency = "GHS") {
  if (typeof n !== "number") return "—";
  try {
    return new Intl.NumberFormat("en-GH", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export default function RiderDashboard() {
  const { accessToken, user, logout } = useAuth();
  const { dark, toggle } = useTheme();

  const [assignments, setAssignments] = useState([]);
  const [err, setErr] = useState("");
  const [selOrderId, setSelOrderId] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadAssignments = useCallback(
    async ({ silent } = {}) => {
      if (!accessToken) return;
      if (!silent) setErr("");
      else setRefreshing(true);
      try {
        const d = await apiFetch("/api/deliveries/rider/assignments", {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const list = Array.isArray(d.assignments) ? d.assignments : [];
        setAssignments(list);
        setSelOrderId((prev) => {
          if (prev && list.some((x) => x.orderId === prev)) return prev;
          return list[0]?.orderId || "";
        });
      } catch (ex) {
        setErr(apiErrorMessage(ex, "Could not load assignments"));
      } finally {
        setRefreshing(false);
      }
    },
    [accessToken]
  );

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadAssignments();
    })();
    const t = setInterval(() => {
      void loadAssignments({ silent: true });
    }, 45000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [accessToken, loadAssignments]);

  const onLogout = async () => {
    try {
      await logout();
    } catch {
      /* ignore */
    }
  };

  const display =
    String(user?.displayName || "").trim() || (user?.email && user.email.split("@")[0]) || "Courier";

  const selected = assignments.find((a) => a.orderId === selOrderId) || null;

  return h(
    "div",
    {
      className:
        "min-h-screen bg-slate-50 px-4 py-8 pb-24 text-slate-800 dark:bg-night-950 dark:text-slate-200"
    },
    h(
      "div",
      { className: "mx-auto flex max-w-4xl flex-col gap-8" },
      h(
        "header",
        {
          className:
            "flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6 dark:border-white/10"
        },
        [
          h("div", { key: "brand", className: "flex items-center gap-3" }, [
            h(
              "div",
              {
                key: "ic",
                className:
                  "flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 shadow-lg shadow-sky-900/40"
              },
              h(Package, { className: "h-6 w-6 text-white", "aria-hidden": true })
            ),
            h("div", { key: "titles" }, [
              h(
                "p",
                {
                  key: "lab",
                  className: "text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-500"
                },
                "SHOPIQGH"
              ),
              h("h1", { key: "nm", className: "text-xl font-semibold text-slate-900 dark:text-white" }, display),
              h(
                "p",
                { key: "sub", className: "text-xs text-slate-500 dark:text-slate-400" },
                "Courier workspace · Live map & delivery confirmation"
              )
            ])
          ]),
          h("div", { key: "actions", className: "flex flex-wrap items-center gap-2" }, [
            h(ThemeToggleButton, { key: "th", dark, onToggle: toggle }),
            h(
              "button",
              {
                key: "out",
                type: "button",
                className:
                  "inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-night-900 dark:text-slate-300 dark:hover:bg-night-900/80",
                onClick: () => onLogout()
              },
              [
                h(LogOut, { key: "lio", className: "h-4 w-4 shrink-0", "aria-hidden": true }),
                h("span", { key: "tx" }, "Sign out")
              ]
            )
          ])
        ].filter(Boolean)
      ),

      err
        ? h(
            "p",
            {
              key: "e",
              className:
                "rounded-lg border border-amber-400/50 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-100"
            },
            err
          )
        : null,
      !err && assignments.length === 0
        ? h(
            "p",
            { key: "empty", className: "text-sm text-slate-500 dark:text-slate-400" },
            "No active courier assignments yet. After a vendor or admin assigns you to a paid order, it appears here — tap Refresh if you just got assigned."
          )
        : null,

      assignments.length > 0
        ? h(
            "div",
            { key: "work", className: "space-y-4" },
            [
              h(
                "div",
                { key: "tabsrow", className: "flex flex-wrap items-center gap-2" },
                [
                  ...assignments.map((a) => {
                    const stage = getStage(a);
                    return h(
                      "button",
                      {
                        key: a.orderId,
                        type: "button",
                        onClick: () => setSelOrderId(a.orderId),
                        className: [
                          "rounded-full px-4 py-1.5 text-xs font-semibold transition",
                          selOrderId === a.orderId
                            ? "bg-sky-600 text-white"
                            : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/15 dark:bg-night-900 dark:text-slate-300 dark:hover:bg-night-900/80"
                        ].join(" ")
                      },
                      `#${String(a.orderId).slice(-8)} · ${(STAGE_LABELS[stage] || stage || "assigned").toLowerCase()}`
                    );
                  }),
                  h(
                    "button",
                    {
                      key: "refresh-list",
                      type: "button",
                      onClick: () => loadAssignments({ silent: true }),
                      className:
                        "ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-white/15 dark:bg-night-900 dark:text-slate-300 dark:hover:bg-night-900/80"
                    },
                    [
                      h(RefreshCw, { key: "ic", className: `h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}` }),
                      h("span", { key: "tx" }, "Refresh")
                    ]
                  )
                ]
              ),

              selected
                ? h(AssignmentPanel, {
                    key: `panel-${selected.orderId}`,
                    assignment: selected,
                    accessToken,
                    onDeliveryUpdate: () => loadAssignments({ silent: true })
                  })
                : null
            ].filter(Boolean)
          )
        : null
    )
  );
}

function AssignmentPanel({ assignment: a, accessToken, onDeliveryUpdate }) {
  const address = getAddress(a);
  const stage = getStage(a);
  const mapsUrl = navigateUrl(a);

  return h(
    "div",
    {
      className:
        "space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-night-900/50"
    },
    [
      h(
        "div",
        { key: "info", className: "flex flex-wrap items-start justify-between gap-3" },
        [
          h("div", { key: "addr", className: "min-w-0 space-y-1" }, [
            h(
              "p",
              { key: "lab", className: "text-[10px] font-bold uppercase tracking-wide text-slate-500" },
              "Delivery address"
            ),
            h(
              "p",
              { key: "val", className: "text-sm font-medium text-slate-800 dark:text-slate-100" },
              address || "Not provided — open the map below for drop-off pin"
            ),
            a.itemSummary
              ? h("p", { key: "items", className: "text-xs text-slate-500 dark:text-slate-400" }, a.itemSummary)
              : null,
            a.total != null
              ? h(
                  "p",
                  { key: "tot", className: "text-xs font-semibold text-emerald-700 dark:text-emerald-300" },
                  formatMoney(a.total, a.currency || "GHS")
                )
              : null
          ]),
          h("div", { key: "right", className: "flex flex-wrap items-center gap-2" }, [
            h(
              "span",
              {
                key: "cur",
                className:
                  "inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300"
              },
              [
                h(Clock, { key: "ic", className: "h-3.5 w-3.5" }),
                h("span", { key: "tx" }, STAGE_LABELS[stage] || stage.replace(/_/g, " ") || "Assigned")
              ]
            ),
            mapsUrl
              ? h(
                  "a",
                  {
                    key: "nav",
                    href: mapsUrl,
                    target: "_blank",
                    rel: "noreferrer",
                    className:
                      "inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
                  },
                  [
                    h(Navigation2, { key: "ic", className: "h-3.5 w-3.5" }),
                    h("span", { key: "tx" }, "Navigate")
                  ]
                )
              : null
          ].filter(Boolean))
        ]
      ),

      h(
        "div",
        {
          key: "live",
          className: "rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5"
        },
        h(DeliveryLive, {
          mode: "rider",
          accessToken,
          orderId: a.orderId,
          variant: "embedded",
          onUpdate: onDeliveryUpdate
        })
      )
    ].filter(Boolean)
  );
}
