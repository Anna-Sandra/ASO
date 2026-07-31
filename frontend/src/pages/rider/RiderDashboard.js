import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  Car,
  CheckCircle2,
  Clock,
  History,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Navigation2,
  Package,
  PhoneCall,
  Settings as SettingsIcon,
  Star,
  Truck,
  User,
  Wallet,
  X,
  XCircle
} from "lucide-react";
import { useAuth, useTheme } from "context";
import { apiFetch, apiErrorMessage } from "services/api";
import { DeliveryLive } from "components/features/DeliveryLive";
import { ThemeToggleButton } from "components/ui";
import { h } from "utils/h";

/**
 * ── Backend contract this page assumes ──────────────────────────────────
 * GET   /api/deliveries/rider/assignments        -> { assignments: [...] }
 * PATCH /api/deliveries/:orderId/accept          -> { assignment }
 * PATCH /api/deliveries/:orderId/decline         -> { ok: true }
 * PATCH /api/deliveries/:orderId/status  {status}-> { assignment } (status: "picked_up" | "delivered")
 * GET   /api/notifications/summary               -> already used elsewhere in the app; optional here
 *
 * There is no earnings/online-status endpoint on the backend yet (confirmed via a prior 404), so:
 * - "Today's earnings", "Today's deliveries", "Pending deliveries" are computed LOCALLY from the
 *   assignments list already loaded on this page — no extra network call, so nothing here can 404.
 * - The Online/Offline toggle is local UI state only. If/when you add a rider-presence endpoint,
 *   wire it inside `toggleOnline()` below — that's the one spot to touch.
 * ─────────────────────────────────────────────────────────────────────── */

const BRAND = { name: "Arqosuah Groceries", green: "#0E7A3B" };
const STATUS_FLOW = ["assigned", "picked_up", "delivered"];

function getAddress(a, kind) {
  if (kind === "pickup") return a.pickupAddress || a.pickupLocation || a.sellerAddress || "";
  return a.deliveryAddress || a.address || a.customerAddress || a.dropoffAddress || "";
}
function getFee(a) {
  const v = a.deliveryFee ?? a.riderFee ?? a.fee ?? null;
  return typeof v === "number" ? v : null;
}
function getAcceptance(a) {
  return a.riderAcceptance || (a.orderStatus === "assigned" ? "pending" : "accepted");
}
function formatMoney(n) {
  if (typeof n !== "number") return "GH₵0.00";
  return `GH₵${n.toFixed(2)}`;
}
function navigateUrl(address) {
  if (!address) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}
function greeting() {
  const h24 = new Date().getHours();
  if (h24 < 12) return "Good Morning";
  if (h24 < 17) return "Good Afternoon";
  return "Good Evening";
}

/* ── Small building blocks ─────────────────────────────────────────────── */

function GlassCard({ className = "", children, id }) {
  return h(
    "div",
    {
      id,
      className: `rounded-[20px] border border-slate-200/70 bg-white/80 shadow-[0_8px_32px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-white/10 dark:bg-night-900/60 ${className}`.trim()
    },
    children
  );
}

