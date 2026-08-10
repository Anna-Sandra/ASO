import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Bike,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  History,
  LogOut,
  MapPin,
  Menu,
  Navigation2,
  Package,
  Phone,
  RefreshCw,
  Settings,
  Star,
  User,
  X
} from "lucide-react";
import { useAuth, useTheme } from "context";
import { apiFetch, apiErrorMessage } from "services/api";
import { DeliveryLive } from "components/features/DeliveryLive";
import { ThemeToggleButton } from "components/ui";
import { h } from "utils/h";

/**
 * Backend contract (unchanged):
 * GET  /api/deliveries/rider/assignments
 * GET  /api/deliveries/rider/assignments?includeCompleted=1
 * PATCH /api/deliveries/order/:orderId/stage
 * POST /api/deliveries/order/:orderId/confirm-delivery (via DeliveryLive)
 * POST /api/deliveries/order/:orderId/rider-location
 */

const NAV = [
  { id: "active", label: "Active Delivery", icon: Navigation2 },
  { id: "assigned", label: "Assigned Orders", icon: Package },
  { id: "history", label: "Delivery History", icon: History },
  { id: "profile", label: "Profile", icon: User },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "help", label: "Help & Support", icon: CircleHelp },
  { id: "settings", label: "Settings", icon: Settings }
];

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

const ONLINE_KEY = "shopiqgh_rider_online";

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