function StatCard({ icon: Icon, label, value, sub, accent }) {
  return h(
    GlassCard,
    { className: "flex items-center gap-4 p-5 transition-transform duration-200 hover:-translate-y-0.5" },
    [
      h(
        "div",
        {
          key: "ic",
          className: "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
          style: { backgroundColor: `${accent}1A`, color: accent }
        },
        h(Icon, { className: "h-6 w-6" })
      ),
      h("div", { key: "txt", className: "min-w-0" }, [
        h("p", { key: "lab", className: "truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, label),
        h("p", { key: "val", className: "text-2xl font-bold text-slate-900 dark:text-white" }, value),
        sub ? h("p", { key: "sub", className: "text-xs text-slate-400" }, sub) : null
      ].filter(Boolean))
    ]
  );
}

function SidebarLink({ icon: Icon, label, active, onClick, to }) {
  const cls = [
    "flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition-colors duration-150",
    active
      ? "bg-[color:var(--brand-green)]/10 text-[color:var(--brand-green)]"
      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
  ].join(" ");
  const content = [
    h(Icon, { key: "ic", className: "h-[18px] w-[18px] shrink-0" }),
    h("span", { key: "tx" }, label)
  ];
  if (to) return h(Link, { to, className: cls }, content);
  return h("button", { type: "button", onClick, className: `${cls} w-full text-left` }, content);
}

/* ── Sidebar ────────────────────────────────────────────────────────────── */

function Sidebar({ display, online, onToggleOnline, onLogout, mobileOpen, onCloseMobile, onComingSoon }) {
  const nav = [
    { icon: LayoutDashboard, label: "Dashboard", active: true, to: "/rider" },
    { icon: Truck, label: "Deliveries", onClick: () => document.getElementById("current-delivery")?.scrollIntoView({ behavior: "smooth" }) },
    { icon: Wallet, label: "My Earnings", onClick: () => document.getElementById("earnings-breakdown")?.scrollIntoView({ behavior: "smooth" }) },
    { icon: Wallet, label: "Wallet", onClick: () => onComingSoon("Wallet") },
    { icon: History, label: "Orders History", onClick: () => onComingSoon("Orders History") },
    { icon: User, label: "Profile", onClick: () => onComingSoon("Profile") },
    { icon: Car, label: "Vehicle", onClick: () => onComingSoon("Vehicle") },
    { icon: LifeBuoy, label: "Support", onClick: () => onComingSoon("Support") },
    { icon: SettingsIcon, label: "Settings", onClick: () => onComingSoon("Settings") }
  ];

  const body = h(
    "div",
    { className: "flex h-full flex-col gap-6 p-5" },
    [
      h("div", { key: "brand", className: "flex items-center justify-between" }, [
        h("div", { key: "logo", className: "flex items-center gap-2.5" }, [
          h(
            "div",
            {
              key: "mark",
              className: "flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-lg",
              style: { backgroundColor: BRAND.green }
            },
            h(Package, { className: "h-5 w-5" })
          ),
          h("div", { key: "nm" }, [
            h("p", { key: "t1", className: "text-sm font-bold leading-tight text-slate-900 dark:text-white" }, "Arqosuah"),
            h("p", { key: "t2", className: "text-[10px] font-medium uppercase tracking-wider text-slate-400" }, "Groceries · Rider")
          ])
        ]),
        h(
          "button",
          { key: "close", type: "button", onClick: onCloseMobile, className: "rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden dark:hover:bg-white/10" },
          h(X, { className: "h-5 w-5" })
        )
      ]),
      h(
        "nav",
        { key: "nav", className: "flex flex-1 flex-col gap-1" },
        nav.map((item) => h(SidebarLink, { key: item.label, ...item }))
      ),
      h(
        "div",
        { key: "bottom", className: "space-y-3 border-t border-slate-200 pt-4 dark:border-white/10" },
        [
          h(
            "button",
            {
              key: "online",
              type: "button",
              onClick: onToggleOnline,
              className: `flex w-full items-center justify-between rounded-2xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                online
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400"
              }`
            },
            [
              h("span", { key: "tx" }, online ? "Online" : "Offline"),
              h("span", { key: "dot", className: `h-2.5 w-2.5 rounded-full ${online ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}` })
            ]
          ),
          h(
            GlassCard,
            { key: "profile", className: "flex items-center gap-3 p-3" },
            [
              h(
                "div",
                { key: "av", className: "flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-600 dark:bg-white/10 dark:text-slate-200" },
                display.slice(0, 1).toUpperCase()
              ),
              h("div", { key: "txt", className: "min-w-0 flex-1" }, [
                h("p", { key: "nm", className: "truncate text-sm font-semibold text-slate-800 dark:text-slate-100" }, display),
                h("p", { key: "role", className: "text-xs text-slate-400" }, "Courier")
              ]),
              h(
                "button",
                { key: "out", type: "button", onClick: onLogout, "aria-label": "Sign out", className: "rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-white/10" },
                h(LogOut, { className: "h-4 w-4" })
              )
            ]
          )
        ]
      )
    ]
  );

  return h(React.Fragment, null, [
    h(
      "aside",
      { key: "desktop", className: "sticky top-0 hidden h-screen w-[260px] shrink-0 border-r border-slate-200 bg-white/70 backdrop-blur-xl md:block dark:border-white/10 dark:bg-night-950/70" },
      body
    ),
    mobileOpen
      ? h(
          "div",
          { key: "mobile", className: "fixed inset-0 z-50 md:hidden" },
          [
            h("div", { key: "backdrop", className: "absolute inset-0 bg-black/40", onClick: onCloseMobile }),
            h("aside", { key: "panel", className: "absolute left-0 top-0 h-full w-[280px] bg-white shadow-2xl dark:bg-night-950" }, body)
          ]
        )
      : null
  ].filter(Boolean));
}

/* ── Current delivery card ─────────────────────────────────────────────── */

function CurrentDeliveryCard({ assignment: a, onOpenDetails }) {
  if (!a) {
    return h(
      GlassCard,
      { id: "current-delivery", className: "flex flex-col items-center justify-center gap-2 p-8 text-center" },
      [
        h(Package, { key: "ic", className: "h-8 w-8 text-slate-300" }),
        h("p", { key: "tx", className: "text-sm text-slate-400" }, "No active delivery selected")
      ]
    );
  }
  const fee = getFee(a);
  return h(
    GlassCard,
    { id: "current-delivery", className: "space-y-4 p-5" },
    [
      h("div", { key: "head", className: "flex items-center justify-between" }, [
        h("p", { key: "id", className: "text-xs font-bold uppercase tracking-wide text-slate-400" }, `#${String(a.orderId).slice(-8)}`),
        h(
          "span",
          {
            key: "pay",
            className: `rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
              a.paymentStatus === "paid"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-amber-500/15 text-amber-700 dark:text-amber-300"
            }`
          },
          a.paymentStatus || "pending"
        )
      ]),
      h("div", { key: "cust", className: "flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100" }, [
        h(User, { key: "ic", className: "h-4 w-4 text-slate-400" }),
        h("span", { key: "tx" }, a.customerName || "Customer")
      ]),
      h("div", { key: "route", className: "space-y-2 border-y border-dashed border-slate-200 py-3 dark:border-white/10" }, [
        h("div", { key: "pu", className: "flex gap-2 text-xs" }, [
          h("span", { key: "dot", className: "mt-0.5 h-2 w-2 shrink-0 rounded-full bg-slate-400" }),
          h("span", { key: "tx", className: "text-slate-500 dark:text-slate-400" }, getAddress(a, "pickup") || "Pickup address not provided")
        ]),
        h("div", { key: "do", className: "flex gap-2 text-xs" }, [
          h("span", { key: "dot", className: "mt-0.5 h-2 w-2 shrink-0 rounded-full", style: { backgroundColor: BRAND.green } }),
          h("span", { key: "tx", className: "font-medium text-slate-700 dark:text-slate-200" }, getAddress(a, "dropoff") || "Dropoff address not provided")
        ])
      ]),
      Array.isArray(a.items) && a.items.length
        ? h(
            "p",
            { key: "items", className: "text-xs text-slate-500 dark:text-slate-400" },
            `${a.items.length} item${a.items.length === 1 ? "" : "s"}`
          )
        : null,
      h("div", { key: "amt", className: "flex items-center justify-between pt-1" }, [
        h("span", { key: "lab", className: "text-xs font-semibold uppercase tracking-wide text-slate-400" }, "Delivery amount"),
        h("span", { key: "val", className: "text-lg font-bold", style: { color: BRAND.green } }, formatMoney(fee))
      ]),
      h(
        "button",
        {
          key: "cta",
          type: "button",
          onClick: onOpenDetails,
          className: "w-full rounded-2xl py-2.5 text-sm font-bold text-white shadow-lg transition-transform duration-150 hover:-translate-y-0.5 active:scale-[0.98]",
          style: { backgroundColor: BRAND.green }
        },
        "View Order Details"
      )
    ].filter(Boolean)
  );
}

/* ── Assignment actions: accept/decline/status/navigate ────────────────── */

function AssignmentActions({ assignment: a, actionState, onAccept, onDecline, onAdvanceStatus }) {
  const pending = getAcceptance(a) === "pending";
  const busy = Boolean(actionState.loading);
  const address = getAddress(a, "dropoff");
  const mapsUrl = navigateUrl(address);
  const currentIdx = STATUS_FLOW.indexOf(a.orderStatus);
  const nextStatus = currentIdx >= 0 && currentIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIdx + 1] : null;
  const nextLabel = nextStatus === "picked_up" ? "I've Arrived at Pickup" : nextStatus === "delivered" ? "Mark Delivered" : null;

  return h("div", { className: "space-y-3" }, [
    actionState.error
      ? h(
          "p",
          { key: "err", className: "rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300" },
          actionState.error
        )
      : null,
    pending
      ? h("div", { key: "accept", className: "flex gap-2" }, [
          h(
            "button",
            {
              key: "a",
              type: "button",
              disabled: busy,
              onClick: onAccept,
              className: "inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            },
            [h(CheckCircle2, { key: "ic", className: "h-4 w-4" }), h("span", { key: "t" }, busy ? "Working…" : "Accept")]
          ),
          h(
            "button",
            {
              key: "d",
              type: "button",
              disabled: busy,
              onClick: onDecline,
              className: "inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
            },
            [h(XCircle, { key: "ic", className: "h-4 w-4" }), h("span", { key: "t" }, "Decline")]
          )
        ])
      : h("div", { key: "status", className: "flex flex-wrap gap-2" }, [
          mapsUrl
            ? h(
                "a",
                {
                  key: "nav",
                  href: mapsUrl,
                  target: "_blank",
                  rel: "noreferrer",
                  className: "inline-flex items-center gap-1.5 rounded-2xl border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300"
                },
                [h(Navigation2, { key: "ic", className: "h-4 w-4" }), h("span", { key: "t" }, "Navigate")]
              )
            : null,
          nextLabel
            ? h(
                "button",
                {
                  key: "adv",
                  type: "button",
                  disabled: busy,
                  onClick: () => onAdvanceStatus(nextStatus),
                  className: "inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-2.5 text-sm font-bold text-white shadow-lg disabled:opacity-50",
                  style: { backgroundColor: BRAND.green }
                },
                busy ? "Working…" : nextLabel
              )
            : h("span", { key: "done", className: "text-xs font-semibold text-emerald-600 dark:text-emerald-400" }, "Delivered — nice work")
        ].filter(Boolean))
  ].filter(Boolean));
}

/* ── Main component ─────────────────────────────────────────────────────── */

export default function RiderDashboard() {
  const { accessToken, user, logout } = useAuth();
  const { dark, toggle } = useTheme();

  const [assignments, setAssignments] = useState([]);
  const [err, setErr] = useState("");
  const [selOrderId, setSelOrderId] = useState("");
  const [loading, setLoading] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [online, setOnline] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [actionState, setActionState] = useState({});
  const [notifCount, setNotifCount] = useState(null);
  const [toast, setToast] = useState("");

  const setOrderAction = (orderId, patch) => {
    setActionState((prev) => ({ ...prev, [orderId]: { ...prev[orderId], ...patch } }));
  };

  const loadAssignments = useCallback(async () => {
    if (!accessToken) return;
    setErr("");
    try {
      const d = await apiFetch("/api/deliveries/rider/assignments", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const list = Array.isArray(d.assignments) ? d.assignments : [];
      setAssignments(list);
      setSelOrderId((prev) => (prev && list.some((x) => x.orderId === prev) ? prev : list[0]?.orderId || ""));
    } catch (ex) {
      setErr(apiErrorMessage(ex, "Could not load assignments"));
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;
    (async () => {
      if (!cancelled) await loadAssignments();
    })();
    // Notifications summary is already used elsewhere in the app (confirmed working) — kept optional
    // and fully isolated so a failure here can never affect the rest of the dashboard.
    (async () => {
      try {
        const d = await apiFetch("/api/notifications/summary", {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!cancelled) setNotifCount(typeof d?.unread === "number" ? d.unread : null);
      } catch {
        if (!cancelled) setNotifCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, loadAssignments]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const runOrderAction = async (orderId, { url, method = "PATCH", body, onDone }) => {
    setOrderAction(orderId, { loading: true, error: "" });
    try {
      const d = await apiFetch(url, {
        method,
        headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      onDone?.(d);
      setOrderAction(orderId, { loading: false, error: "" });
    } catch (ex) {
      setOrderAction(orderId, { loading: false, error: apiErrorMessage(ex, "Action failed") });
    }
  };

  const handleAccept = (orderId) =>
    runOrderAction(orderId, {
      url: `/api/deliveries/${orderId}/accept`,
      onDone: () => setAssignments((prev) => prev.map((a) => (a.orderId === orderId ? { ...a, riderAcceptance: "accepted" } : a)))
    });

  const handleDecline = (orderId) =>
    runOrderAction(orderId, {
      url: `/api/deliveries/${orderId}/decline`,
      onDone: () => {
        setAssignments((prev) => prev.filter((a) => a.orderId !== orderId));
        setSelOrderId((prev) => (prev === orderId ? "" : prev));
      }
    });

  const handleAdvanceStatus = (orderId, nextStatus) =>
    runOrderAction(orderId, {
      url: `/api/deliveries/${orderId}/status`,
      body: { status: nextStatus },
      onDone: () => setAssignments((prev) => prev.map((a) => (a.orderId === orderId ? { ...a, orderStatus: nextStatus } : a)))
    });

  const onComingSoon = (label) => setToast(`${label} isn't built yet — coming soon`);
  const onLogout = async () => {
    try {
      await logout();
    } catch {
      /* ignore */
    }
  };

  const display = String(user?.displayName || "").trim() || (user?.email && user.email.split("@")[0]) || "Courier";
  const selected = assignments.find((a) => a.orderId === selOrderId) || null;

  const stats = useMemo(() => {
    const delivered = assignments.filter((a) => a.orderStatus === "delivered");
    const pending = assignments.filter((a) => a.orderStatus !== "delivered");
    const earned = delivered.reduce((sum, a) => sum + (getFee(a) || 0), 0);
    return { deliveredCount: delivered.length, pendingCount: pending.length, earned, delivered };
  }, [assignments]);

  const rating = typeof user?.rating === "number" ? user.rating.toFixed(1) : null;

  return h(
    "div",
    { className: "flex min-h-screen bg-white text-slate-800 dark:bg-night-950 dark:text-slate-200", style: { "--brand-green": BRAND.green } },
    [
      h(Sidebar, {
        key: "sidebar",
        display,
        online,
        onToggleOnline: () => setOnline((v) => !v),
        onLogout,
        mobileOpen: mobileNavOpen,
        onCloseMobile: () => setMobileNavOpen(false),
        onComingSoon
      }),

      h("div", { key: "main", className: "min-w-0 flex-1 bg-[#F8F9FA] dark:bg-night-950" }, [
        h(
          "header",
          { key: "navbar", className: "sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-4 py-4 backdrop-blur-xl md:px-8 dark:border-white/10 dark:bg-night-950/80" },
          [
            h("div", { key: "left", className: "flex min-w-0 items-center gap-3" }, [
              h(
                "button",
                { key: "menu", type: "button", onClick: () => setMobileNavOpen(true), className: "rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden dark:hover:bg-white/10" },
                h(Menu, { className: "h-5 w-5" })
              ),
              h("div", { key: "greet", className: "min-w-0" }, [
                h("h1", { key: "g", className: "truncate text-lg font-bold text-slate-900 md:text-xl dark:text-white" }, `${greeting()}, ${display}`),
                h("p", { key: "s", className: "truncate text-xs text-slate-400 md:text-sm" }, "Ready to deliver smiles today?")
              ])
            ]),
            h("div", { key: "right", className: "flex shrink-0 items-center gap-2" }, [
              h(
                "button",
                {
                  key: "onl",
                  type: "button",
                  onClick: () => setOnline((v) => !v),
                  className: `hidden items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold sm:flex ${
                    online ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-white/5"
                  }`
                },
                [h("span", { key: "dot", className: `h-2 w-2 rounded-full ${online ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}` }), h("span", { key: "t" }, online ? "Online" : "Offline")]
              ),
              h(ThemeToggleButton, { key: "th", dark, onToggle: toggle }),
              h(
                "button",
                { key: "bell", type: "button", onClick: () => onComingSoon("Notifications page"), className: "relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300" },
                [
                  h(Bell, { key: "ic", className: "h-[18px] w-[18px]" }),
                  notifCount ? h("span", { key: "badge", className: "absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white" }, notifCount > 9 ? "9+" : notifCount) : null
                ].filter(Boolean)
              )
            ])
          ]
        ),

        h("div", { key: "content", className: "space-y-6 px-4 py-6 md:px-8" }, [
          err
            ? h("p", { key: "e", className: "rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200" }, err)
            : null,

          h("div", { key: "stats", className: "grid grid-cols-2 gap-4 lg:grid-cols-4" }, [
            h(StatCard, { key: "s1", icon: Truck, label: "Today's Deliveries", value: loading ? "—" : stats.deliveredCount, accent: BRAND.green }),
            h(StatCard, { key: "s2", icon: Clock, label: "Pending Deliveries", value: loading ? "—" : stats.pendingCount, accent: "#F59E0B" }),
            h(StatCard, { key: "s3", icon: Wallet, label: "Today's Earnings", value: loading ? "—" : formatMoney(stats.earned), accent: "#0EA5E9" }),
            h(StatCard, { key: "s4", icon: Star, label: "Rating", value: rating || "New", sub: rating ? "out of 5.0" : "Complete deliveries to build rating", accent: "#A855F7" })
          ]),

          !loading && assignments.length === 0
            ? h(
                GlassCard,
                { className: "p-8 text-center text-sm text-slate-400" },
                "No active courier assignments yet. Sellers or admins attach you to orders using your user ID — then reload this page."
              )
            : null,

          assignments.length > 0
            ? h("div", { key: "middle", className: "grid grid-cols-1 gap-4 xl:grid-cols-[340px_1fr_300px]" }, [
                h("div", { key: "left", className: "space-y-4" }, [
                  h(
                    "div",
                    { key: "tabs", className: "flex flex-wrap gap-2" },
                    assignments.map((a) =>
                      h(
                        "button",
                        {
                          key: a.orderId,
                          type: "button",
                          onClick: () => setSelOrderId(a.orderId),
                          className: `rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
                            selOrderId === a.orderId
                              ? "text-white"
                              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                          }`,
                          style: selOrderId === a.orderId ? { backgroundColor: BRAND.green } : undefined
                        },
                        `#${String(a.orderId).slice(-8)}`
                      )
                    )
                  ),
                  h(CurrentDeliveryCard, { key: "card", assignment: selected, onOpenDetails: () => setDetailsOpen(true) }),
                  selected
                    ? h(
                        GlassCard,
                        { key: "actions", className: "p-4" },
                        h(AssignmentActions, {
                          assignment: selected,
                          actionState: actionState[selected.orderId] || {},
                          onAccept: () => handleAccept(selected.orderId),
                          onDecline: () => handleDecline(selected.orderId),
                          onAdvanceStatus: (next) => handleAdvanceStatus(selected.orderId, next)
                        })
                      )
                    : null
                ].filter(Boolean)),

                h(
                  GlassCard,
                  { key: "map", className: "flex min-h-[420px] flex-col overflow-hidden p-0" },
                  [
                    h("div", { key: "hd", className: "flex items-center justify-between border-b border-slate-100 px-5 py-3 dark:border-white/10" }, [
                      h("p", { key: "t", className: "text-sm font-bold text-slate-800 dark:text-slate-100" }, "Live tracking"),
                      h("span", { key: "s", className: "text-[10px] font-semibold uppercase tracking-wide text-slate-400" }, selected ? `#${String(selected.orderId).slice(-8)}` : "No order selected")
                    ]),
                    h(
                      "div",
                      { key: "body", className: "min-h-0 flex-1 p-3" },
                      selected
                        ? h(DeliveryLive, { mode: "rider", accessToken, orderId: selected.orderId, variant: "embedded" })
                        : h("div", { className: "flex h-full items-center justify-center text-sm text-slate-400" }, "Select an order to see the live map")
                    )
                  ]
                ),

                h("div", { key: "right", className: "space-y-4" }, [
                  h(
                    GlassCard,
                    { key: "earn", id: "earnings-breakdown", className: "space-y-3 p-4" },
                    [
                      h("p", { key: "t", className: "text-xs font-bold uppercase tracking-wide text-slate-400" }, "Today's Earnings Breakdown"),
                      stats.delivered.length === 0
                        ? h("p", { key: "empty", className: "text-xs text-slate-400" }, "No completed deliveries yet today")
                        : h(
                            "ul",
                            { key: "list", className: "space-y-2" },
                            stats.delivered.slice(0, 6).map((a) =>
                              h("li", { key: a.orderId, className: "flex items-center justify-between text-xs" }, [
                                h("span", { key: "id", className: "text-slate-500 dark:text-slate-400" }, `#${String(a.orderId).slice(-6)}`),
                                h("span", { key: "amt", className: "font-semibold text-slate-700 dark:text-slate-200" }, formatMoney(getFee(a)))
                              ])
                            )
                          ),
                      h("div", { key: "total", className: "flex items-center justify-between border-t border-slate-100 pt-2 dark:border-white/10" }, [
                        h("span", { key: "l", className: "text-xs font-bold text-slate-600 dark:text-slate-300" }, "Total"),
                        h("span", { key: "v", className: "text-sm font-bold", style: { color: BRAND.green } }, formatMoney(stats.earned))
                      ])
                    ]
                  ),
                  h(
                    GlassCard,
                    { key: "sched", className: "space-y-2 p-4" },
                    [
                      h("p", { key: "t", className: "text-xs font-bold uppercase tracking-wide text-slate-400" }, "Today's Schedule"),
                      assignments.filter((a) => a.orderStatus !== "delivered").length === 0
                        ? h("p", { key: "e", className: "text-xs text-slate-400" }, "Nothing else scheduled")
                        : h(
                            "ul",
                            { key: "list", className: "space-y-1.5" },
                            assignments
                              .filter((a) => a.orderStatus !== "delivered")
                              .slice(0, 5)
                              .map((a) =>
                                h("li", { key: a.orderId, className: "flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300" }, [
                                  h(Clock, { key: "ic", className: "h-3.5 w-3.5 text-slate-400" }),
                                  h("span", { key: "t", className: "truncate" }, `#${String(a.orderId).slice(-6)} · ${(a.orderStatus || "assigned").replace(/_/g, " ")}`)
                                ])
                              )
                          )
                    ]
                  ),
                  h(
                    GlassCard,
                    { key: "notif", className: "space-y-2 p-4" },
                    [
                      h("p", { key: "t", className: "text-xs font-bold uppercase tracking-wide text-slate-400" }, "Notifications"),
                      h(
                        "p",
                        { key: "v", className: "text-xs text-slate-500 dark:text-slate-400" },
                        notifCount == null ? "Up to date" : `${notifCount} unread`
                      )
                    ]
                  )
                ])
              ])
            : null,

          h("div", { key: "quick", className: "grid grid-cols-2 gap-4 lg:grid-cols-4" }, [
            h(QuickAction, { key: "q1", icon: online ? XCircle : CheckCircle2, label: online ? "Go Offline" : "Go Online", onClick: () => setOnline((v) => !v) }),
            h(QuickAction, {
              key: "q2",
              icon: Navigation2,
              label: "Navigate",
              onClick: () => {
                const url = selected ? navigateUrl(getAddress(selected, "dropoff")) : null;
                if (url) window.open(url, "_blank", "noreferrer");
                else setToast("Select an order first");
              }
            }),
            h(QuickAction, { key: "q3", icon: PhoneCall, label: "Contact Support", onClick: () => onComingSoon("Support") }),
            h(QuickAction, { key: "q4", icon: AlertTriangle, label: "Report Issue", onClick: () => onComingSoon("Report Issue") })
          ])
        ].filter(Boolean))
      ]),

      detailsOpen && selected
        ? h(
            "div",
            { key: "modal", className: "fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" },
            h(GlassCard, { className: "w-full max-w-md space-y-4 bg-white p-6 dark:bg-night-900" }, [
              h("div", { key: "hd", className: "flex items-center justify-between" }, [
                h("h2", { key: "t", className: "text-base font-bold text-slate-900 dark:text-white" }, `Order #${String(selected.orderId).slice(-8)}`),
                h("button", { key: "x", type: "button", onClick: () => setDetailsOpen(false), className: "rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10" }, h(X, { className: "h-5 w-5" }))
              ]),
              h("dl", { key: "dl", className: "space-y-2 text-sm" }, [
                h(DetailRow, { key: "cust", label: "Customer", value: selected.customerName || "—" }),
                h(DetailRow, { key: "pu", label: "Pickup", value: getAddress(selected, "pickup") || "—" }),
                h(DetailRow, { key: "do", label: "Dropoff", value: getAddress(selected, "dropoff") || "—" }),
                h(DetailRow, { key: "pay", label: "Payment status", value: selected.paymentStatus || "pending" }),
                h(DetailRow, { key: "amt", label: "Delivery amount", value: formatMoney(getFee(selected)) })
              ])
            ])
          )
        : null,

      toast
        ? h(
            "div",
            { key: "toast", className: "fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-xl dark:bg-white dark:text-slate-900" },
            toast
          )
        : null
    ].filter(Boolean)
  );
}

function DetailRow({ label, value }) {
  return h("div", { className: "flex items-start justify-between gap-4" }, [
    h("dt", { key: "l", className: "shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400" }, label),
    h("dd", { key: "v", className: "text-right text-sm font-medium text-slate-700 dark:text-slate-200" }, value)
  ]);
}

function QuickAction({ icon: Icon, label, onClick }) {
  return h(
    "button",
    {
      type: "button",
      onClick,
      className:
        "flex items-center gap-3 rounded-[20px] border border-slate-200 bg-white p-4 text-left shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-white/5"
    },
    [
      h("div", { key: "ic", className: "flex h-10 w-10 items-center justify-center rounded-xl", style: { backgroundColor: `${BRAND.green}1A`, color: BRAND.green } }, h(Icon, { className: "h-5 w-5" })),
      h("span", { key: "tx", className: "text-sm font-semibold text-slate-700 dark:text-slate-200" }, label)
    ]
  );
}