function navigateUrl(a, pickup) {
  const label = pickup
    ? a.vendorApproxLabel || a.vendorName || ""
    : getAddress(a);
  const lat = pickup ? null : a.dropoffLatitude ?? a.delivery?.dropoffLatitude;
  const lng = pickup ? null : a.dropoffLongitude ?? a.delivery?.dropoffLongitude;
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

function orderShort(id) {
  return `#${String(id || "").slice(-5).toUpperCase()}`;
}

function readOnlinePref() {
  try {
    const v = localStorage.getItem(ONLINE_KEY);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* ignore */
  }
  return true;
}

export default function RiderDashboard() {
  const { accessToken, user, logout } = useAuth();
  const { dark, toggle } = useTheme();

  const [tab, setTab] = useState("active");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [history, setHistory] = useState([]);
  const [err, setErr] = useState("");
  const [selOrderId, setSelOrderId] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState(() => readOnlinePref());

  const display =
    String(user?.displayName || "").trim() || (user?.email && user.email.split("@")[0]) || "Rider";
  const riderId = user?.id || user?._id ? `RDR-${String(user.id || user._id).slice(-4).toUpperCase()}` : "RDR-····";
  const rating =
    typeof user?.rating === "number"
      ? user.rating.toFixed(1)
      : typeof user?.riderRating === "number"
        ? user.riderRating.toFixed(1)
        : "4.8";
  const photo =
    (user?.profileImageUrl && String(user.profileImageUrl).trim()) ||
    (user?.photoUrl && String(user.photoUrl).trim()) ||
    null;

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

  const loadHistory = useCallback(async () => {
    if (!accessToken) return;
    try {
      const d = await apiFetch("/api/deliveries/rider/assignments?includeCompleted=1", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const list = Array.isArray(d.assignments) ? d.assignments : [];
      setHistory(list.filter((a) => getStage(a) === "delivered" || getStage(a) === "cancelled"));
    } catch {
      /* soft-fail — history panel shows empty */
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadAssignments();
      await loadHistory();
    })();
    const t = setInterval(() => {
      void loadAssignments({ silent: true });
    }, 45000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [accessToken, loadAssignments, loadHistory]);

  useEffect(() => {
    try {
      localStorage.setItem(ONLINE_KEY, online ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [online]);

  const onLogout = async () => {
    try {
      await logout();
    } catch {
      /* ignore */
    }
  };

  const selected = useMemo(
    () => assignments.find((a) => a.orderId === selOrderId) || null,
    [assignments, selOrderId]
  );

  const goTab = (id) => {
    setTab(id);
    setSidebarOpen(false);
  };

  const shellCls =
    "min-h-screen bg-[#f4f5f7] text-slate-800 transition-colors duration-300 dark:bg-[#0A0A0B] dark:text-slate-200";

  const sidebar = h(
    "aside",
    {
      className: [
        "fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col border-r border-white/10 bg-white/95 shadow-2xl backdrop-blur-xl transition-transform duration-300 dark:bg-[#121214]/95",
        "lg:static lg:translate-x-0 lg:shadow-none",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      ].join(" ")
    },
    [
      h("div", { key: "brand", className: "flex items-center gap-3 px-5 pb-2 pt-5" }, [
        h(
          "div",
          {
            key: "ic",
            className:
              "flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg shadow-orange-900/30"
          },
          h(Bike, { className: "h-6 w-6 text-white" })
        ),
        h("div", { key: "t", className: "min-w-0" }, [
          h("p", { className: "truncate text-sm font-bold text-slate-900 dark:text-white" }, "SHOPIQGH"),
          h("p", { className: "text-[11px] font-medium text-slate-500 dark:text-slate-400" }, "Rider Dashboard")
        ]),
        h(
          "button",
          {
            key: "close",
            type: "button",
            className: "ml-auto rounded-lg p-2 text-slate-500 lg:hidden",
            onClick: () => setSidebarOpen(false),
            "aria-label": "Close menu"
          },
          h(X, { className: "h-5 w-5" })
        )
      ]),

      h(
        "nav",
        { key: "nav", className: "mt-4 flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4" },
        NAV.map((item) => {
          const active = tab === item.id;
          const badge =
            item.id === "assigned"
              ? assignments.length
              : item.id === "notifications"
                ? 0
                : null;
          return h(
            "button",
            {
              key: item.id,
              type: "button",
              onClick: () => goTab(item.id),
              className: [
                "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-all duration-200",
                active
                  ? "bg-orange-500 text-white shadow-lg shadow-orange-900/25"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
              ].join(" ")
            },
            [
              h(item.icon, {
                key: "ic",
                className: `h-[18px] w-[18px] shrink-0 ${active ? "text-white" : "text-slate-400 group-hover:text-orange-500"}`
              }),
              h("span", { key: "lb", className: "flex-1 truncate" }, item.label),
              badge != null && badge > 0
                ? h(
                    "span",
                    {
                      key: "bd",
                      className: active
                        ? "rounded-full bg-white/25 px-1.5 text-[10px] font-bold"
                        : "rounded-full bg-slate-200 px-1.5 text-[10px] font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300"
                    },
                    String(badge)
                  )
                : null
            ].filter(Boolean)
          );
        })
      ),

      h(
        "div",
        {
          key: "status",
          className:
            "mx-3 mb-3 rounded-2xl border border-white/10 bg-slate-50/90 p-3 dark:bg-white/[0.04]"
        },
        [
          h("div", { key: "row", className: "flex items-center justify-between gap-2" }, [
            h("div", { key: "l", className: "flex items-center gap-2" }, [
              h("span", {
                className: `h-2.5 w-2.5 rounded-full ${online ? "animate-pulse bg-emerald-500" : "bg-slate-400"}`
              }),
              h(
                "span",
                { className: "text-xs font-bold text-slate-800 dark:text-slate-100" },
                online ? "You are Online" : "You are Offline"
              )
            ]),
            h(
              "button",
              {
                type: "button",
                onClick: () => setOnline((v) => !v),
                className: "text-[11px] font-semibold text-sky-600 hover:underline dark:text-sky-400"
              },
              online ? "Go offline" : "Go online"
            )
          ])
        ]
      ),

      h(
        "div",
        {
          key: "profile",
          className:
            "mx-3 mb-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-50/80 p-3 dark:bg-white/[0.04]"
        },
        [
          photo
            ? h("img", {
                key: "ph",
                src: photo,
                alt: "",
                className: "h-11 w-11 rounded-full object-cover ring-2 ring-orange-500/40"
              })
            : h(
                "div",
                {
                  key: "ph",
                  className:
                    "flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-sm font-bold text-white"
                },
                String(display).slice(0, 1).toUpperCase()
              ),
          h("div", { key: "meta", className: "min-w-0 flex-1" }, [
            h("p", { className: "truncate text-sm font-bold text-slate-900 dark:text-white" }, display),
            h("p", { className: "text-[11px] text-slate-500 dark:text-slate-400" }, riderId)
          ]),
          h(
            "span",
            {
              key: "rt",
              className: "inline-flex items-center gap-0.5 text-xs font-bold text-orange-500"
            },
            [h(Star, { key: "s", className: "h-3.5 w-3.5 fill-orange-500" }), rating]
          )
        ]
      )
    ]
  );

  const mobileHeader = h(
    "header",
    {
      className:
        "sticky top-0 z-30 flex items-center gap-3 bg-orange-500 px-4 py-3 text-white shadow-lg lg:hidden"
    },
    [
      h(
        "button",
        {
          key: "menu",
          type: "button",
          "aria-label": "Open menu",
          onClick: () => setSidebarOpen(true),
          className: "rounded-lg p-1.5 hover:bg-white/15"
        },
        h(Menu, { className: "h-5 w-5" })
      ),
      h("div", { key: "t", className: "min-w-0 flex-1" }, [
        h("p", { className: "truncate text-sm font-bold" }, tab === "active" ? "Active Delivery" : NAV.find((n) => n.id === tab)?.label || "Rider"),
        selected && tab === "active"
          ? h("p", { className: "text-[11px] text-orange-100" }, orderShort(selected.orderId))
          : null
      ].filter(Boolean)),
      h(ThemeToggleButton, { key: "th", dark, onToggle: toggle }),
      h(
        "button",
        {
          key: "ref",
          type: "button",
          onClick: () => loadAssignments({ silent: true }),
          className: "rounded-lg p-1.5 hover:bg-white/15",
          "aria-label": "Refresh"
        },
        h(RefreshCw, { className: `h-4 w-4 ${refreshing ? "animate-spin" : ""}` })
      )
    ]
  );

  const desktopHeader = h(
    "header",
    {
      className:
        "mb-5 hidden items-center justify-between gap-4 lg:flex"
    },
    [
      h("div", { key: "l", className: "flex items-center gap-3" }, [
        h("h1", { className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, NAV.find((n) => n.id === tab)?.label || "Dashboard"),
        tab === "active" && selected
          ? h(
              "span",
              {
                className:
                  "inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400"
              },
              [
                h("span", { key: "d", className: "h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" }),
                "Live"
              ]
            )
          : null
      ].filter(Boolean)),
      h("div", { key: "r", className: "flex items-center gap-2" }, [
        h(
          "button",
          {
            key: "ref",
            type: "button",
            onClick: () => {
              void loadAssignments({ silent: true });
              void loadHistory();
            },
            className:
              "inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-night-900 dark:text-slate-300 dark:hover:bg-night-800"
          },
          [
            h(RefreshCw, { key: "i", className: `h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}` }),
            "Refresh"
          ]
        ),
        h(
          "span",
          {
            key: "on",
            className: `inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
              online
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-400"
            }`
          },
          [h("span", { className: `h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-slate-400"}` }), online ? "Online" : "Offline"]
        ),
        h(ThemeToggleButton, { key: "th", dark, onToggle: toggle }),
        h(
          "button",
          {
            key: "out",
            type: "button",
            onClick: () => onLogout(),
            className:
              "inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-night-900 dark:text-slate-300"
          },
          [h(LogOut, { className: "h-3.5 w-3.5" }), "Sign out"]
        )
      ])
    ]
  );

  let mainBody = null;

  if (tab === "active") {
    mainBody =
      err
        ? h(
            "p",
            {
              className:
                "rounded-2xl border border-amber-400/50 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-100"
            },
            err
          )
        : !selected
          ? h(EmptyState, {
              title: "No active delivery",
              body: "When a vendor or admin assigns you to a paid order, it appears here. Pull to refresh after you get assigned."
            })
          : h(ActiveDeliveryView, {
              assignment: selected,
              assignments,
              selOrderId,
              setSelOrderId,
              accessToken,
              onDeliveryUpdate: () => {
                void loadAssignments({ silent: true });
                void loadHistory();
              }
            });
  } else if (tab === "assigned") {
    mainBody = h(OrdersList, {
      title: "Assigned Orders",
      items: assignments,
      empty: "No assigned orders right now.",
      onSelect: (id) => {
        setSelOrderId(id);
        goTab("active");
      },
      selectedId: selOrderId
    });
  } else if (tab === "history") {
    mainBody = h(OrdersList, {
      title: "Delivery History",
      items: history,
      empty: "Completed deliveries will show up here.",
      onSelect: null,
      selectedId: ""
    });
  } else if (tab === "profile") {
    mainBody = h(
      "div",
      {
        className:
          "rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-night-900/60"
      },
      [
        h("h2", { className: "text-lg font-bold text-slate-900 dark:text-white" }, "Profile"),
        h("div", { className: "mt-4 flex items-center gap-4" }, [
          photo
            ? h("img", { src: photo, alt: "", className: "h-16 w-16 rounded-full object-cover ring-2 ring-orange-500/40" })
            : h(
                "div",
                {
                  className:
                    "flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-xl font-bold text-white"
                },
                String(display).slice(0, 1).toUpperCase()
              ),
          h("div", {}, [
            h("p", { className: "text-base font-bold text-slate-900 dark:text-white" }, display),
            h("p", { className: "text-sm text-slate-500" }, riderId),
            user?.email ? h("p", { className: "text-sm text-slate-500" }, user.email) : null,
            h(
              "p",
              { className: "mt-1 inline-flex items-center gap-1 text-sm font-semibold text-orange-500" },
              [h(Star, { className: "h-4 w-4 fill-orange-500" }), `${rating} rating`]
            )
          ].filter(Boolean))
        ])
      ]
    );
  } else if (tab === "notifications") {
    mainBody = h(EmptyState, {
      title: "Notifications",
      body: "Delivery updates and assignments will appear here as they come in."
    });
  } else if (tab === "help") {
    mainBody = h(
      "div",
      {
        className:
          "rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-night-900/60"
      },
      [
        h("h2", { className: "text-lg font-bold text-slate-900 dark:text-white" }, "Help & Support"),
        h(
          "p",
          { className: "mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300" },
          "Need help with a delivery? Contact SHOPIQGH support from your account email, or use the in-app chat if available for your market."
        ),
        h(
          "a",
          {
            href: "mailto:support@shopiqgh.com",
            className:
              "mt-4 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-orange-900/20 hover:brightness-105"
          },
          "Email support"
        )
      ]
    );
  } else if (tab === "settings") {
    mainBody = h(
      "div",
      {
        className:
          "space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-night-900/60"
      },
      [
        h("h2", { className: "text-lg font-bold text-slate-900 dark:text-white" }, "Settings"),
        h("div", { className: "flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 dark:border-white/10" }, [
          h("div", {}, [
            h("p", { className: "text-sm font-semibold text-slate-800 dark:text-slate-100" }, "Appearance"),
            h("p", { className: "text-xs text-slate-500" }, "Light / dark follows system until you toggle")
          ]),
          h(ThemeToggleButton, { dark, onToggle: toggle })
        ]),
        h("div", { className: "flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 dark:border-white/10" }, [
          h("div", {}, [
            h("p", { className: "text-sm font-semibold text-slate-800 dark:text-slate-100" }, "Availability"),
            h("p", { className: "text-xs text-slate-500" }, online ? "Shown as online in the app" : "Shown as offline")
          ]),
          h(
            "button",
            {
              type: "button",
              onClick: () => setOnline((v) => !v),
              className: `relative h-7 w-12 rounded-full transition ${online ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`
            },
            h("span", {
              className: `absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${online ? "left-5" : "left-0.5"}`
            })
          )
        ]),
        h(
          "button",
          {
            type: "button",
            onClick: () => onLogout(),
            className:
              "inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-300 dark:hover:bg-rose-950/40"
          },
          [h(LogOut, { className: "h-4 w-4" }), "Sign out"]
        )
      ]
    );
  }

  return h(
    "div",
    { className: shellCls },
    [
      sidebarOpen
        ? h("div", {
            key: "scrim",
            className: "fixed inset-0 z-30 bg-black/50 backdrop-blur-[2px] lg:hidden",
            onClick: () => setSidebarOpen(false)
          })
        : null,
      h("div", { key: "layout", className: "flex min-h-screen" }, [
        sidebar,
        h(
          "div",
          { key: "main", className: "flex min-w-0 flex-1 flex-col" },
          [
            mobileHeader,
            h(
              "div",
              { key: "content", className: "mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-5 lg:px-8 lg:py-6" },
              [desktopHeader, mainBody]
            )
          ]
        )
      ])
    ].filter(Boolean)
  );
}

function EmptyState({ title, body }) {
  return h(
    "div",
    {
      className:
        "rounded-2xl border border-dashed border-slate-200 bg-white/70 px-6 py-14 text-center dark:border-white/10 dark:bg-night-900/40"
    },
    [
      h(Package, { key: "ic", className: "mx-auto h-10 w-10 text-orange-400/80" }),
      h("h3", { key: "t", className: "mt-3 text-base font-bold text-slate-900 dark:text-white" }, title),
      h("p", { key: "b", className: "mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400" }, body)
    ]
  );
}

function OrdersList({ title, items, empty, onSelect, selectedId }) {
  if (!items.length) return h(EmptyState, { title, body: empty });
  return h(
    "div",
    { className: "space-y-3" },
    items.map((a) => {
      const stage = getStage(a);
      const active = selectedId && a.orderId === selectedId;
      return h(
        "button",
        {
          key: a.orderId,
          type: "button",
          disabled: !onSelect,
          onClick: onSelect ? () => onSelect(a.orderId) : undefined,
          className: [
            "flex w-full items-start gap-3 rounded-2xl border p-4 text-left shadow-sm transition",
            active
              ? "border-orange-400 bg-orange-50 dark:border-orange-500/40 dark:bg-orange-950/30"
              : "border-slate-200/80 bg-white hover:border-orange-300 dark:border-white/10 dark:bg-night-900/60 dark:hover:border-orange-500/30",
            onSelect ? "cursor-pointer" : "cursor-default"
          ].join(" ")
        },
        [
          h(
            "div",
            {
              key: "ic",
              className:
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400"
            },
            h(Package, { className: "h-5 w-5" })
          ),
          h("div", { key: "m", className: "min-w-0 flex-1" }, [
            h("div", { className: "flex flex-wrap items-center gap-2" }, [
              h("p", { className: "text-sm font-bold text-slate-900 dark:text-white" }, orderShort(a.orderId)),
              h(
                "span",
                {
                  className:
                    "rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-white/10 dark:text-slate-300"
                },
                STAGE_LABELS[stage] || stage || "Assigned"
              )
            ]),
            h(
              "p",
              { className: "mt-1 truncate text-xs text-slate-600 dark:text-slate-300" },
              a.buyerName ? `${a.buyerName} · ${getAddress(a) || "Drop-off pending"}` : getAddress(a) || "Drop-off pending"
            ),
            a.vendorName
              ? h("p", { className: "mt-0.5 truncate text-[11px] text-slate-500" }, `Vendor · ${a.vendorName}`)
              : null
          ].filter(Boolean)),
          onSelect ? h(ChevronRight, { key: "ch", className: "mt-1 h-4 w-4 shrink-0 text-slate-400" }) : null
        ].filter(Boolean)
      );
    })
  );
}

function ActiveDeliveryView({ assignment: a, assignments, selOrderId, setSelOrderId, accessToken, onDeliveryUpdate }) {
  const address = getAddress(a);
  const stage = getStage(a);
  const dropNav = navigateUrl(a, false);
  const pickNav = navigateUrl(a, true);
  const phone = String(a.buyerPhone || "").replace(/[^\d+]/g, "");
  const telHref = phone ? `tel:${phone}` : null;
  const progress = [
    { key: "confirmed", label: "Order Confirmed", done: ["confirmed", "preparing", "ready_for_pickup", "picked_up", "on_the_way", "delivered"].includes(stage) || !!stage },
    { key: "picked_up", label: "Picked Up", done: ["picked_up", "on_the_way", "delivered"].includes(stage) },
    { key: "on_the_way", label: "Out for Delivery", done: ["on_the_way", "delivered"].includes(stage) },
    { key: "delivered", label: "Delivered", done: stage === "delivered" }
  ];

  const orderPanel = h(
    "div",
    {
      className:
        "flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-night-900/70 lg:p-5"
    },
    [
      assignments.length > 1
        ? h(
            "div",
            { key: "tabs", className: "flex gap-2 overflow-x-auto pb-1" },
            assignments.map((x) =>
              h(
                "button",
                {
                  key: x.orderId,
                  type: "button",
                  onClick: () => setSelOrderId(x.orderId),
                  className: [
                    "shrink-0 rounded-full px-3 py-1 text-[11px] font-bold transition",
                    selOrderId === x.orderId
                      ? "bg-orange-500 text-white shadow-md shadow-orange-900/20"
                      : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"
                  ].join(" ")
                },
                orderShort(x.orderId)
              )
            )
          )
        : null,

      h("div", { key: "hd" }, [
        h(
          "p",
          { className: "text-sm font-bold text-orange-500" },
          `Order Details ${orderShort(a.orderId)}`
        ),
        h("div", { className: "mt-2 flex items-center justify-between gap-2" }, [
          h("div", {}, [
            h("p", { className: "text-[10px] font-bold uppercase tracking-wider text-slate-400" }, "Customer"),
            h("p", { className: "text-sm font-semibold text-slate-900 dark:text-white" }, a.buyerName || "Customer")
          ]),
          telHref
            ? h(
                "a",
                {
                  href: telHref,
                  className:
                    "flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 text-white shadow-md shadow-orange-900/25 hover:brightness-105",
                  "aria-label": "Call customer"
                },
                h(Phone, { className: "h-4 w-4" })
              )
            : null
        ].filter(Boolean))
      ]),

      h(LocationBlock, {
        key: "del",
        label: "Delivery Address",
        value: address || "Not provided",
        navHref: dropNav
      }),
      h(LocationBlock, {
        key: "ven",
        label: "Vendor (Pickup)",
        value: a.vendorApproxLabel || a.vendorName || "Vendor pickup",
        navHref: pickNav
      }),

      Array.isArray(a.items) && a.items.length
        ? h(
            "div",
            {
              key: "items",
              className: "rounded-xl border border-slate-100 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/[0.03]"
            },
            a.items.slice(0, 4).map((it, i) =>
              h(
                "div",
                {
                  key: `${it.name}-${i}`,
                  className: "flex items-center justify-between gap-2 py-1 text-sm"
                },
                [
                  h("span", { className: "truncate font-medium text-slate-800 dark:text-slate-100" }, it.name || "Item"),
                  h("span", { className: "shrink-0 text-xs text-slate-500" }, `x${it.quantity || 1}`),
                  h(
                    "span",
                    { className: "shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-200" },
                    formatMoney(Number(it.unitPrice) * Number(it.quantity || 1), a.currency || "GHS")
                  )
                ]
              )
            )
          )
        : a.itemSummary
          ? h("p", { key: "sum", className: "text-xs text-slate-500" }, a.itemSummary)
          : null,

      h(
        "div",
        {
          key: "prog",
          className: "rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-white/[0.03]"
        },
        [
          h("p", { className: "mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400" }, "Delivery status"),
          ...progress.map((step, idx) =>
            h(
              "div",
              { key: step.key, className: "relative flex gap-3 pb-3 last:pb-0" },
              [
                h("div", { className: "flex w-5 flex-col items-center" }, [
                  step.done
                    ? h(CheckCircle2, { className: "h-5 w-5 text-emerald-500" })
                    : h("span", {
                        className: "mt-0.5 h-4 w-4 rounded-full border-2 border-orange-400 bg-transparent"
                      }),
                  idx < progress.length - 1
                    ? h("span", {
                        className: `mt-1 w-0.5 flex-1 ${step.done ? "bg-emerald-400" : "bg-slate-200 dark:bg-white/10"}`
                      })
                    : null
                ].filter(Boolean)),
                h("div", { className: "min-w-0 pb-1" }, [
                  h(
                    "p",
                    {
                      className: `text-sm font-semibold ${step.done ? "text-slate-800 dark:text-slate-100" : "text-slate-400"}`
                    },
                    step.label
                  ),
                  !step.done && step.key === "delivered"
                    ? h("p", { className: "text-[11px] text-orange-500" }, "Pending")
                    : null
                ].filter(Boolean))
              ]
            )
          )
        ]
      ),

      h(
        "div",
        {
          key: "stats",
          className: "grid grid-cols-3 gap-2 rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-center dark:border-white/10 dark:bg-white/[0.03]"
        },
        [
          h(StatCell, {
            key: "eta",
            label: "ETA",
            value:
              a.estimatedArrivalMinutes != null && Number.isFinite(a.estimatedArrivalMinutes)
                ? `${Math.round(a.estimatedArrivalMinutes)} min`
                : "—"
          }),
          h(StatCell, {
            key: "st",
            label: "Status",
            value: STAGE_LABELS[stage] || "Assigned"
          }),
          h(StatCell, {
            key: "tot",
            label: "Total",
            value: formatMoney(a.total, a.currency || "GHS")
          })
        ]
      ),

      h(
        "p",
        { key: "hint", className: "text-[11px] leading-relaxed text-slate-500 dark:text-slate-400" },
        "Use Confirm Delivery below the map when the customer has their order. Make sure you have delivered the order to the customer."
      )
    ].filter(Boolean)
  );

  return h(
    "div",
    { className: "space-y-4" },
    [
      h(
        "div",
        {
          key: "grid",
          className: "grid gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] lg:items-start"
        },
        [
          h("div", { key: "left", className: "order-2 space-y-4 lg:order-1" }, orderPanel),
          h(
            "div",
            {
              key: "map",
              className:
                "order-1 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-lg shadow-black/10 dark:border-white/10 dark:bg-night-900/50 lg:order-2"
            },
            h(DeliveryLive, {
              mode: "rider",
              accessToken,
              orderId: a.orderId,
              variant: "embedded",
              className: "border-0 shadow-none",
              onUpdate: onDeliveryUpdate
            })
          )
        ]
      ),

      h(
        "div",
        {
          key: "features",
          className: "hidden grid-cols-2 gap-3 md:grid lg:grid-cols-4"
        },
        [
          ["Real-time Tracking", MapPin, "text-emerald-500"],
          ["Easy Navigation", Navigation2, "text-sky-500"],
          ["Delivery Updates", Package, "text-violet-500"],
          ["Instant Notifications", Bell, "text-amber-500"]
        ].map(([label, Icon, color]) =>
          h(
            "div",
            {
              key: label,
              className:
                "flex items-center gap-3 rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 shadow-sm dark:border-white/10 dark:bg-night-900/50"
            },
            [
              h(Icon, { className: `h-5 w-5 ${color}` }),
              h("span", { className: "text-xs font-semibold text-slate-700 dark:text-slate-200" }, label)
            ]
          )
        )
      )
    ]
  );
}

function LocationBlock({ label, value, navHref }) {
  return h(
    "div",
    {
      className: "rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-white/10 dark:bg-white/[0.03]"
    },
    [
      h("p", { className: "text-[10px] font-bold uppercase tracking-wider text-slate-400" }, label),
      h("p", { className: "mt-1 text-sm font-medium text-slate-800 dark:text-slate-100" }, value),
      navHref
        ? h(
            "a",
            {
              href: navHref,
              target: "_blank",
              rel: "noreferrer",
              className:
                "mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm hover:brightness-105"
            },
            [h(MapPin, { className: "h-3.5 w-3.5" }), "Navigate"]
          )
        : null
    ].filter(Boolean)
  );
}

function StatCell({ label, value }) {
  return h("div", {}, [
    h("p", { className: "text-[9px] font-bold uppercase tracking-wider text-slate-400" }, label),
    h("p", { className: "mt-0.5 truncate text-xs font-bold text-slate-800 dark:text-slate-100" }, value)
  ]);
}
