import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Bell,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ClipboardCopy,
  Clock,
  CreditCard,
  DollarSign,
  Edit3,
  Eye,
  FileText,
  Filter as FilterIcon,
  Flag,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  MessageSquare,
  Package,
  Percent,
  RefreshCcw,
  Search,
  Settings as SettingsIcon,
  Shield,
  ShoppingCart,
  Store,
  Trash2,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users as UsersIcon,
  Wallet,
  Truck,
  X,
  XCircle,
  Ban,
  Bike
} from "lucide-react";
import { useAuth, useNotice, useTheme } from "context";
import { apiFetch, getApiBase, apiErrorMessage } from "services/api";
import { CATEGORY_LABELS, withAllCategoryFirst } from "config/catalog";
import { LISTING_STOCK_WHEN_AVAILABLE } from "config/listingStock";
import { formatGhc } from "utils/money";
import { adminOrderFulfillmentBadgeTone, formatOrderFulfillmentLabel } from "utils/orderStatusDisplay";
import { h } from "utils/h";
import { AdminStoresPanel } from "pages/admin/adminStoresPanel";
import { AdminPromotionsPanel } from "pages/admin/adminPromotionsPanel";
import {
  Badge,
  Button,
  Field,
  GlassCard,
  GlassPanel,
  InlineNotice,
  SelectInput,
  TextArea,
  TextInput,
  ThemeToggleButton
} from "components/ui";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const REPORT_CATS = {
  item_not_delivered: "Item not delivered",
  wrong_item_received: "Wrong item received",
  fake_misleading_product: "Fake / misleading product",
  seller_not_responding: "Seller not responding",
  buyer_no_show: "Buyer didn't show up",
  payment_not_confirmed: "Payment not confirmed",
  fraudulent_activity: "Fraudulent activity",
  abuse_misconduct: "Abuse / misconduct",
  fake_seller: "Fake / misleading seller",
  scam: "Scam",
  bad_product: "Bad product / listing",
  chat_abuse: "Abuse in messages",
  other: "Other"
};

const REJECT_REASONS = [
  "Prohibited item",
  "Violates community policy",
  "Duplicate listing",
  "Missing or misleading information",
  "Suspicious pricing",
  "Low quality images",
  "Other"
];

const VENDOR_LOC_BASE_LABELS = {
  on_campus: "On-site",
  off_campus: "Off-site"
};

const SIDEBAR_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "users", label: "Users", icon: UsersIcon },
  { id: "riders", label: "Riders", icon: Bike },
  { id: "vendor-apps", label: "Vendor requests", icon: ClipboardList, badgeKey: "vendor-apps" },
  { id: "stores", label: "Stores", icon: Store, badgeKey: "stores" },
  { id: "promotions", label: "Deals & coupons", icon: Percent },
  { id: "courier-apps", label: "Courier requests", icon: Truck, badgeKey: "courier-apps" },
  { id: "sellers", label: "Sellers", icon: UserCheck },
  { id: "listings", label: "Listings", icon: Package, badgeKey: "listings" },
  { id: "orders", label: "Orders", icon: ShoppingCart, badgeKey: "orders" },
  { id: "payments", label: "Payments", icon: DollarSign },
  { id: "reports", label: "Reports", icon: AlertTriangle, badgeKey: "reports" },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "settings", label: "Settings", icon: SettingsIcon },
  { id: "logs", label: "System logs", icon: Activity }
];

const PAGE_TITLES = {
  dashboard: { title: "Dashboard", hint: "Overview of your marketplace" },
  users: { title: "Users", hint: "Filter by buyers, vendors (sellers), or admins" },
  riders: { title: "Riders & couriers", hint: "Delivery accounts with vehicle profile (separate from marketplace users)" },
  "vendor-apps": { title: "Vendor applications", hint: "Review requests to become a seller" },
  stores: { title: "Store approvals", hint: "Review vendor storefronts before they go public" },
  promotions: {
    title: "Deals & coupons",
    hint: "Approve vendor-submitted banners, flash sales, and coupon codes before shoppers see them"
  },
  "courier-apps": { title: "Courier applications", hint: "Review shoppers who applied to deliver (delivery partner)" },
  sellers: { title: "Sellers verification", hint: "Verify and approve seller accounts" },
  listings: { title: "Listings", hint: "Manage every product on the platform" },
  orders: { title: "Orders", hint: "Manage customer orders" },
  payments: { title: "Payments & Revenue", hint: "Track transactions and platform earnings" },
  reports: { title: "Reports & Complaints", hint: "Manage user reports and complaints" },
  messages: { title: "Messages", hint: "Support threads with users and buyer–seller moderation" },
  settings: { title: "Settings", hint: "Manage platform settings and configurations" },
  logs: {
    title: "System logs",
    hint: "Orders, sign-ups, listings, reports, vendor requests, and admin actions (settings, moderation, deletes)"
  }
};

const USER_TABS = [
  { id: "all", label: "All users" },
  { id: "buyer", label: "Buyers" },
  { id: "seller", label: "Sellers" },
  { id: "admin", label: "Admins" }
];

const VENDOR_APP_TABS = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" }
];

const COURIER_APP_TABS = VENDOR_APP_TABS;

const SELLER_TABS = [
  { id: "pending", label: "Pending verification" },
  { id: "verified", label: "Verified sellers" },
  { id: "rejected", label: "Rejected" }
];

const LISTING_TABS = [
  { id: "all", label: "All listings" },
  { id: "pending_approval", label: "Pending approval" },
  { id: "active", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "draft", label: "Drafts" },
  { id: "flagged", label: "Flagged" }
];

const ORDER_TABS = [
  { id: "all", label: "All orders" },
  { id: "pending_payment", label: "Pending" },
  { id: "awaiting_vendor_payment", label: "Awaiting vendor" },
  { id: "processing", label: "Processing" },
  { id: "delivered", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "refund_pending", label: "Refund pending" },
  { id: "refunded", label: "Refunded" },
  { id: "dispute", label: "Disputes" }
];

const PAYMENT_TABS = [
  { id: "transactions", label: "Transactions" },
  { id: "payouts", label: "Payouts" },
  { id: "refunds", label: "Refunds" }
];

const REPORT_TABS = [
  { id: "all", label: "All Reports", countKey: "all" },
  { id: "open", label: "Pending", countKey: "open" },
  { id: "in_review", label: "Reviewing", countKey: "in_review" },
  { id: "resolved", label: "Resolved", countKey: "resolved" },
  { id: "dismissed", label: "Dismissed", countKey: "dismissed" }
];

const REPORT_PRIORITY_OPTS = [
  { id: "all", label: "All priorities" },
  { id: "high", label: "High" },
  { id: "medium", label: "Medium" },
  { id: "low", label: "Low" }
];

const SETTINGS_TABS = [
  { id: "general", label: "General" },
  { id: "vendor-billing", label: "Seller billing" },
  { id: "commission", label: "Commission" },
  { id: "payments", label: "Payment methods" },
  { id: "email", label: "Email & delivery" },
  { id: "rules", label: "Listing rules" },
  { id: "others", label: "Overview" }
];

const SETTINGS_TAB_IDS = new Set(SETTINGS_TABS.map((t) => t.id));

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/** Maps stored refund state + Paystack remote status for badges. */
function refundBadgeTone(o) {
  const rs = o.refundStatus || "none";
  const remote = String(o.paystackRefundRemoteStatus || "").toLowerCase();
  if (rs === "refunded") return "info";
  if (rs === "refund_processing" && remote === "failed") return "danger";
  if (rs === "refund_processing") return "warn";
  if (rs === "requested") return "warn";
  return "neutral";
}

function humanizeRefundStatus(status, remote) {
  const r = String(remote || "").toLowerCase();
  const s = String(status || "none");
  if (s === "requested") return "Refund requested";
  if (s === "refund_processing") {
    if (r === "failed") return "Refund failed (Paystack)";
    return "Refund in progress (Paystack)";
  }
  if (s === "refunded") return "Refunded";
  if (s === "none" || s === "") return "None";
  return s.replace(/_/g, " ");
}

function formatListingStatus(s) {
  if (s === "pending_approval") return "Pending";
  if (s === "active") return "Approved";
  if (s === "rejected") return "Rejected";
  if (s === "draft") return "Draft";
  return s || "—";
}

function listingStatusTone(s) {
  if (s === "active") return "success";
  if (s === "pending_approval") return "warn";
  if (s === "rejected") return "danger";
  if (s === "draft") return "neutral";
  return "neutral";
}

function reportStatusTone(s) {
  if (s === "open") return "warn";
  if (s === "in_review") return "info";
  if (s === "resolved") return "success";
  if (s === "dismissed") return "neutral";
  return "neutral";
}

function reportStatusLabel(s) {
  if (s === "open") return "Pending";
  if (s === "in_review") return "Reviewing";
  if (s === "resolved") return "Resolved";
  if (s === "dismissed") return "Dismissed";
  return s || "—";
}

function reportPriorityTone(p) {
  if (p === "high") return "danger";
  if (p === "medium") return "warn";
  if (p === "low") return "neutral";
  return "neutral";
}

function accountStatusTone(s) {
  if (s === "active") return "success";
  if (s === "suspended") return "warn";
  if (s === "banned") return "danger";
  return "neutral";
}

function vendorAppStatusTone(status) {
  if (status === "pending") return "warn";
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  return "neutral";
}

function userInitials(u) {
  const name = (u?.displayName || u?.email || "").trim();
  if (!name) return "?";
  const parts = name.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || name[0]?.toUpperCase() || "?";
}

function shortId(id) {
  if (!id) return "—";
  return `#${String(id).slice(-6).toUpperCase()}`;
}

function fmtDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

/** Compact one-line date for dense admin tables. */
function fmtDateTable(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}

function fmtDateTime(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return "—";
  }
}

function buildUrl(path) {
  const base = (getApiBase && getApiBase()) || "";
  if (!path) return base;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/")) return `${base}${path}`;
  return `${base}/${path}`;
}

function productThumb(p) {
  if (!p) return null;
  if (Array.isArray(p.imageUrls) && p.imageUrls[0]) {
    const u = String(p.imageUrls[0]).trim();
    if (u) return buildUrl(u);
  }
  const first = Array.isArray(p?.images) && p.images[0] ? p.images[0] : null;
  const url = first && typeof first === "object" ? first.url : first;
  if (!url) return null;
  return buildUrl(url);
}

/** All gallery URLs for review modals (vendor uploads are stored as `imageUrls`). */
function productImageUrls(p) {
  if (!p) return [];
  if (Array.isArray(p.imageUrls) && p.imageUrls.length) {
    return p.imageUrls.map((u) => String(u).trim()).filter(Boolean).map((u) => buildUrl(u));
  }
  const t = productThumb(p);
  return t ? [t] : [];
}

/* -------------------------------------------------------------------------- */
/*  Small components                                                          */
/* -------------------------------------------------------------------------- */

function StatCard({ label, value, hint, icon: Icon, tone = "info" }) {
  const toneClass =
    tone === "success"
      ? "from-emerald-500/30 to-emerald-600/15 text-emerald-900 dark:from-emerald-500/20 dark:to-emerald-500/5 dark:text-emerald-200"
      : tone === "warn"
        ? "from-amber-500/30 to-amber-600/15 text-amber-950 dark:from-amber-500/20 dark:to-amber-500/5 dark:text-amber-200"
        : tone === "danger"
          ? "from-rose-500/30 to-rose-600/15 text-rose-900 dark:from-rose-500/20 dark:to-rose-500/5 dark:text-rose-200"
          : "from-sky-500/30 to-sky-600/15 text-sky-950 dark:from-sky-500/20 dark:to-sky-500/5 dark:text-sky-200";
  return h(GlassPanel, { className: "!p-4 sm:!p-5" }, [
    h("div", { key: "row", className: "flex items-start justify-between gap-3" }, [
      h("div", { key: "meta", className: "min-w-0" }, [
        h(
          "p",
          { className: "text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400" },
          label
        ),
        h(
          "p",
          { className: "mt-2 font-display text-2xl font-bold text-slate-900 dark:text-white" },
          value
        ),
        hint
          ? h("p", { className: "mt-1 text-xs text-slate-600 dark:text-slate-400" }, hint)
          : null
      ]),
      Icon
        ? h(
            "div",
            {
              key: "ic",
              className: `flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${toneClass}`
            },
            h(Icon, { className: "h-5 w-5" })
          )
        : null
    ])
  ]);
}

function TabBar({ tabs, value, onChange, className = "" }) {
  const orderedTabs = withAllCategoryFirst(tabs);
  return h(
    "div",
    {
      className: `flex flex-wrap gap-1 rounded-2xl border border-slate-200/90 bg-white/75 p-1 shadow-inner dark:border-white/10 dark:bg-white/5 ${className}`
    },
    orderedTabs.map((t) =>
      h(
        "button",
        {
          key: t.id,
          type: "button",
          onClick: () => onChange(t.id),
          className: `rounded-xl px-3 py-2 text-xs font-semibold transition sm:text-sm ${
            value === t.id
              ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-sky-900/30"
              : "text-slate-600 hover:bg-white/50 dark:text-slate-200 dark:hover:bg-white/10"
          }`
        },
        t.label
      )
    )
  );
}

function SearchBox({ value, onChange, placeholder = "Search…", className = "" }) {
  return h(
    "div",
    {
      className: `relative flex items-center ${className}`
    },
    [
      h(Search, {
        key: "ic",
        className: "pointer-events-none absolute left-3 h-4 w-4 text-slate-400 dark:text-slate-500"
      }),
      h("input", {
        key: "in",
        type: "search",
        value,
        onChange: (e) => onChange(e.target.value),
        placeholder,
        className:
          "w-full min-h-[40px] rounded-2xl border border-slate-300/70 bg-white/60 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 dark:border-white/10 dark:bg-night-900/60 dark:text-slate-100"
      })
    ]
  );
}

function Pager({ page, total, limit, onPage, className = "" }) {
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)));
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  return h(
    "div",
    {
      className: `flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 ${className}`
    },
    [
      h(
        "span",
        { key: "t" },
        `Showing ${start}-${end} of ${total} · page ${page}/${pages}`
      ),
      h("div", { key: "b", className: "flex items-center gap-1" }, [
        h(
          "button",
          {
            key: "p",
            type: "button",
            disabled: page <= 1,
            onClick: () => onPage(Math.max(1, page - 1)),
            className:
              "flex items-center gap-1 rounded-xl border border-slate-300/70 bg-white/50 px-2.5 py-1.5 text-xs font-medium hover:bg-white/70 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
          },
          [h(ChevronLeft, { key: "i", className: "h-3.5 w-3.5" }), "Prev"]
        ),
        h(
          "button",
          {
            key: "n",
            type: "button",
            disabled: page >= pages,
            onClick: () => onPage(Math.min(pages, page + 1)),
            className:
              "flex items-center gap-1 rounded-xl border border-slate-300/70 bg-white/50 px-2.5 py-1.5 text-xs font-medium hover:bg-white/70 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
          },
          ["Next", h(ChevronRight, { key: "i", className: "h-3.5 w-3.5" })]
        )
      ])
    ]
  );
}

function Avatar({ user, size = 36 }) {
  const bg =
    user?.role === "admin"
      ? "from-amber-400 to-orange-600"
      : user?.role === "seller"
        ? "from-fuchsia-500 to-indigo-600"
        : user?.role === "rider"
          ? "from-teal-500 to-emerald-700"
          : "from-sky-500 to-blue-700";
  return h(
    "div",
    {
      className: `flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow ${bg}`,
      style: { width: size, height: size }
    },
    userInitials(user)
  );
}

function EmptyState({ title, hint, icon: Icon = Package, className = "" }) {
  return h(
    "div",
    {
      className: `flex flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-slate-300/90 bg-slate-50/70 p-10 text-center dark:border-white/15 dark:bg-white/5 ${className}`
    },
    [
      h(
        "div",
        {
          key: "ic",
          className:
            "flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-200/60 text-slate-700 dark:bg-white/5 dark:text-slate-300"
        },
        h(Icon, { className: "h-6 w-6" })
      ),
      h(
        "p",
        { key: "t", className: "font-semibold text-slate-800 dark:text-slate-100" },
        title
      ),
      hint
        ? h(
            "p",
            { key: "h", className: "max-w-sm text-sm text-slate-600 dark:text-slate-400" },
            hint
          )
        : null
    ]
  );
}

function Modal({ open, title, onClose, children, size = "md" }) {
  if (!open) return null;
  const w = size === "lg" ? "max-w-3xl" : size === "sm" ? "max-w-md" : "max-w-xl";
  return h(
    "div",
    {
      className:
        "fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-md",
      onClick: onClose
    },
    h(
      "div",
      {
        onClick: (e) => e.stopPropagation(),
        className: `relative w-full ${w} rounded-3xl border border-slate-200/95 bg-gradient-to-br from-slate-50 to-white p-0 text-slate-900 shadow-2xl dark:border-white/15 dark:from-night-900 dark:to-night-950 dark:text-slate-100`
      },
      [
        h(
          "div",
          {
            key: "head",
            className:
              "flex items-center justify-between gap-3 border-b border-slate-200/95 px-5 py-4 dark:border-white/5"
          },
          [
            h(
              "h3",
              { key: "t", className: "font-display text-base font-bold" },
              title
            ),
            h(
              "button",
              {
                key: "x",
                type: "button",
                onClick: onClose,
                className:
                  "tap-target rounded-xl p-1.5 text-slate-500 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10",
                "aria-label": "Close"
              },
              h(X, { className: "h-5 w-5" })
            )
          ]
        ),
        h("div", { key: "body", className: "max-h-[75vh] overflow-y-auto p-5" }, children)
      ]
    )
  );
}

/* Inline revenue line chart (SVG, no deps). */
function RevenueLineChart({ series }) {
  const w = 720;
  const svgH = 200;
  const padL = 40;
  const padR = 20;
  const padB = 28;
  const padT = 16;
  const innerW = w - padL - padR;
  const baselineY = svgH - padB;
  const innerH = baselineY - padT;
  const vals = (series || []).map((d) => Number(d.platform) || 0);
  const max = Math.max(...vals, 1);
  const n = Math.max((series || []).length, 1);
  const step = n > 1 ? innerW / (n - 1) : 0;
  const pts = (series || []).map((d, i) => ({
    x: padL + i * step,
    y: padT + innerH * (1 - (Number(d.platform) || 0) / max),
    v: Number(d.platform) || 0,
    label: d.date
  }));
  let linePath = "";
  let areaPath = "";
  if (pts.length > 0) {
    linePath = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const cx = (p0.x + p1.x) / 2;
      const cy = (p0.y + p1.y) / 2;
      linePath += ` Q ${p0.x} ${p0.y} ${cx} ${cy}`;
    }
    const last = pts[pts.length - 1];
    linePath += ` L ${last.x} ${last.y}`;
    areaPath = `${linePath} L ${last.x} ${baselineY} L ${pts[0].x} ${baselineY} Z`;
  }
  const tickStep = Math.max(1, Math.ceil(n / 7));
  return h(
    "svg",
    {
      viewBox: `0 0 ${w} ${svgH}`,
      className: "h-48 w-full",
      role: "img",
      "aria-label": "Platform revenue over time",
      preserveAspectRatio: "xMidYMid meet"
    },
    [
      h("defs", { key: "defs" }, [
        h(
          "linearGradient",
          { key: "fill", id: "admRevFill", x1: "0%", y1: "0%", x2: "0%", y2: "100%" },
          [
            h("stop", { offset: "0%", stopColor: "rgb(2 132 199)", stopOpacity: 0.35 }),
            h("stop", { offset: "100%", stopColor: "rgb(2 132 199)", stopOpacity: 0.04 })
          ]
        ),
        h(
          "linearGradient",
          { key: "str", id: "admRevStroke", x1: "0%", y1: "0%", x2: "100%", y2: "0%" },
          [
            h("stop", { offset: "0%", stopColor: "rgb(3 105 161)" }),
            h("stop", { offset: "100%", stopColor: "rgb(67 56 202)" })
          ]
        )
      ]),
      h("line", {
        key: "base",
        x1: padL,
        x2: w - padR,
        y1: baselineY,
        y2: baselineY,
        className: "stroke-slate-400 dark:stroke-slate-500",
        strokeWidth: 1.25
      }),
      areaPath
        ? h("path", { key: "area", d: areaPath, fill: "url(#admRevFill)", stroke: "none" })
        : null,
      linePath
        ? h("path", {
            key: "line",
            d: linePath,
            fill: "none",
            stroke: "url(#admRevStroke)",
            strokeWidth: 2.5,
            strokeLinecap: "round",
            strokeLinejoin: "round"
          })
        : null,
      ...pts.map((p, i) =>
        h(
          "g",
          { key: `pt-${i}` },
          [
            h("title", { key: "tt" }, `${p.label}: ${formatGhc(p.v)}`),
            h("circle", {
              key: "c",
              cx: p.x,
              cy: p.y,
              r: 2.5,
              className: "fill-sky-600 stroke-slate-900 dark:fill-sky-300 dark:stroke-slate-100",
              strokeWidth: 1
            }),
            (i % tickStep === 0 || i === pts.length - 1) &&
              h(
                "text",
                {
                  key: "lb",
                  x: p.x,
                  y: svgH - 6,
                  fontSize: 10,
                  className: "fill-slate-700 dark:fill-slate-400",
                  textAnchor: "middle"
                },
                (p.label || "").slice(5)
              )
          ].filter(Boolean)
        )
      )
    ].filter(Boolean)
  );
}

/* -------------------------------------------------------------------------- */
/*  Main admin page                                                           */
/* -------------------------------------------------------------------------- */

const USER_ROLES = ["all", "buyer", "seller", "admin"];

function readUsersRoleFromUrl() {
  try {
    if (typeof window === "undefined") return "all";
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("tab") !== "users") return "all";
    const p = (sp.get("usersRole") || "all").toLowerCase();
    return USER_ROLES.includes(p) ? p : "all";
  } catch {
    return "all";
  }
}

export function AdminPage() {
  const { user, accessToken, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const { confirm, alert, toast } = useNotice();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "dashboard";
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const auth = useMemo(
    () => (accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : null),
    [accessToken]
  );
  const isSuperAdmin = user?.adminLevel === "super";
  const visibleSidebarItems = isSuperAdmin ? SIDEBAR_ITEMS : SIDEBAR_ITEMS.filter((it) => it.id !== "settings");

  useEffect(() => {
    if (tab === "settings" && !isSuperAdmin) {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.delete("tab");
          n.delete("settingsTab");
          return n;
        },
        { replace: true }
      );
    }
  }, [tab, isSuperAdmin, setSearchParams]);

  /* Dashboard */
  const [dashboard, setDashboard] = useState(null);

  /* Sidebar attention badges (orders / vendor-apps / listings / reports / disputes). Polled every 30s. */
  const [navBadges, setNavBadges] = useState({});

  /* Users */
  const [users, setUsers] = useState([]);
  const [userCounts, setUserCounts] = useState(null);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersRoleTab, setUsersRoleTab] = useState(readUsersRoleFromUrl);
  const usersRoleRef = useRef(usersRoleTab);
  usersRoleRef.current = usersRoleTab;

  const setTab = (id) => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (id === "dashboard") {
          n.delete("tab");
          n.delete("usersRole");
          n.delete("settingsTab");
        } else {
          n.set("tab", id);
          if (id !== "settings") n.delete("settingsTab");
          if (id === "users") {
            const r = usersRoleRef.current;
            if (r && r !== "all" && USER_ROLES.includes(r)) n.set("usersRole", r);
            else n.delete("usersRole");
          } else {
            n.delete("usersRole");
          }
        }
        return n;
      },
      { replace: true }
    );
  };

  const setSettingsSection = (sid) => {
    if (!SETTINGS_TAB_IDS.has(sid)) return;
    setSettingsTab(sid);
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set("tab", "settings");
        if (sid === "general") n.delete("settingsTab");
        else n.set("settingsTab", sid);
        return n;
      },
      { replace: true }
    );
  };

  const settingsTabParam = searchParams.get("settingsTab");
  useEffect(() => {
    if (tab !== "settings") return;
    const st = (settingsTabParam || "general").toLowerCase();
    if (SETTINGS_TAB_IDS.has(st)) setSettingsTab(st);
    else setSettingsTab("general");
  }, [tab, settingsTabParam]);

  const onUsersRoleChange = (v) => {
    if (!USER_ROLES.includes(v)) return;
    setUsersRoleTab(v);
    if (tab === "users") {
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.set("tab", "users");
          if (v === "all") n.delete("usersRole");
          else n.set("usersRole", v);
          return n;
        },
        { replace: true }
      );
    }
  };

  const [usersStatus, setUsersStatus] = useState("all");
  const [usersSearch, setUsersSearch] = useState("");
  const [usersSearchInput, setUsersSearchInput] = useState("");
  const [addAdminOpen, setAddAdminOpen] = useState(false);
  const [addAdminEmail, setAddAdminEmail] = useState("");
  const [addAdminBusy, setAddAdminBusy] = useState(false);
  const usersLimit = 20;
  const [viewUser, setViewUser] = useState(null);

  /* Riders (delivery — not listed under Users) */
  const [riders, setRiders] = useState([]);
  const [ridersCounts, setRidersCounts] = useState(null);
  const [ridersTotal, setRidersTotal] = useState(0);
  const [ridersPage, setRidersPage] = useState(1);
  const [ridersStatus, setRidersStatus] = useState("all");
  const [ridersVerified, setRidersVerified] = useState("all");
  const [ridersSearch, setRidersSearch] = useState("");
  const [ridersSearchInput, setRidersSearchInput] = useState("");
  const ridersLimit = 20;
  const [addRiderOpen, setAddRiderOpen] = useState(false);
  const [addRiderBusy, setAddRiderBusy] = useState(false);
  const [addRiderForm, setAddRiderForm] = useState({
    email: "",
    password: "",
    displayName: "",
    phone: "",
    vehicleType: ""
  });

  /* Sellers verification */
  const [sellers, setSellers] = useState([]);
  const [sellersTotal, setSellersTotal] = useState(0);
  const [sellersPage, setSellersPage] = useState(1);
  const [sellersTab, setSellersTab] = useState("pending");
  const [sellersSearch, setSellersSearch] = useState("");
  const [sellersSearchInput, setSellersSearchInput] = useState("");
  const sellersLimit = 12;

  const [vendorAppRows, setVendorAppRows] = useState([]);
  const [vendorAppsTotal, setVendorAppsTotal] = useState(0);
  const [vendorAppsPage, setVendorAppsPage] = useState(1);
  const [vendorAppsStatus, setVendorAppsStatus] = useState("pending");
  const [vendorAppsSearch, setVendorAppsSearch] = useState("");
  const [vendorAppsSearchInput, setVendorAppsSearchInput] = useState("");
  const vendorAppsLimit = 15;
  /** Vendor application row when viewing verification document in modal */
  const [vendorVerificationApp, setVendorVerificationApp] = useState(null);

  const [courierAppRows, setCourierAppRows] = useState([]);
  const [courierAppsTotal, setCourierAppsTotal] = useState(0);
  const [courierAppsPage, setCourierAppsPage] = useState(1);
  const [courierAppsStatus, setCourierAppsStatus] = useState("pending");
  const [courierAppsSearch, setCourierAppsSearch] = useState("");
  const [courierAppsSearchInput, setCourierAppsSearchInput] = useState("");
  const courierAppsLimit = 15;

  /* Listings */
  const [listings, setListings] = useState([]);
  const [listingsTotal, setListingsTotal] = useState(0);
  const [listingsPage, setListingsPage] = useState(1);
  const [listingsTab, setListingsTab] = useState("pending_approval");
  const [listingsSearch, setListingsSearch] = useState("");
  const [listingsSearchInput, setListingsSearchInput] = useState("");
  const listingsLimit = 15;
  const [bulkApproveBusy, setBulkApproveBusy] = useState(false);
  const [rejectProduct, setRejectProduct] = useState(null);
  const [rejectReasonSel, setRejectReasonSel] = useState(REJECT_REASONS[0]);
  const [rejectNote, setRejectNote] = useState("");
  const [editProduct, setEditProduct] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", price: "", inStock: true, category: "", description: "" });
  const [viewProduct, setViewProduct] = useState(null);

  /* Orders */
  const [orders, setOrders] = useState([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersTab, setOrdersTab] = useState("all");
  const [ordersSearch, setOrdersSearch] = useState("");
  const [ordersSearchInput, setOrdersSearchInput] = useState("");
  const ordersLimit = 15;

  /* Payments */
  const [paymentsTab, setPaymentsTab] = useState("transactions");
  const [revenue, setRevenue] = useState(null);
  const [revDays, setRevDays] = useState(30);
  const [balances, setBalances] = useState([]);
  const [paidOrders, setPaidOrders] = useState([]);
  const [refundOrders, setRefundOrders] = useState([]);

  /* Reports */
  const [reports, setReports] = useState([]);
  const [reportsTotal, setReportsTotal] = useState(0);
  const [reportsCounts, setReportsCounts] = useState({ all: 0, open: 0, in_review: 0, resolved: 0, dismissed: 0 });
  const [reportsPage, setReportsPage] = useState(1);
  const [reportsTab, setReportsTab] = useState("all");
  const [reportsPriority, setReportsPriority] = useState("all");
  const [reportsSearch, setReportsSearch] = useState("");
  const [reportsSearchInput, setReportsSearchInput] = useState("");
  const reportsLimit = 15;
  const [viewReport, setViewReport] = useState(null);
  const [reportNote, setReportNote] = useState("");

  /* Messages */
  const [conversations, setConversations] = useState([]);
  const [conversationsTotal, setConversationsTotal] = useState(0);
  const [conversationsPage, setConversationsPage] = useState(1);
  const conversationsLimit = 20;
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [threadDetail, setThreadDetail] = useState(null);
  const [composeTargetUser, setComposeTargetUser] = useState(null);
  const [msgUserSearch, setMsgUserSearch] = useState("");
  const [msgUserHits, setMsgUserHits] = useState([]);
  const [adminSupportDraft, setAdminSupportDraft] = useState("");
  const [adminMsgSending, setAdminMsgSending] = useState(false);

  /* Settings */
  const [settingsTab, setSettingsTab] = useState("general");
  const [settings, setSettings] = useState(null);
  const [listingRulesLastEditor, setListingRulesLastEditor] = useState(null);
  const [emailDelivery, setEmailDelivery] = useState(null);
  const [emailTemplatePreviews, setEmailTemplatePreviews] = useState([]);
  const [emailLogs, setEmailLogs] = useState([]);
  const [emailLogsTotal, setEmailLogsTotal] = useState(0);
  const [emailLogsLoading, setEmailLogsLoading] = useState(false);
  const [emailPreviewId, setEmailPreviewId] = useState(null);
  const [settingsForm, setSettingsForm] = useState({
    commissionPercent: 5,
    momoEnabled: true,
    stripeEnabled: true,
    bankEnabled: true,
    listingPolicyNote: "",
    listingAllowedItemsNote: "",
    listingProhibitedItemsNote: "",
    listingModerationGuidelines: "",
    listingAutoRejectKeywords: [],
    listingAutoModerationEnabled: false,
    listingKeywordBlockEnabled: false,
    listingDefaultApprovalMode: "require_approval",
    listingKeywordViolationAction: "flag_review",
    siteName: "SHOPIQGH",
    siteDescription: "",
    supportEmail: "",
    maintenanceMode: false,
    maintenanceMessage: "",
    allowPublicRegistration: true,
    allowVendorApplications: true,
    allowCourierApplications: true,
    platformDeployedAt: "",
    vendorTrialMonths: 2,
    vendorSubscriptionBillingEnabled: true,
    vendorSubscriptionPriceGhs: 49,
    vendorSubscriptionPeriodMonths: 12
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [emailTestTo, setEmailTestTo] = useState("");
  const [emailTestSubject, setEmailTestSubject] = useState("");
  const [emailTestBody, setEmailTestBody] = useState("");
  const [emailTestSending, setEmailTestSending] = useState(false);
  const [listingKeywordDraft, setListingKeywordDraft] = useState("");
  const [listingPolicyPreviewOpen, setListingPolicyPreviewOpen] = useState(false);

  /* Global UI */
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  /** Ignore stale fetches so tab/filter switches never show data from a previous request. */
  const reqGen = useRef({
    users: 0,
    riders: 0,
    sellers: 0,
    vendorApps: 0,
    courierApps: 0,
    listings: 0,
    orders: 0,
    reports: 0,
    conversation: 0
  });

  /* ---------------- Data loaders (by tab) ---------------- */

  const loadDashboard = useCallback(async () => {
    if (!auth) return;
    const [d, rev] = await Promise.all([
      apiFetch("/api/admin/dashboard", auth),
      apiFetch(`/api/admin/revenue?days=30`, auth).catch(() => null)
    ]);
    setDashboard(d);
    if (rev) setRevenue(rev);
  }, [accessToken]);

  const loadNavBadges = useCallback(() => {
    if (!auth || user?.role !== "admin") return;
    apiFetch("/api/admin/badges", auth)
      .then((d) => setNavBadges(d?.badges || {}))
      .catch(() => {});
  }, [accessToken, user?.role]);

  useEffect(() => {
    loadNavBadges();
    const id = setInterval(loadNavBadges, 30000);
    const onVis = () => {
      if (document.visibilityState === "visible") loadNavBadges();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [loadNavBadges]);

  useEffect(() => {
    const total =
      Number(navBadges?.["vendor-apps"] || 0) +
      Number(navBadges?.stores || 0) +
      Number(navBadges?.["courier-apps"] || 0) +
      Number(navBadges?.listings || 0) +
      Number(navBadges?.orders || 0) +
      Number(navBadges?.reports || 0) +
      Number(navBadges?.disputes || 0);
    const prev = document.title;
    document.title = total > 0 ? `(${total > 99 ? "99+" : total}) Admin · SHOPIQGH` : "Admin · SHOPIQGH";
    return () => {
      document.title = prev;
    };
  }, [navBadges]);

  const loadUsers = useCallback(async () => {
    if (!auth) return;
    const g = ++reqGen.current.users;
    const roleParam = USER_ROLES.includes(usersRoleTab) ? usersRoleTab : "all";
    const qs = new URLSearchParams({
      page: String(usersPage),
      limit: String(usersLimit),
      role: roleParam,
      accountStatus: usersStatus,
      search: usersSearch
    });
    const d = await apiFetch(`/api/admin/users?${qs.toString()}`, auth);
    if (g !== reqGen.current.users) return;
    const raw = d.users || [];
    const list =
      roleParam !== "all" ? raw.filter((u) => (u.role || "buyer") === roleParam) : raw;
    setUsers(list);
    setUsersTotal(d.total != null ? d.total : 0);
    setUserCounts(d.counts || null);
  }, [accessToken, usersPage, usersRoleTab, usersStatus, usersSearch]);

  const loadRiders = useCallback(async () => {
    if (!auth) return;
    const g = ++reqGen.current.riders;
    const qs = new URLSearchParams({
      page: String(ridersPage),
      limit: String(ridersLimit),
      accountStatus: ridersStatus,
      verified: ridersVerified,
      search: ridersSearch
    });
    const d = await apiFetch(`/api/admin/riders?${qs.toString()}`, auth);
    if (g !== reqGen.current.riders) return;
    setRiders(d.riders || []);
    setRidersTotal(d.total != null ? d.total : 0);
    setRidersCounts(d.counts || null);
  }, [accessToken, ridersPage, ridersStatus, ridersVerified, ridersSearch]);

  const loadSellers = useCallback(async () => {
    if (!auth) return;
    const g = ++reqGen.current.sellers;
    const verified = sellersTab === "verified" ? "yes" : sellersTab === "pending" ? "no" : "all";
    const accountStatus = sellersTab === "rejected" ? "banned" : "all";
    const qs = new URLSearchParams({
      page: String(sellersPage),
      limit: String(sellersLimit),
      role: "seller",
      verified,
      accountStatus,
      search: sellersSearch
    });
    const d = await apiFetch(`/api/admin/users?${qs.toString()}`, auth);
    if (g !== reqGen.current.sellers) return;
    let rows = d.users || [];
    if (sellersTab === "pending") {
      rows = rows.filter((u) => u.accountStatus !== "banned" && u.accountStatus !== "suspended");
    }
    setSellers(rows);
    setSellersTotal(d.total || 0);
  }, [accessToken, sellersTab, sellersPage, sellersSearch]);

  const loadVendorApps = useCallback(async () => {
    if (!auth) return;
    const g = ++reqGen.current.vendorApps;
    const qs = new URLSearchParams({
      status: vendorAppsStatus,
      page: String(vendorAppsPage),
      limit: String(vendorAppsLimit),
      search: vendorAppsSearch
    });
    const d = await apiFetch(`/api/admin/vendor-applications?${qs.toString()}`, auth);
    if (g !== reqGen.current.vendorApps) return;
    setVendorAppRows(d.applications || []);
    setVendorAppsTotal(d.total || 0);
  }, [accessToken, vendorAppsStatus, vendorAppsPage, vendorAppsSearch]);

  const loadCourierApps = useCallback(async () => {
    if (!auth) return;
    const g = ++reqGen.current.courierApps;
    const qs = new URLSearchParams({
      status: courierAppsStatus,
      page: String(courierAppsPage),
      limit: String(courierAppsLimit),
      search: courierAppsSearch
    });
    const d = await apiFetch(`/api/admin/courier-applications?${qs.toString()}`, auth);
    if (g !== reqGen.current.courierApps) return;
    setCourierAppRows(d.applications || []);
    setCourierAppsTotal(d.total || 0);
  }, [accessToken, courierAppsStatus, courierAppsPage, courierAppsSearch]);

  const loadListings = useCallback(async () => {
    if (!auth) return;
    const g = ++reqGen.current.listings;
    const qs = new URLSearchParams({
      page: String(listingsPage),
      limit: String(listingsLimit),
      search: listingsSearch
    });
    if (listingsTab === "flagged") {
      qs.set("status", "all");
      qs.set("flagged", "yes");
    } else {
      qs.set("status", listingsTab);
      qs.set("flagged", "all");
    }
    const d = await apiFetch(`/api/admin/products?${qs.toString()}`, auth);
    if (g !== reqGen.current.listings) return;
    setListings(d.products || []);
    setListingsTotal(d.total || 0);
  }, [accessToken, listingsPage, listingsTab, listingsSearch]);

  const loadOrders = useCallback(async () => {
    if (!auth) return;
    const g = ++reqGen.current.orders;
    const qs = new URLSearchParams({
      page: String(ordersPage),
      limit: String(ordersLimit),
      search: ordersSearch
    });
    if (ordersTab === "dispute") {
      qs.set("dispute", "yes");
    } else if (ordersTab === "refunded") {
      qs.set("refund", "refunded");
    } else if (ordersTab === "refund_pending") {
      qs.set("refund", "refund_processing");
    } else if (ordersTab !== "all") {
      qs.set("status", ordersTab);
    }
    const d = await apiFetch(`/api/admin/orders?${qs.toString()}`, auth);
    if (g !== reqGen.current.orders) return;
    setOrders(d.orders || []);
    setOrdersTotal(d.total || 0);
  }, [accessToken, ordersPage, ordersTab, ordersSearch]);

  const loadRevenue = useCallback(async () => {
    if (!auth) return;
    const d = await apiFetch(`/api/admin/revenue?days=${revDays}`, auth);
    setRevenue(d);
  }, [accessToken, revDays]);

  const loadBalances = useCallback(async () => {
    if (!auth) return;
    const d = await apiFetch("/api/admin/sellers/balances", auth);
    setBalances(d.sellers || []);
  }, [accessToken]);

  const loadPaidOrders = useCallback(async () => {
    if (!auth) return;
    const qs = new URLSearchParams({ page: "1", limit: "100", status: "paid" });
    const d = await apiFetch(`/api/admin/orders?${qs.toString()}`, auth);
    const qs2 = new URLSearchParams({ page: "1", limit: "100", status: "delivered" });
    const d2 = await apiFetch(`/api/admin/orders?${qs2.toString()}`, auth);
    const list = [...(d.orders || []), ...(d2.orders || [])];
    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    setPaidOrders(list);
  }, [accessToken]);

  const loadRefundOrders = useCallback(async () => {
    if (!auth) return;
    const qsRequested = new URLSearchParams({ page: "1", limit: "100", refund: "requested" });
    const qsRefunded = new URLSearchParams({ page: "1", limit: "100", refund: "refunded" });
    const qsProcessing = new URLSearchParams({ page: "1", limit: "100", refund: "refund_processing" });
    const [a1, a2, a3] = await Promise.all([
      apiFetch(`/api/admin/orders?${qsRequested.toString()}`, auth),
      apiFetch(`/api/admin/orders?${qsRefunded.toString()}`, auth),
      apiFetch(`/api/admin/orders?${qsProcessing.toString()}`, auth)
    ]);
    const byId = new Map();
    for (const o of [...(a1.orders || []), ...(a2.orders || []), ...(a3.orders || [])]) {
      byId.set(o.id, o);
    }
    const all = [...byId.values()];
    all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    setRefundOrders(all);
  }, [accessToken]);

  /** Reload Payments tab numbers + lists (e.g. after Paystack refund settles or when returning to the tab). */
  const refreshPaymentsTab = useCallback(async () => {
    if (!accessToken) return;
    try {
      if (paymentsTab === "transactions") {
        await Promise.all([loadRevenue(), loadPaidOrders(), loadRefundOrders()]);
      } else if (paymentsTab === "payouts") {
        await Promise.all([loadRevenue(), loadBalances()]);
      } else if (paymentsTab === "refunds") {
        await loadRefundOrders();
      }
    } catch {
      /* stale network or session; main tab effect will retry */
    }
  }, [accessToken, paymentsTab, loadRevenue, loadPaidOrders, loadRefundOrders, loadBalances]);

  const runPaystackRefundForOrder = async (orderRow) => {
    if (!auth) return;
    await apiFetch(`/api/admin/orders/${orderRow.id}/refund-paystack`, { method: "POST", ...auth });
    toast("Paystack refund updated", { variant: "success" });
    if (tab === "orders") await loadOrders();
    if (tab === "payments") await refreshPaymentsTab();
  };

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible" || !accessToken) return;
      if (tab !== "payments") return;
      void refreshPaymentsTab();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [accessToken, tab, refreshPaymentsTab]);

  const loadReports = useCallback(async () => {
    if (!auth) return;
    const g = ++reqGen.current.reports;
    const qs = new URLSearchParams({
      page: String(reportsPage),
      limit: String(reportsLimit),
      status: reportsTab,
      priority: reportsPriority,
      search: reportsSearch
    });
    const d = await apiFetch(`/api/admin/reports?${qs.toString()}`, auth);
    if (g !== reqGen.current.reports) return;
    setReports(d.reports || []);
    setReportsTotal(d.total || 0);
    if (d.counts && typeof d.counts === "object") {
      setReportsCounts({
        all: d.counts.all || 0,
        open: d.counts.open || 0,
        in_review: d.counts.in_review || 0,
        resolved: d.counts.resolved || 0,
        dismissed: d.counts.dismissed || 0
      });
    }
  }, [accessToken, reportsPage, reportsTab, reportsPriority, reportsSearch]);

  const loadConversations = useCallback(async () => {
    if (!auth) return;
    const qs = new URLSearchParams({
      page: String(conversationsPage),
      limit: String(conversationsLimit)
    });
    const d = await apiFetch(`/api/admin/conversations?${qs.toString()}`, auth);
    setConversations(d.threads || []);
    setConversationsTotal(d.total || 0);
  }, [accessToken, conversationsPage]);

  const loadThread = useCallback(
    async (id) => {
      if (!auth || !id) return;
      const d = await apiFetch(`/api/admin/conversations/${id}`, auth);
      setThreadDetail(d.thread || null);
    },
    [auth]
  );

  const searchMsgDirectoryUsers = useCallback(async () => {
    const q = msgUserSearch.trim();
    if (!auth || q.length < 2) {
      setMsgUserHits([]);
      return;
    }
    const qs = new URLSearchParams({
      page: "1",
      limit: "30",
      role: "all",
      accountStatus: "all",
      search: q
    });
    try {
      const d = await apiFetch(`/api/admin/users?${qs}`, auth);
      setMsgUserHits(d.users || []);
    } catch {
      setMsgUserHits([]);
    }
  }, [auth, msgUserSearch]);

  const openUserMessageThread = useCallback(
    async (u) => {
      if (!auth) return;
      setComposeTargetUser(u);
      setSelectedThreadId(null);
      try {
        const d = await apiFetch(`/api/admin/conversations/with-user/${u.id}`, auth);
        if (d.thread) setThreadDetail(d.thread);
        else
          setThreadDetail({
            id: null,
            kind: "support",
            buyerId: u.id,
            sellerId: "",
            buyerLabel: ((u.displayName || "").trim() || u.email || u.id).slice(0, 120),
            sellerLabel: "SHOPIQGH Support",
            messages: []
          });
      } catch (ex) {
        toast(apiErrorMessage(ex, "Could not open thread"), { variant: "danger" });
      }
    },
    [auth]
  );

  const sendAdminSupportReply = useCallback(async () => {
    const text = adminSupportDraft.trim();
    const customerId =
      composeTargetUser?.id || (threadDetail?.kind === "support" ? threadDetail.buyerId : null);
    if (!auth || !text || !customerId) return;
    setAdminMsgSending(true);
    try {
      const d = await apiFetch(`/api/admin/conversations/with-user/${customerId}/messages`, {
        method: "POST",
        json: { text },
        ...auth
      });
      setAdminSupportDraft("");
      setComposeTargetUser(null);
      if (d.thread?.id) setSelectedThreadId(d.thread.id);
      setThreadDetail(d.thread || null);
      await loadConversations();
      toast("Message sent", { variant: "success" });
    } catch (ex) {
      toast(apiErrorMessage(ex, "Send failed"), { variant: "danger" });
    } finally {
      setAdminMsgSending(false);
    }
  }, [auth, adminSupportDraft, composeTargetUser, threadDetail, loadConversations]);

  const loadSettings = useCallback(async () => {
    if (!auth) return;
    const d = await apiFetch("/api/admin/settings", auth);
    setSettings(d.settings || null);
    setListingRulesLastEditor(d.listingRulesLastEditor ?? null);
    setEmailDelivery(d.emailDelivery || null);
    setEmailTemplatePreviews(Array.isArray(d.emailTemplatePreviews) ? d.emailTemplatePreviews : []);
    if (d.settings) {
      setSettingsForm((s) => ({
        ...s,
        commissionPercent: d.settings.commissionPercent,
        momoEnabled: d.settings.momoEnabled,
        stripeEnabled: d.settings.stripeEnabled,
        bankEnabled: d.settings.bankEnabled,
        listingPolicyNote: d.settings.listingPolicyNote || "",
        listingAllowedItemsNote: d.settings.listingAllowedItemsNote ?? "",
        listingProhibitedItemsNote: d.settings.listingProhibitedItemsNote ?? "",
        listingModerationGuidelines: d.settings.listingModerationGuidelines ?? "",
        listingAutoRejectKeywords: Array.isArray(d.settings.listingAutoRejectKeywords)
          ? d.settings.listingAutoRejectKeywords
          : [],
        listingAutoModerationEnabled: !!d.settings.listingAutoModerationEnabled,
        listingKeywordBlockEnabled: !!d.settings.listingKeywordBlockEnabled,
        listingDefaultApprovalMode:
          d.settings.listingDefaultApprovalMode === "auto_approve" ? "auto_approve" : "require_approval",
        listingKeywordViolationAction:
          d.settings.listingKeywordViolationAction === "reject_auto" ? "reject_auto" : "flag_review",
        siteName: d.settings.siteName || s.siteName,
        siteDescription: d.settings.siteDescription ?? "",
        supportEmail: d.settings.supportEmail ?? "",
        maintenanceMode: !!d.settings.maintenanceMode,
        maintenanceMessage: d.settings.maintenanceMessage ?? "",
        allowPublicRegistration: d.settings.allowPublicRegistration !== false,
        allowVendorApplications: d.settings.allowVendorApplications !== false,
        allowCourierApplications: d.settings.allowCourierApplications !== false,
        platformDeployedAt: d.settings.platformDeployedAt
          ? String(d.settings.platformDeployedAt).slice(0, 10)
          : "",
        vendorTrialMonths: d.settings.vendorTrialMonths ?? 2,
        vendorSubscriptionBillingEnabled: d.settings.vendorSubscriptionBillingEnabled !== false,
        vendorSubscriptionPriceGhs: d.settings.vendorSubscriptionPriceGhs ?? 49,
        vendorSubscriptionPeriodMonths: d.settings.vendorSubscriptionPeriodMonths ?? 12
      }));
    }
  }, [accessToken]);

  const loadEmailLogs = useCallback(async () => {
    if (!auth) return;
    setEmailLogsLoading(true);
    try {
      const d = await apiFetch("/api/admin/email-logs?page=1&limit=40", auth);
      setEmailLogs(d.logs || []);
      setEmailLogsTotal(Number(d.total) || 0);
    } catch {
      setEmailLogs([]);
      setEmailLogsTotal(0);
    } finally {
      setEmailLogsLoading(false);
    }
  }, [accessToken, auth]);

  /* ---------------- Tab-driven load effect ---------------- */

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    setErr("");
    const run = async () => {
      try {
        if (tab === "dashboard") await loadDashboard();
        else if (tab === "users") await loadUsers();
        else if (tab === "riders") await loadRiders();
        else if (tab === "sellers") await loadSellers();
        else if (tab === "vendor-apps") await loadVendorApps();
        else if (tab === "stores") {
          /* AdminStoresPanel loads its own data */
        } else if (tab === "courier-apps") await loadCourierApps();
        else if (tab === "listings") await loadListings();
        else if (tab === "orders") await loadOrders();
        else if (tab === "payments") {
          if (paymentsTab === "transactions") await Promise.all([loadRevenue(), loadPaidOrders(), loadRefundOrders()]);
          else if (paymentsTab === "payouts") await Promise.all([loadRevenue(), loadBalances()]);
          else if (paymentsTab === "refunds") await loadRefundOrders();
        } else if (tab === "reports") await loadReports();
        else if (tab === "messages") await loadConversations();
        else if (tab === "settings") await loadSettings();
        else if (tab === "logs") await loadDashboard();
      } catch (ex) {
        setErr(apiErrorMessage(ex, "Load failed"));
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [
    accessToken,
    tab,
    loadDashboard,
    loadUsers,
    loadRiders,
    loadSellers,
    loadVendorApps,
    loadCourierApps,
    loadListings,
    loadOrders,
    loadRevenue,
    loadBalances,
    loadPaidOrders,
    loadRefundOrders,
    loadReports,
    loadConversations,
    loadSettings,
    paymentsTab,
    revDays,
    /* Sub-filters: keep in sync with loader callbacks so tab/header changes always refetch */
    usersPage,
    usersRoleTab,
    usersStatus,
    usersSearch,
    ridersPage,
    ridersStatus,
    ridersVerified,
    ridersSearch,
    sellersPage,
    sellersTab,
    sellersSearch,
    vendorAppsPage,
    vendorAppsStatus,
    vendorAppsSearch,
    courierAppsPage,
    courierAppsStatus,
    courierAppsSearch,
    listingsPage,
    listingsTab,
    listingsSearch,
    ordersPage,
    ordersTab,
    ordersSearch,
    reportsPage,
    reportsTab,
    reportsSearch,
    conversationsPage
  ]);

  useEffect(() => {
    if (tab !== "messages") {
      setComposeTargetUser(null);
      setMsgUserSearch("");
      setMsgUserHits([]);
      setAdminSupportDraft("");
      setSelectedThreadId(null);
      setThreadDetail(null);
      return;
    }
    const t = setTimeout(() => searchMsgDirectoryUsers(), 320);
    return () => clearTimeout(t);
  }, [tab, msgUserSearch, searchMsgDirectoryUsers]);

  useEffect(() => {
    if (tab !== "messages") {
      return;
    }
    if (composeTargetUser) {
      return;
    }
    if (!selectedThreadId) {
      setThreadDetail(null);
      return;
    }
    loadThread(selectedThreadId);
  }, [tab, selectedThreadId, composeTargetUser, loadThread]);

  /* Reset pagination when tab/filter changes */
  useEffect(() => {
    if (tab !== "users") return;
    const p = (searchParams.get("usersRole") || "all").toLowerCase();
    const v = USER_ROLES.includes(p) ? p : "all";
    if (v !== usersRoleTab) {
      setUsersRoleTab(v);
    }
  }, [tab, searchParams]);

  useEffect(() => setUsersPage(1), [usersRoleTab, usersStatus, usersSearch]);
  useEffect(() => setRidersPage(1), [ridersStatus, ridersVerified, ridersSearch]);
  useEffect(() => setSellersPage(1), [sellersTab, sellersSearch]);
  useEffect(() => setVendorAppsPage(1), [vendorAppsStatus, vendorAppsSearch]);
  useEffect(() => setCourierAppsPage(1), [courierAppsStatus, courierAppsSearch]);
  useEffect(() => setListingsPage(1), [listingsTab, listingsSearch]);
  useEffect(() => setOrdersPage(1), [ordersTab, ordersSearch]);
  useEffect(() => setReportsPage(1), [reportsTab, reportsPriority, reportsSearch]);

  /* ---------------- Guards ---------------- */

  if (!user || user.role !== "admin") {
    if (!accessToken) return h(Navigate, { to: "/admin/login", replace: true, state: { from: "/admin" } });
    return h(
      "div",
      {
        className:
          "flex min-h-screen items-center justify-center bg-slate-100 px-4 text-slate-800 dark:bg-night-950 dark:text-slate-200"
      },
      h("p", { className: "text-center" }, "You don’t have access to the admin area.")
    );
  }

  /* ---------------- Actions ---------------- */

  const patchUser = async (id, body, reloadFn = loadUsers) => {
    try {
      await apiFetch(`/api/admin/users/${id}`, { method: "PATCH", ...auth, json: body });
      toast("User updated", { variant: "success" });
      await reloadFn();
      if (viewUser && viewUser.user?.id === id) {
        const d = await apiFetch(`/api/admin/users/${id}/summary`, auth);
        setViewUser(d);
      }
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Update failed"), { variant: "error" });
    }
  };

  const grantUserAdmin = async (body) => {
    if (!auth || !isSuperAdmin) return;
    try {
      setAddAdminBusy(true);
      const d = await apiFetch("/api/admin/users/grant-admin", { method: "POST", ...auth, json: body });
      if (d?.already) {
        toast("That account is already an admin.");
      } else {
        const inv = d?.adminInviteEmail;
        if (inv?.status === "sent" && inv.to) {
          toast(`Admin access granted. Notification email sent to ${inv.to}.`, { variant: "success" });
        } else if (inv?.status === "no_recipient_email") {
          toast("Admin access granted. This user has no email on file, so no message was sent.", { variant: "warning" });
        } else if (inv?.status === "mail_not_configured") {
          toast(
            "Admin access granted. Server email is not configured (SMTP / Gmail in .env) — they were not emailed.",
            { variant: "warning" }
          );
        } else if (inv?.status === "send_failed") {
          toast("Admin access granted, but the notification email failed to send. Check server logs.", { variant: "error" });
        } else {
          toast("Admin access granted.", { variant: "success" });
        }
      }
      setAddAdminOpen(false);
      setAddAdminEmail("");
      await loadUsers();
      await loadRiders();
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Could not grant admin"), { variant: "error" });
    } finally {
      setAddAdminBusy(false);
    }
  };

  const onMakeAdmin = async (u) => {
    if (!isSuperAdmin) return;
    const label = u.displayName || u.email || "this user";
    const ok = await confirm(
      `Grant admin access to ${label}? They can use the full admin area on next sign-in (and after refresh, if they’re already online).`,
      { title: "Make admin", confirmLabel: "Grant access" }
    );
    if (!ok) return;
    await grantUserAdmin({ userId: u.id });
  };

  const revokeUserAdmin = async (body) => {
    if (!auth || !isSuperAdmin) return;
    try {
      const d = await apiFetch("/api/admin/users/revoke-admin", { method: "POST", ...auth, json: body });
      if (d?.already) toast("That account is not an admin.");
      else toast("Admin access removed.", { variant: "success" });
      await loadUsers();
      await loadRiders();
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Could not remove admin"), { variant: "error" });
    }
  };

  const onRevokeAdmin = async (u) => {
    if (!isSuperAdmin) return;
    const label = u.displayName || u.email || "this user";
    const ok = await confirm(
      `Remove admin access from ${label}? They become a buyer (or seller if they still have listings) and will lose access to this dashboard after signing in again.`,
      { title: "Remove admin", confirmLabel: "Remove access" }
    );
    if (!ok) return;
    await revokeUserAdmin({ userId: u.id });
  };

  const onBanUser = async (u) => {
    const ok = await confirm(`Ban ${u.displayName || u.email || "this user"}? They won’t be able to sign in.`, {
      title: "Ban user?",
      confirmLabel: "Ban"
    });
    if (!ok) return;
    await patchUser(u.id, { accountStatus: "banned" });
  };

  const onVerifySeller = async (u, verified) => {
    await patchUser(u.id, { sellerVerified: verified }, tab === "sellers" ? loadSellers : loadUsers);
  };

  const onSyncVendorSellerRole = async (row) => {
    const ok = await confirm(
      `Apply seller role to the account for ${row.email}? They must use this same email when signing in.`,
      { title: "Apply seller role?", confirmLabel: "Apply seller role" }
    );
    if (!ok) return;
    try {
      const d = await apiFetch(`/api/admin/vendor-applications/${row.id}/sync-seller-role`, {
        method: "POST",
        ...auth
      });
      toast(d?.message || "Seller role applied.", { variant: "success" });
      await loadVendorApps();
      await loadUsers();
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Could not apply seller role."), { variant: "error" });
    }
  };

  const onVendorAppDecision = async (row, action) => {
    if (action === "approve") {
      const ok = await confirm(`Approve "${row.shopName}" and grant this user seller access?`, {
        title: "Approve vendor?",
        confirmLabel: "Approve"
      });
      if (!ok) return;
    } else {
      const ok = await confirm("Reject this vendor application? The user stays a shopper and can apply again.", {
        title: "Reject application?",
        confirmLabel: "Reject"
      });
      if (!ok) return;
    }
    try {
      await apiFetch(`/api/admin/vendor-applications/${row.id}`, {
        method: "PATCH",
        ...auth,
        json: { action, adminNote: "" }
      });
      toast(
        action === "approve"
          ? "Vendor approved. Existing shoppers are promoted to seller automatically after the API redeploys; refresh Users to confirm."
          : "Application rejected.",
        { variant: "success" }
      );
      await loadVendorApps();
      await loadUsers();
      setVendorVerificationApp(null);
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Update failed"), { variant: "error" });
    }
  };

  const onCourierApplicationDecision = async (row, action) => {
    if (action === "approve") {
      const ok = await confirm(
        `Approve courier application for ${row.fullName}? They become a rider with access to /rider and can be assigned to deliveries.`,
        { title: "Approve courier?", confirmLabel: "Approve" }
      );
      if (!ok) return;
    } else {
      const ok = await confirm("Reject this courier application? The shopper can apply again later unless you close applications platform-wide.", {
        title: "Reject application?",
        confirmLabel: "Reject"
      });
      if (!ok) return;
    }
    try {
      await apiFetch(`/api/admin/courier-applications/${row.id}`, {
        method: "PATCH",
        ...auth,
        json: { action, adminNote: "" }
      });
      toast(
        action === "approve"
          ? "Courier approved. User should refresh or sign in again to open the rider workspace."
          : "Application rejected.",
        { variant: "success" }
      );
      await loadCourierApps();
      await loadRiders();
      loadNavBadges();
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Update failed"), { variant: "error" });
    }
  };

  const onBanVendorApplicantAccount = async () => {
    const row = vendorVerificationApp;
    if (!row?.userId) return;
    const ok = await confirm(
      `Ban ${row.fullName || row.email || "this user"}? They will not be able to sign in. This does not delete their data.`,
      { title: "Ban account?", confirmLabel: "Ban account" }
    );
    if (!ok) return;
    await patchUser(row.userId, { accountStatus: "banned" }, loadVendorApps);
    setVendorVerificationApp(null);
  };

  const onOpenUserDetails = async (u) => {
    try {
      const d = await apiFetch(`/api/admin/users/${u.id}/summary`, auth);
      setViewUser(d);
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Couldn’t load user"), { variant: "error" });
    }
  };

  const copyToClipboard = async (text) => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        toast("Copied to clipboard", { variant: "success" });
      }
    } catch {
      /* ignore */
    }
  };

  /* Listings */
  const approveListing = async (id) => {
    try {
      await apiFetch(`/api/admin/products/${id}/approve`, { method: "POST", ...auth, json: {} });
      toast("Listing approved", { variant: "success" });
      await loadListings();
      await loadDashboard();
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Approve failed"), { variant: "error" });
    }
  };

  const ADMIN_BULK_APPROVE_PENDING_CAP = 400;

  const approveAllPendingListings = async () => {
    if (!auth) return;
    if (listingsTab !== "pending_approval") return;
    const searchHint = (listingsSearch || "").trim();
    const cap = ADMIN_BULK_APPROVE_PENDING_CAP;
    const detail = searchHint
      ? `This approves up to ${cap} pending listings whose title or description matches your current search. Repeat if more are still pending.`
      : `This approves up to ${cap} pending listings at once (most recently updated first). Repeat if more are still pending.`;
    const ok = await confirm(detail, { title: "Approve all pending?", confirmLabel: `Approve up to ${cap}` });
    if (!ok) return;
    setBulkApproveBusy(true);
    try {
      const d = await apiFetch("/api/admin/products/bulk-approve", {
        method: "POST",
        ...auth,
        json: { approveAllPendingMatchingSearch: true, search: searchHint }
      });
      const approved = typeof d?.approved === "number" ? d.approved : 0;
      const repeat = Boolean(d?.repeatSuggested);
      if (approved === 0) {
        toast("No pending listings matched.", { variant: "warning" });
      } else {
        toast(
          repeat
            ? `Approved ${approved} listing${approved === 1 ? "" : "s"}. More may remain — approve all again if needed (${cap} per batch).`
            : `Approved ${approved} listing${approved === 1 ? "" : "s"}.`,
          { variant: "success" }
        );
      }
      await loadListings();
      await loadDashboard();
      loadNavBadges();
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Bulk approve failed"), { variant: "error" });
    } finally {
      setBulkApproveBusy(false);
    }
  };

  const openReject = (p) => {
    setRejectProduct(p);
    setRejectReasonSel(REJECT_REASONS[0]);
    setRejectNote("");
  };

  const submitReject = async () => {
    if (!rejectProduct) return;
    const parts = [rejectReasonSel];
    if (rejectNote.trim()) parts.push(rejectNote.trim());
    const reason = parts.join(" — ").slice(0, 2000);
    try {
      await apiFetch(`/api/admin/products/${rejectProduct.id}/reject`, {
        method: "POST",
        ...auth,
        json: { reason }
      });
      toast("Listing rejected", { variant: "success" });
      setRejectProduct(null);
      await loadListings();
      await loadDashboard();
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Reject failed"), { variant: "error" });
    }
  };

  const openEditListing = (p) => {
    setEditProduct(p);
    setEditForm({
      name: p.name || "",
      price: String(p.price ?? ""),
      inStock: Number(p.stock) > 0,
      category: p.category || "",
      description: p.description || ""
    });
  };

  const submitEditListing = async () => {
    if (!editProduct) return;
    const price = Number(editForm.price);
    if (!Number.isFinite(price) || price < 0) {
      await alert("Enter a valid price", { variant: "warning" });
      return;
    }
    const stock = editForm.inStock ? LISTING_STOCK_WHEN_AVAILABLE : 0;
    try {
      await apiFetch(`/api/admin/products/${editProduct.id}`, {
        method: "PATCH",
        ...auth,
        json: {
          name: editForm.name,
          price,
          stock,
          category: editForm.category || undefined,
          description: editForm.description || undefined
        }
      });
      toast("Listing updated", { variant: "success" });
      setEditProduct(null);
      await loadListings();
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Save failed"), { variant: "error" });
    }
  };

  const toggleFlagListing = async (p) => {
    try {
      await apiFetch(`/api/admin/products/${p.id}`, {
        method: "PATCH",
        ...auth,
        json: { flagged: !p.flagged }
      });
      toast(p.flagged ? "Listing unflagged" : "Listing flagged", { variant: "success" });
      await loadListings();
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Update failed"), { variant: "error" });
    }
  };

  const deleteListing = async (p) => {
    if (!isSuperAdmin) {
      await alert("Only the platform super admin can delete listings.", { variant: "error" });
      return;
    }
    const ok = await confirm(`Delete "${p.name}" permanently?`, { title: "Delete listing", confirmLabel: "Delete" });
    if (!ok) return;
    try {
      await apiFetch(`/api/admin/products/${p.id}`, { method: "DELETE", ...auth });
      toast("Listing deleted", { variant: "success" });
      await loadListings();
      await loadDashboard();
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Delete failed"), { variant: "error" });
    }
  };

  /* Orders */
  const quickRefund = async (o) => {
    if (o.paymentMethod !== "paystack") {
      await alert(
        "This order was not paid with Paystack. Refund the buyer manually (for example mobile money or bank), and keep your own records.",
        { variant: "warning" }
      );
      return;
    }
    const syncing = o.refundStatus === "refund_processing";
    const ok = await confirm(
      syncing
        ? `Refresh Paystack refund status for order ${shortId(o.id)}?`
        : `Start a Paystack refund to return money to the buyer for order ${shortId(o.id)}?`,
      { title: "Paystack refund", confirmLabel: syncing ? "Refresh status" : "Refund buyer" }
    );
    if (!ok) return;
    try {
      await runPaystackRefundForOrder(o);
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Refund failed"), { variant: "error" });
    }
  };

  /** Off-platform pay or Paystack success that did not update the order — marks paid and reduces stock (same as all vendors confirming). */
  const markOrderPaymentReceived = async (o) => {
    if (!auth) return;
    const ok = await confirm(
      `Mark order ${shortId(o.id)} as paid? Stock will be reduced and the order will move to Paid. Use this only when payment is verified (for example MoMo or bank received, or Paystack succeeded but the order stayed on “pending”).`,
      { title: "Payment received", confirmLabel: "Mark as paid" }
    );
    if (!ok) return;
    try {
      await apiFetch(`/api/orders/${o.id}/admin/mark-paid`, { method: "POST", ...auth, json: {} });
      toast("Order marked as paid", { variant: "success" });
      await loadOrders();
      await loadDashboard();
      loadNavBadges();
      if (tab === "payments") await refreshPaymentsTab();
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Could not update order"), { variant: "error" });
    }
  };

  /* Reports */
  const patchReport = async (r, body) => {
    try {
      await apiFetch(`/api/admin/reports/${r.id}`, {
        method: "PATCH",
        ...auth,
        json: body
      });
      toast("Report updated", { variant: "success" });
      setViewReport(null);
      setReportNote("");
      await loadReports();
      await loadDashboard();
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Update failed"), { variant: "error" });
    }
  };

  /* ---------------- Delete actions ---------------- */
  /** Generic admin DELETE wrapper with confirmation, error toast, and post-delete refresh. */
  const adminDelete = async (path, opts = {}) => {
    if (!isSuperAdmin) {
      await alert("Only the platform super admin can delete this data.", { variant: "error" });
      return false;
    }
    const ok = await confirm(opts.message || "This permanently removes the record.", {
      title: opts.title || "Delete this item?",
      confirmLabel: opts.confirmLabel || "Yes, delete",
      cancelLabel: "Cancel"
    });
    if (!ok) return false;
    try {
      await apiFetch(path, { method: "DELETE", ...auth });
      toast(opts.successMessage || "Deleted", { variant: "success" });
      if (typeof opts.after === "function") await opts.after();
      loadNavBadges();
      return true;
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Delete failed"), { variant: "error" });
      return false;
    }
  };

  const deleteReport = (r) =>
    adminDelete(`/api/admin/reports/${r.id}`, {
      title: "Delete this report?",
      message:
        "Permanently removes this report and its evidence references. The reporter will not see it anymore. This cannot be undone.",
      successMessage: "Report deleted",
      after: async () => {
        setViewReport(null);
        setReportNote("");
        await loadReports();
        await loadDashboard();
      }
    });

  const deleteOrderRow = (o) =>
    adminDelete(`/api/admin/orders/${o.id}`, {
      title: "Delete this cancelled order?",
      message:
        "Only cancelled orders can be deleted. The buyer and seller will no longer see this record. This cannot be undone.",
      successMessage: "Order deleted",
      after: async () => {
        await loadOrders();
        await loadDashboard();
      }
    });

  const deleteVendorAppRow = (app) =>
    adminDelete(`/api/admin/vendor-applications/${app.id}`, {
      title: "Delete this vendor application?",
      message:
        "Removes a reviewed (approved or rejected) application from the queue. The applicant's account is unaffected. This cannot be undone.",
      successMessage: "Application deleted",
      after: async () => {
        await loadVendorApps();
      }
    });

  const deleteCourierAppRow = (app) =>
    adminDelete(`/api/admin/courier-applications/${app.id}`, {
      title: "Delete this courier application?",
      message:
        "Removes a reviewed (approved or rejected) application from the queue. The rider account is unaffected. This cannot be undone.",
      successMessage: "Application deleted",
      after: async () => {
        await loadCourierApps();
        loadNavBadges();
      }
    });

  const deleteUserRow = (u) =>
    adminDelete(`/api/admin/users/${u.id}`, {
      title: "Delete this user?",
      message:
        "Permanently deletes the user, their products, reviews on those products, vendor application history, and sessions. Refused if they have active orders. This cannot be undone.",
      confirmLabel: "Yes, delete user",
      successMessage: "User deleted",
      after: async () => {
        await loadUsers();
        await loadDashboard();
      }
    });

  const deleteRiderRow = (u) =>
    adminDelete(`/api/admin/users/${u.id}`, {
      title: "Delete this rider?",
      message:
        "Permanently deletes the courier account, sessions, and related profile data. Refused if they have unresolved delivery ties. This cannot be undone.",
      confirmLabel: "Yes, delete rider",
      successMessage: "Rider deleted",
      after: async () => {
        await loadRiders();
        await loadDashboard();
      }
    });

  const submitCreateRider = async () => {
    if (!auth) return;
    const email = addRiderForm.email.trim().toLowerCase();
    const password = addRiderForm.password;
    const vt = addRiderForm.vehicleType.trim();
    if (!email || !email.includes("@")) {
      await alert("Enter a valid email.", { variant: "error" });
      return;
    }
    if (!password || password.length < 8) {
      await alert("Password must be at least 8 characters.", { variant: "error" });
      return;
    }
    if (!vt) {
      await alert("Vehicle type is required (e.g. bicycle, motorcycle).", { variant: "error" });
      return;
    }
    setAddRiderBusy(true);
    try {
      await apiFetch("/api/admin/riders", {
        method: "POST",
        ...auth,
        json: {
          email,
          password,
          displayName: addRiderForm.displayName.trim() || undefined,
          phone: addRiderForm.phone.trim() || undefined,
          vehicleType: vt
        }
      });
      toast("Rider account created.", { variant: "success" });
      setAddRiderOpen(false);
      setAddRiderForm({ email: "", password: "", displayName: "", phone: "", vehicleType: "" });
      await loadRiders();
      await loadDashboard();
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Could not create rider"), { variant: "error" });
    } finally {
      setAddRiderBusy(false);
    }
  };

  /* Settings */
  const saveSettings = async () => {
    if (!isSuperAdmin) {
      await alert("Only the platform super admin can change platform settings.", { variant: "error" });
      return;
    }
    setSavingSettings(true);
    try {
      await apiFetch("/api/admin/settings", {
        method: "PATCH",
        ...auth,
        json: {
          commissionPercent: settingsForm.commissionPercent,
          momoEnabled: settingsForm.momoEnabled,
          stripeEnabled: settingsForm.stripeEnabled,
          bankEnabled: settingsForm.bankEnabled,
          listingPolicyNote: settingsForm.listingPolicyNote,
          listingAllowedItemsNote: settingsForm.listingAllowedItemsNote,
          listingProhibitedItemsNote: settingsForm.listingProhibitedItemsNote,
          listingModerationGuidelines: settingsForm.listingModerationGuidelines,
          listingAutoRejectKeywords: settingsForm.listingAutoRejectKeywords,
          listingAutoModerationEnabled: settingsForm.listingAutoModerationEnabled,
          listingKeywordBlockEnabled: settingsForm.listingKeywordBlockEnabled,
          listingDefaultApprovalMode: settingsForm.listingDefaultApprovalMode,
          listingKeywordViolationAction: settingsForm.listingKeywordViolationAction,
          siteName: settingsForm.siteName.trim() || "SHOPIQGH",
          siteDescription: settingsForm.siteDescription,
          supportEmail: settingsForm.supportEmail.trim(),
          maintenanceMode: settingsForm.maintenanceMode,
          maintenanceMessage: settingsForm.maintenanceMessage,
          allowPublicRegistration: settingsForm.allowPublicRegistration,
          allowVendorApplications: settingsForm.allowVendorApplications,
          allowCourierApplications: settingsForm.allowCourierApplications,
          platformDeployedAt: settingsForm.platformDeployedAt
            ? `${settingsForm.platformDeployedAt}T00:00:00.000Z`
            : "",
          vendorTrialMonths: settingsForm.vendorTrialMonths,
          vendorSubscriptionBillingEnabled: settingsForm.vendorSubscriptionBillingEnabled,
          vendorSubscriptionPriceGhs: settingsForm.vendorSubscriptionPriceGhs,
          vendorSubscriptionPeriodMonths: settingsForm.vendorSubscriptionPeriodMonths
        }
      });
      toast("Settings saved", { variant: "success" });
      await loadSettings();
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Save failed"), { variant: "error" });
    } finally {
      setSavingSettings(false);
    }
  };

  useEffect(() => {
    if (tab !== "settings" || settingsTab !== "email") return;
    setEmailTestTo((prev) => {
      if ((prev || "").trim()) return prev;
      const em = user?.email ? String(user.email).trim() : "";
      return em;
    });
  }, [tab, settingsTab, user?.email]);

  useEffect(() => {
    if (tab !== "settings" || settingsTab !== "email" || !auth) return;
    void loadEmailLogs();
  }, [tab, settingsTab, auth, loadEmailLogs]);

  useEffect(() => {
    if (settingsTab !== "email") setEmailPreviewId(null);
  }, [settingsTab]);

  const sendTestEmail = async () => {
    if (!isSuperAdmin) {
      await alert("Only the platform super admin can send mail from this screen.", { variant: "error" });
      return;
    }
    const to = emailTestTo.trim();
    if (!to) {
      await alert("Enter the recipient email address.", { variant: "error" });
      return;
    }
    setEmailTestSending(true);
    try {
      const json = {
        to,
        ...(emailTestSubject.trim() ? { subject: emailTestSubject.trim() } : {}),
        ...(emailTestBody.trim() ? { bodyText: emailTestBody.trim() } : {})
      };
      const d = await apiFetch("/api/admin/settings/email-test", {
        method: "POST",
        ...auth,
        json
      });
      toast(d.message || "Message was accepted for delivery.", { variant: "success" });
      await loadEmailLogs();
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Could not send email."), { variant: "error" });
    } finally {
      setEmailTestSending(false);
    }
  };

  /* ---------------- Sidebar ---------------- */

  const pageMeta = PAGE_TITLES[tab] || PAGE_TITLES.dashboard;

  const sidebar = h(
    "aside",
    {
      className: `fixed inset-y-0 left-0 z-40 flex h-[100dvh] max-h-[100dvh] w-60 max-w-[85vw] flex-col overflow-y-auto border-r border-slate-200/95 bg-white/95 shadow-2xl backdrop-blur-2xl transition-transform dark:border-white/10 dark:bg-night-900/80 lg:max-w-none lg:translate-x-0 ${
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      }`
    },
    [
      h(
        "div",
        { key: "top", className: "flex items-center justify-between gap-2 border-b border-slate-200/95 px-5 py-4 dark:border-white/5" },
        [
          h("div", { key: "b", className: "flex items-center gap-2" }, [
            h(
              "div",
              {
                key: "ic",
                className:
                  "flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-lg shadow-orange-900/40"
              },
              h(Shield, { className: "h-5 w-5" })
            ),
            h("div", { key: "tx" }, [
              h(
                "p",
                { className: "font-display text-sm font-bold text-slate-900 dark:text-white" },
                "SHOPIQGH"
              ),
              h(
                "p",
                { className: "text-[10px] font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-300" },
                "Admin"
              )
            ])
          ]),
          h(
            "button",
            {
              key: "close",
              type: "button",
              className: "tap-target rounded-xl p-2 text-slate-700 hover:bg-slate-100 lg:hidden dark:text-slate-200 dark:hover:bg-white/10",
              onClick: () => setSidebarOpen(false),
              "aria-label": "Close menu"
            },
            h(X, { className: "h-5 w-5" })
          )
        ]
      ),
      h(
        "nav",
        { key: "nav", className: "flex-1 space-y-1 px-3 py-4" },
        visibleSidebarItems.map((it) => {
          const active = tab === it.id;
          const count = it.badgeKey ? Number(navBadges?.[it.badgeKey] || 0) : 0;
          return h(
            "button",
            {
              key: it.id,
              type: "button",
              onClick: () => {
                setTab(it.id);
                setSidebarOpen(false);
              },
              className: `flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-900/30"
                  : "text-slate-800 hover:bg-slate-100/90 dark:text-slate-200 dark:hover:bg-white/10"
              }`
            },
            [
              h("span", { key: "left", className: "flex min-w-0 items-center gap-3" }, [
                h(it.icon, { key: "i", className: "h-4 w-4 shrink-0" }),
                h("span", { key: "l", className: "truncate" }, it.label)
              ]),
              count > 0
                ? h(
                    "span",
                    {
                      key: "b",
                      className: `inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                        active
                          ? "bg-white/25 text-white"
                          : "bg-amber-400/20 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200"
                      }`,
                      "aria-label": `${count} item${count === 1 ? "" : "s"} need${count === 1 ? "s" : ""} attention`
                    },
                    count > 99 ? "99+" : String(count)
                  )
                : null
            ].filter(Boolean)
          );
        })
      ),
      h(
        "div",
        { key: "foot", className: "border-t border-slate-200/95 px-3 py-3 dark:border-white/5" },
        [
          h(
            "button",
            {
              key: "logout",
              type: "button",
              onClick: async () => {
                await logout();
                window.location.href = "/admin/login";
              },
              className:
                "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-500/10 dark:text-rose-300"
            },
            [h(LogOut, { key: "i", className: "h-4 w-4" }), h("span", { key: "l" }, "Log out")]
          )
        ]
      )
    ]
  );

  /* ---------------- Header ---------------- */

  const header = h(
    "header",
    {
      className:
        "sticky top-0 z-20 border-b border-slate-200/95 bg-white/90 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-night-900/60 sm:px-6"
    },
    h(
      "div",
      { className: "mx-auto flex max-w-7xl items-center justify-between gap-3" },
      [
        h("div", { key: "l", className: "flex min-w-0 items-center gap-3" }, [
          h(
            "button",
            {
              key: "menu",
              type: "button",
              className: "tap-target rounded-2xl border border-white/15 p-2 lg:hidden",
              onClick: () => setSidebarOpen(true)
            },
            h(Menu, { className: "h-5 w-5" })
          ),
          h("div", { key: "ti", className: "min-w-0" }, [
            h(
              "h1",
              { className: "truncate font-display text-lg font-bold text-slate-900 dark:text-white sm:text-xl" },
              pageMeta.title
            ),
            h(
              "p",
              { className: "truncate text-xs text-slate-500 dark:text-slate-400" },
              pageMeta.hint
            )
          ])
        ]),
        h("div", { key: "r", className: "flex items-center gap-2 sm:gap-3" }, [
          (() => {
            const total =
              Number(navBadges?.["vendor-apps"] || 0) +
              Number(navBadges?.stores || 0) +
              Number(navBadges?.["courier-apps"] || 0) +
              Number(navBadges?.listings || 0) +
              Number(navBadges?.orders || 0) +
              Number(navBadges?.reports || 0) +
              Number(navBadges?.disputes || 0);
            const firstHotTab = navBadges?.["vendor-apps"] > 0
              ? "vendor-apps"
              : navBadges?.stores > 0
              ? "stores"
              : navBadges?.["courier-apps"] > 0
              ? "courier-apps"
              : navBadges?.reports > 0
              ? "reports"
              : navBadges?.orders > 0
              ? "orders"
              : navBadges?.listings > 0
              ? "listings"
              : null;
            return h(
              "button",
              {
                key: "bell",
                type: "button",
                onClick: () => firstHotTab && setTab(firstHotTab),
                title: total > 0
                  ? `${total} item${total === 1 ? "" : "s"} need attention`
                  : "Nothing pending",
                className: `relative tap-target rounded-2xl border border-slate-200/95 bg-white/85 p-2 shadow-sm transition hover:bg-white dark:border-white/15 dark:bg-white/5 dark:shadow-none dark:hover:bg-white/10 ${
                  total > 0 ? "" : "opacity-70"
                }`,
                "aria-label": "Pending admin actions"
              },
              [
                h(Bell, { key: "i", className: "h-5 w-5 text-slate-700 dark:text-slate-200" }),
                total > 0
                  ? h("span", {
                      key: "ping",
                      className:
                        "pointer-events-none absolute right-1 top-1 inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-rose-500/70"
                    })
                  : null,
                total > 0
                  ? h(
                      "span",
                      {
                        key: "n",
                        className:
                          "absolute -right-1 -top-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold tabular-nums text-white shadow"
                      },
                      total > 99 ? "99+" : String(total)
                    )
                  : null
              ].filter(Boolean)
            );
          })(),
          h(ThemeToggleButton, { key: "th", dark, onToggle: toggle }),
          h(
            "div",
            {
              key: "chip",
              className:
                "flex min-w-0 max-w-[12rem] items-center gap-2 rounded-2xl border border-slate-200/95 bg-white/85 px-2.5 py-1.5 shadow-sm dark:border-white/10 dark:bg-white/5 dark:shadow-none"
            },
            [
              h(Avatar, { key: "av", user, size: 28 }),
              h("div", { key: "txt", className: "min-w-0" }, [
                h(
                  "span",
                  {
                    className: "block truncate text-xs font-medium text-slate-800 dark:text-slate-100 sm:text-sm"
                  },
                  user?.displayName || user?.email || "Admin"
                ),
                h(
                  "span",
                  {
                    className: "mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400"
                  },
                  isSuperAdmin ? "Super admin" : "Admin (limited)"
                )
              ])
            ]
          )
        ])
      ]
    )
  );

  /* ---------------- Dashboard ---------------- */

  const renderDashboard = () => {
    const d = dashboard || {};
    const uTotal = d.users?.total ?? 0;
    const buyers = d.users?.buyers ?? 0;
    const sellersC = d.users?.sellers ?? 0;
    const orderTotal = d.orders?.total ?? 0;
    const rev = d.revenue?.platformCommissionTotal ?? 0;
    const revPct = d.revenue?.platformCommissionPercent;
    const activeList = d.products?.active ?? 0;
    const pending = d.products?.pendingApproval ?? 0;
    const openReports = d.flags?.openReports ?? 0;
    const recentOrders = (d.recent?.orders || []).slice(0, 6);
    return h("div", { className: "space-y-6" }, [
      h("div", { key: "stats", className: "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" }, [
        h(StatCard, {
          key: "u",
          label: "Total users",
          value: String(uTotal),
          hint: `${buyers} buyers · ${sellersC} sellers`,
          icon: UsersIcon,
          tone: "info"
        }),
        h(StatCard, {
          key: "o",
          label: "Total orders",
          value: String(orderTotal),
          hint: "All time",
          icon: ShoppingCart,
          tone: "info"
        }),
        h(StatCard, {
          key: "r",
          label: `Total revenue${revPct != null ? ` (${revPct}%)` : ""}`,
          value: formatGhc(rev || 0),
          hint: "Platform commission",
          icon: DollarSign,
          tone: "success"
        }),
        h(StatCard, {
          key: "a",
          label: "Active listings",
          value: String(activeList),
          icon: Package,
          tone: "info"
        }),
        h(StatCard, {
          key: "p",
          label: "Pending approvals",
          value: String(pending),
          icon: AlertTriangle,
          tone: pending > 0 ? "warn" : "info"
        }),
        h(StatCard, {
          key: "rep",
          label: "Open reports",
          value: String(openReports),
          icon: Flag,
          tone: openReports > 0 ? "danger" : "info"
        })
      ]),
      h("div", { key: "grid", className: "grid grid-cols-1 gap-4 xl:grid-cols-3" }, [
        h(
          GlassPanel,
          { key: "ro", className: "xl:col-span-2" },
          [
            h(
              "div",
              { key: "h", className: "mb-3 flex items-center justify-between gap-2" },
              [
                h(
                  "h2",
                  { className: "font-display text-base font-bold text-slate-900 dark:text-white" },
                  "Recent orders"
                ),
                h(
                  "button",
                  {
                    key: "view",
                    type: "button",
                    onClick: () => setTab("orders"),
                    className:
                      "text-xs font-semibold text-sky-600 hover:underline dark:text-sky-300"
                  },
                  "View all"
                )
              ]
            ),
            recentOrders.length === 0
              ? h(EmptyState, { title: "No orders yet", hint: "Orders will appear here as buyers check out." })
              : h(
                  "div",
                  { className: "overflow-x-auto" },
                  h(
                    "table",
                    { className: "w-full min-w-[520px] text-left text-sm" },
                    [
                      h(
                        "thead",
                        { className: "text-xs font-semibold uppercase text-slate-700 dark:text-slate-400" },
                        h("tr", null, [
                          h("th", { className: "py-2 pr-3" }, "Order"),
                          h("th", { className: "py-2 pr-3" }, "Total"),
                          h("th", { className: "py-2 pr-3" }, "Status"),
                          h("th", { className: "py-2 pr-3" }, "Date")
                        ])
                      ),
                      h(
                        "tbody",
                        { className: "divide-y divide-slate-200/90 dark:divide-white/10" },
                        recentOrders.map((o) =>
                          h(
                            "tr",
                            { key: o.id, className: "hover:bg-white/5" },
                            [
                              h(
                                "td",
                                { className: "py-2 pr-3 font-mono text-xs text-slate-700 dark:text-slate-200" },
                                shortId(o.id)
                              ),
                              h(
                                "td",
                                { className: "py-2 pr-3 font-semibold text-slate-900 dark:text-white" },
                                o.total != null ? formatGhc(o.total) : "—"
                              ),
                              h(
                                "td",
                                { className: "py-2 pr-3" },
                                h(Badge, { tone: adminOrderFulfillmentBadgeTone(o) }, formatOrderFulfillmentLabel(o))
                              ),
                              h(
                                "td",
                                { className: "py-2 pr-3 text-xs text-slate-500" },
                                fmtDate(o.createdAt)
                              )
                            ]
                          )
                        )
                      )
                    ]
                  )
                )
          ]
        ),
        h(GlassPanel, { key: "chart" }, [
          h(
            "div",
            { key: "h", className: "mb-3 flex items-center justify-between gap-2" },
            [
              h(
                "h2",
                { className: "font-display text-base font-bold text-slate-900 dark:text-white" },
                "Revenue overview"
              ),
              h(
                "span",
                {
                  className:
                    "rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300"
                },
                `${revenue?.totals?.commissionPercent ?? revPct ?? 0}%`
              )
            ]
          ),
          h(
            "p",
            { key: "tot", className: "mb-2 font-display text-2xl font-bold text-slate-900 dark:text-white" },
            formatGhc(revenue?.totals?.platformFee || 0)
          ),
          h(
            "p",
            { key: "hi", className: "mb-3 text-xs text-slate-500 dark:text-slate-400" },
            `Last ${revenue?.days || 30} days · non-cancelled, excludes fully refunded`
          ),
          revenue && (revenue.series?.length || 0) > 0
            ? h(RevenueLineChart, { series: revenue.series })
            : h(EmptyState, { title: "No data yet", hint: "Paid orders will populate this graph." })
        ])
      ])
    ]);
  };

  /* ---------------- Users ---------------- */

  const renderUsers = () => {
    return h("div", { className: "space-y-4" }, [
      h(
        "div",
        { key: "bar", className: "flex flex-wrap items-center justify-between gap-3" },
        [
          h(TabBar, {
            key: "tabs",
            tabs: USER_TABS,
            value: usersRoleTab,
            onChange: onUsersRoleChange
          }),
          isSuperAdmin
            ? h(
                "button",
                {
                  key: "addm",
                  type: "button",
                  onClick: () => setAddAdminOpen(true),
                  className:
                    "inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-violet-300/50 bg-violet-500/15 px-3 py-2 text-sm font-semibold text-violet-800 shadow-sm hover:bg-violet-500/25 dark:border-violet-500/30 dark:text-violet-100 dark:hover:bg-violet-500/20"
                },
                [h(UserPlus, { className: "h-4 w-4" }), "Add admin"]
              )
            : null,
          h(
            "form",
            {
              key: "f",
              className: "flex flex-1 items-center gap-2 sm:max-w-lg",
              onSubmit: (e) => {
                e.preventDefault();
                setUsersSearch(usersSearchInput.trim());
              }
            },
            [
              h(SearchBox, {
                key: "s",
                value: usersSearchInput,
                onChange: setUsersSearchInput,
                placeholder: "Search users by name or email…",
                className: "flex-1"
              }),
              h(SelectInput, {
                key: "st",
                value: usersStatus,
                onChange: (e) => setUsersStatus(e.target.value),
                className: "!min-h-[40px] !w-auto !px-3 !text-sm"
              }, [
                h("option", { key: "all", value: "all" }, "All statuses"),
                h("option", { key: "a", value: "active" }, "Active"),
                h("option", { key: "s", value: "suspended" }, "Suspended"),
                h("option", { key: "b", value: "banned" }, "Banned")
              ]),
              h(
                "button",
                {
                  key: "go",
                  type: "submit",
                  className:
                    "inline-flex items-center gap-1 rounded-2xl border border-slate-300/70 bg-white/50 px-3 py-2 text-sm font-medium hover:bg-white/70 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                },
                [h(FilterIcon, { key: "i", className: "h-4 w-4" }), "Apply"]
              )
            ]
          )
        ]
      ),
      userCounts
        ? h("div", { key: "c", className: "grid grid-cols-2 gap-3 sm:grid-cols-4" }, [
            h(StatCard, {
              key: "all",
              label: "All users",
              value: String(userCounts.all || 0),
              icon: UsersIcon
            }),
            h(StatCard, { key: "b", label: "Buyers", value: String(userCounts.buyers || 0), icon: UsersIcon }),
            h(StatCard, { key: "s", label: "Sellers", value: String(userCounts.sellers || 0), icon: Store }),
            h(StatCard, { key: "a", label: "Admins", value: String(userCounts.admins || 0), icon: Shield })
          ])
        : null,
      h(
        GlassCard,
        { key: "tbl", className: "!overflow-x-auto !p-0" },
        h(
          "table",
          { className: "w-full min-w-[1200px] text-left text-sm" },
          [
            h(
              "thead",
              { className: "bg-slate-100/95 text-xs font-semibold uppercase text-slate-700 dark:bg-white/5 dark:text-slate-400" },
              h("tr", null, [
                h("th", { className: "px-4 py-3" }, "Name"),
                h("th", { className: "px-4 py-3" }, "Role"),
                h("th", { className: "px-4 py-3" }, "Email"),
                h("th", { className: "px-4 py-3" }, "Joined"),
                h("th", { className: "px-4 py-3" }, "Status"),
                h("th", { className: "min-w-[26rem] whitespace-nowrap px-4 py-3" }, "Actions")
              ])
            ),
            h(
              "tbody",
              { className: "divide-y divide-slate-200/90 dark:divide-white/10" },
              users.length === 0
                ? h(
                    "tr",
                    { key: "e" },
                    h(
                      "td",
                      { colSpan: 6, className: "px-4 py-12 text-center text-sm text-slate-500" },
                      "No users match the current filters."
                    )
                  )
                : users.map((u) =>
                    h(
                      "tr",
                      { key: u.id, className: "hover:bg-white/5" },
                      [
                        h(
                          "td",
                          { className: "px-4 py-3" },
                          h("div", { className: "flex items-center gap-3" }, [
                            h(Avatar, { key: "a", user: u, size: 36 }),
                            h("div", { key: "m", className: "min-w-0" }, [
                              h(
                                "div",
                                { className: "truncate font-medium text-slate-900 dark:text-white" },
                                u.displayName || "—"
                              ),
                              h(
                                "div",
                                { className: "truncate text-xs text-slate-500 dark:text-slate-400" },
                                u.email || u.id
                              )
                            ])
                          ])
                        ),
                        h(
                          "td",
                          { className: "px-4 py-3 capitalize" },
                          h(
                            Badge,
                            {
                              tone:
                                u.role === "admin"
                                  ? (u.adminLevel === "normal" ? "neutral" : "warn")
                                  : "neutral"
                            },
                            u.role === "admin"
                              ? u.adminLevel === "super"
                                ? "Super admin"
                                : u.adminLevel === "normal"
                                  ? "Admin"
                                  : u.role
                              : u.role
                          )
                        ),
                        h(
                          "td",
                          { className: "px-4 py-3 text-slate-700 dark:text-slate-200" },
                          u.email || "—"
                        ),
                        h(
                          "td",
                          { className: "px-4 py-3 text-slate-500" },
                          fmtDate(u.createdAt)
                        ),
                        h(
                          "td",
                          { className: "px-4 py-3" },
                          h(
                            "div",
                            { className: "flex flex-wrap items-center gap-1" },
                            [
                              h(
                                Badge,
                                { key: "s", tone: accountStatusTone(u.accountStatus || "active") },
                                u.accountStatus || "active"
                              ),
                              u.role === "seller" && u.sellerVerified
                                ? h(
                                    Badge,
                                    { key: "v", tone: "success" },
                                    [h(BadgeCheck, { key: "i", className: "mr-1 h-3 w-3" }), "Verified"]
                                  )
                                : null
                            ].filter(Boolean)
                          )
                        ),
                        h(
                          "td",
                          { className: "min-w-[26rem] whitespace-nowrap px-4 py-3 align-top" },
                          h("div", { className: "flex flex-nowrap items-center gap-1" }, [
                            isSuperAdmin && u.role !== "admin" && (u.accountStatus || "active") === "active"
                              ? h(
                                  "button",
                                  {
                                    key: "ma",
                                    type: "button",
                                    onClick: () => onMakeAdmin(u),
                                    className:
                                      "shrink-0 whitespace-nowrap rounded-xl border border-violet-300/50 bg-violet-500/10 px-2.5 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-500/20 dark:text-violet-200"
                                  },
                                  "Make admin"
                                )
                              : null,
                            isSuperAdmin &&
                            u.role === "admin" &&
                            u.adminLevel !== "super" &&
                            String(u.id) !== String(user?.id)
                              ? h(
                                  "button",
                                  {
                                    key: "ra",
                                    type: "button",
                                    onClick: () => onRevokeAdmin(u),
                                    className:
                                      "shrink-0 whitespace-nowrap rounded-xl border border-slate-300/50 bg-slate-500/10 px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-500/20 dark:text-slate-200"
                                  },
                                  "Remove admin"
                                )
                              : null,
                            (u.role !== "admin" || isSuperAdmin) &&
                            (u.accountStatus === "active"
                              ? u.adminLevel !== "super"
                                ? h(
                                    "button",
                                    {
                                      key: "su",
                                      type: "button",
                                      onClick: () => patchUser(u.id, { accountStatus: "suspended" }),
                                      className:
                                        "shrink-0 whitespace-nowrap rounded-xl border border-amber-300/50 bg-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-500/15 dark:text-amber-200"
                                    },
                                    "Suspend"
                                  )
                                : null
                              : h(
                                  "button",
                                  {
                                    key: "re",
                                    type: "button",
                                    onClick: () => patchUser(u.id, { accountStatus: "active" }),
                                    className:
                                      "shrink-0 whitespace-nowrap rounded-xl border border-emerald-300/50 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-200"
                                  },
                                  "Restore"
                                )),
                            u.role !== "admin" && u.accountStatus !== "banned"
                              ? h(
                                  "button",
                                  {
                                    key: "ba",
                                    type: "button",
                                    onClick: () => onBanUser(u),
                                    className:
                                      "shrink-0 whitespace-nowrap rounded-xl border border-rose-300/50 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-500/15 dark:text-rose-200"
                                  },
                                  "Ban"
                                )
                              : null,
                            isSuperAdmin && u.role !== "admin"
                              ? h(
                                  "button",
                                  {
                                    key: "del",
                                    type: "button",
                                    title: "Delete user permanently (super admin only)",
                                    onClick: () => deleteUserRow(u),
                                    className:
                                      "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border border-rose-300/60 bg-rose-600/10 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-600/20 dark:border-rose-400/40 dark:text-rose-200"
                                  },
                                  [h(Trash2, { key: "i", className: "h-3.5 w-3.5" }), "Delete"]
                                )
                              : null
                          ].filter(Boolean))
                        )
                      ]
                    )
                  )
            )
          ]
        )
      ),
      h(Pager, {
        key: "p",
        page: usersPage,
        total: usersTotal,
        limit: usersLimit,
        onPage: setUsersPage
      }),
      h(Modal, {
        key: "addAdm",
        size: "sm",
        open: addAdminOpen,
        title: "Add user as admin",
        onClose: () => {
          if (addAdminBusy) return;
          setAddAdminOpen(false);
          setAddAdminEmail("");
        }
      }, [
        h(
          "p",
          { key: "h", className: "mb-3 text-sm text-slate-600 dark:text-slate-300" },
          "The account must already exist and be active. They should sign in again to pick up the new admin role in their session."
        ),
        h(
          Field,
          { key: "em", label: "User email" },
          h(TextInput, {
            type: "email",
            autoComplete: "email",
            disabled: addAdminBusy,
            value: addAdminEmail,
            onChange: (e) => setAddAdminEmail(e.target.value),
            placeholder: "name@university.edu"
          })
        ),
        h("div", { key: "row", className: "mt-4 flex flex-wrap items-center justify-end gap-2" }, [
          h(
            Button,
            {
              key: "c",
              variant: "ghost",
              disabled: addAdminBusy,
              onClick: () => {
                if (addAdminBusy) return;
                setAddAdminOpen(false);
                setAddAdminEmail("");
              }
            },
            "Cancel"
          ),
          h(
            Button,
            {
              key: "g",
              loading: addAdminBusy,
              onClick: async () => {
                const e = addAdminEmail.trim().toLowerCase();
                if (!e || !e.includes("@")) {
                  await alert("Enter a valid email address.");
                  return;
                }
                await grantUserAdmin({ email: e });
              }
            },
            "Grant access"
          )
        ])
      ])
    ].filter(Boolean));
  };

  /* ---------------- Riders (delivery accounts) ---------------- */

  const renderRiders = () => {
    const totalPop = ridersCounts?.riders ?? ridersTotal ?? 0;
    return h("div", { className: "space-y-4" }, [
      h("p", { key: "hd", className: "text-sm text-slate-500 dark:text-slate-400" }, PAGE_TITLES.riders.hint),
      h(
        "div",
        { key: "bar", className: "flex flex-wrap items-center justify-between gap-3" },
        [
          h(
            "button",
            {
              key: "add-r",
              type: "button",
              onClick: () => setAddRiderOpen(true),
              className:
                "inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-sky-300/50 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-800 shadow-sm hover:bg-sky-500/25 dark:border-sky-500/30 dark:text-sky-100 dark:hover:bg-sky-500/20"
            },
            [h(Bike, { className: "h-4 w-4" }), "Add rider"]
          ),
          h(
            "form",
            {
              key: "f",
              className: "flex flex-1 flex-wrap items-center gap-2 lg:justify-end lg:gap-3",
              onSubmit: (e) => {
                e.preventDefault();
                setRidersSearch(ridersSearchInput.trim());
              }
            },
            [
              h(SearchBox, {
                key: "s",
                value: ridersSearchInput,
                onChange: setRidersSearchInput,
                placeholder: "Search by email or name…",
                className: "min-w-[12rem] flex-1 sm:max-w-xs"
              }),
              h(SelectInput, {
                key: "st",
                value: ridersStatus,
                onChange: (e) => setRidersStatus(e.target.value),
                className: "!min-h-[40px] !w-auto !px-3 !text-sm"
              }, [
                h("option", { key: "all", value: "all" }, "All statuses"),
                h("option", { key: "a", value: "active" }, "Active"),
                h("option", { key: "s", value: "suspended" }, "Suspended"),
                h("option", { key: "b", value: "banned" }, "Banned")
              ]),
              h(SelectInput, {
                key: "vf",
                value: ridersVerified,
                onChange: (e) => setRidersVerified(e.target.value),
                className: "!min-h-[40px] !w-auto !px-3 !text-sm"
              }, [
                h("option", { key: "all", value: "all" }, "Email: any"),
                h("option", { key: "y", value: "yes" }, "Verified"),
                h("option", { key: "n", value: "no" }, "Not verified")
              ]),
              h(
                "button",
                {
                  key: "go",
                  type: "submit",
                  className:
                    "inline-flex items-center gap-1 rounded-2xl border border-slate-300/70 bg-white/50 px-3 py-2 text-sm font-medium hover:bg-white/70 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                },
                [h(FilterIcon, { key: "i", className: "h-4 w-4" }), "Apply"]
              )
            ]
          )
        ]
      ),
      h(StatCard, {
        key: "c-pop",
        label: "Courier / rider accounts",
        value: String(totalPop),
        icon: Bike
      }),
      h(
        GlassCard,
        { key: "tbl", className: "!overflow-x-auto !p-0" },
        h(
          "table",
          { className: "w-full min-w-[760px] text-left text-sm" },
          [
            h(
              "thead",
              {
                className:
                  "bg-slate-100/95 text-xs font-semibold uppercase text-slate-700 dark:bg-white/5 dark:text-slate-400"
              },
              h("tr", null, [
                h("th", { className: "px-4 py-3" }, "Rider"),
                h("th", { className: "px-4 py-3" }, "Contact"),
                h("th", { className: "px-4 py-3" }, "Vehicle"),
                h("th", { className: "px-4 py-3" }, "Email ✓"),
                h("th", { className: "px-4 py-3" }, "Status"),
                h("th", { className: "px-4 py-3" }, "Joined"),
                h("th", { className: "min-w-[14rem] px-4 py-3" }, "Actions")
              ])
            ),
            h(
              "tbody",
              { className: "divide-y divide-slate-200/90 dark:divide-white/10" },
              riders.length === 0
                ? h(
                    "tr",
                    { key: "e" },
                    h(
                      "td",
                      { colSpan: 7, className: "px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400" },
                      "No riders match the filters. Approve courier applications or use Add rider to create one."
                    )
                  )
                : riders.map((r) =>
                    h(
                      "tr",
                      { key: r.id, className: "hover:bg-white/5" },
                      [
                        h(
                          "td",
                          { className: "px-4 py-3" },
                          h("div", { className: "flex items-center gap-3" }, [
                            h(Avatar, { key: "a", user: r, size: 36 }),
                            h(
                              "div",
                              { key: "m", className: "min-w-0 font-medium text-slate-900 dark:text-white" },
                              r.displayName || "—"
                            )
                          ])
                        ),
                        h(
                          "td",
                          { className: "max-w-[14rem] px-4 py-3 text-xs leading-snug text-slate-700 dark:text-slate-200" },
                          [
                            h("p", { key: "e", className: "truncate" }, r.email || "—"),
                            h("p", { key: "p", className: "truncate text-slate-500" }, r.phone || "—")
                          ]
                        ),
                        h(
                          "td",
                          { className: "px-4 py-3 text-xs text-slate-700 dark:text-slate-200" },
                          r.riderProfile?.vehicleType || "—"
                        ),
                        h(
                          "td",
                          { className: "px-4 py-3" },
                          h(Badge, { tone: r.emailVerified ? "success" : "warn" }, r.emailVerified ? "Yes" : "No")
                        ),
                        h(
                          "td",
                          { className: "px-4 py-3" },
                          h(Badge, { tone: accountStatusTone(r.accountStatus || "active") }, r.accountStatus || "active")
                        ),
                        h(
                          "td",
                          { className: "px-4 py-3 text-xs text-slate-500" },
                          fmtDate(r.createdAt)
                        ),
                        h(
                          "td",
                          { className: "align-top whitespace-nowrap px-4 py-3" },
                          h("div", { className: "flex flex-wrap gap-1" }, [
                            r.accountStatus === "active"
                              ? h(
                                  "button",
                                  {
                                    key: "su",
                                    type: "button",
                                    className:
                                      "shrink-0 rounded-xl border border-amber-300/50 bg-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-500/15 dark:text-amber-200",
                                    onClick: () => patchUser(r.id, { accountStatus: "suspended" }, loadRiders)
                                  },
                                  "Suspend"
                                )
                              : h(
                                  "button",
                                  {
                                    key: "act",
                                    type: "button",
                                    className:
                                      "shrink-0 rounded-xl border border-emerald-300/50 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-500/15 dark:text-emerald-200",
                                    onClick: () => patchUser(r.id, { accountStatus: "active" }, loadRiders)
                                  },
                                  "Activate"
                                ),
                            isSuperAdmin
                              ? h(
                                  "button",
                                  {
                                    key: "del",
                                    type: "button",
                                    className:
                                      "shrink-0 rounded-xl border border-rose-300/60 bg-rose-600/10 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-600/20 dark:text-rose-200",
                                    onClick: () => deleteRiderRow(r)
                                  },
                                  [h(Trash2, { key: "i", className: "h-3.5 w-3.5" }), " Delete"]
                                )
                              : null
                          ].filter(Boolean))
                        )
                      ]
                    )
                  )
            )
          ]
        )
      ),
      h(Pager, {
        key: "p-r",
        page: ridersPage,
        total: ridersTotal,
        limit: ridersLimit,
        onPage: setRidersPage
      }),
      h(Modal, {
        key: "addRiderModal",
        open: addRiderOpen,
        title: "Create rider account",
        size: "sm",
        onClose: () => {
          if (!addRiderBusy) setAddRiderOpen(false);
        }
      }, [
        h(
          "p",
          { key: "h", className: "mb-3 text-xs text-slate-600 dark:text-slate-300" },
          "Creates a courier login with rider role + vehicle profile. They can sign in at /login after you share the temporary password."
        ),
        h(Field, { key: "em", label: "Email" }, h(TextInput, {
          type: "email",
          value: addRiderForm.email,
          disabled: addRiderBusy,
          onChange: (e) => setAddRiderForm((f) => ({ ...f, email: e.target.value }))
        })),
        h(Field, { key: "pw", label: "Temporary password (min 8)" }, h(TextInput, {
          type: "password",
          value: addRiderForm.password,
          disabled: addRiderBusy,
          autoComplete: "new-password",
          onChange: (e) => setAddRiderForm((f) => ({ ...f, password: e.target.value }))
        })),
        h(Field, { key: "nm", label: "Display name (optional)" }, h(TextInput, {
          value: addRiderForm.displayName,
          disabled: addRiderBusy,
          onChange: (e) => setAddRiderForm((f) => ({ ...f, displayName: e.target.value }))
        })),
        h(Field, { key: "ph", label: "Phone (optional)" }, h(TextInput, {
          value: addRiderForm.phone,
          disabled: addRiderBusy,
          onChange: (e) => setAddRiderForm((f) => ({ ...f, phone: e.target.value }))
        })),
        h(Field, { key: "vt", label: "Vehicle type" }, h(TextInput, {
          placeholder: "bicycle, motorcycle, …",
          value: addRiderForm.vehicleType,
          disabled: addRiderBusy,
          onChange: (e) => setAddRiderForm((f) => ({ ...f, vehicleType: e.target.value }))
        })),
        h("div", { key: "row-btn", className: "mt-4 flex justify-end gap-2" }, [
          h(
            Button,
            {
              key: "cx",
              variant: "ghost",
              disabled: addRiderBusy,
              onClick: () => !addRiderBusy && setAddRiderOpen(false)
            },
            "Cancel"
          ),
          h(Button, {
            key: "ok",
            loading: addRiderBusy,
            onClick: () => void submitCreateRider()
          }, "Create")
        ])
      ])
    ]);
  };

  /* ---------------- Vendor applications (buyer → seller) ---------------- */

  const renderVendorApplications = () => {
    return h("div", { className: "space-y-4" }, [
      h("p", { key: "hd", className: "text-sm text-slate-500 dark:text-slate-400" }, "Review applications from shoppers who want to sell on SHOPIQGH."),
      h("div", { key: "bar", className: "flex flex-wrap items-center justify-between gap-3" }, [
        h(TabBar, { key: "tabs", tabs: VENDOR_APP_TABS, value: vendorAppsStatus, onChange: setVendorAppsStatus }),
        h(
          "form",
          {
            key: "f",
            className: "flex items-center gap-2 sm:w-80",
            onSubmit: (e) => {
              e.preventDefault();
              setVendorAppsSearch(vendorAppsSearchInput.trim());
            }
          },
          [
            h(SearchBox, {
              key: "s",
              value: vendorAppsSearchInput,
              onChange: setVendorAppsSearchInput,
              placeholder: "Search by shop, name, email…",
              className: "flex-1"
            }),
            h(
              "button",
              {
                key: "go",
                type: "submit",
                className:
                  "rounded-2xl border border-slate-300/70 bg-white/50 px-3 py-2 text-sm font-medium hover:bg-white/70 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
              },
              "Filter"
            )
          ]
        )
      ]),
      vendorAppRows.length === 0
        ? h(EmptyState, {
            key: "e",
            title: "No applications",
            hint: vendorAppsStatus === "pending" ? "Pending requests appear when shoppers submit the vendor form." : "Try another filter or search.",
            icon: ClipboardList
          })
        : h(
            "div",
            { key: "l", className: "grid grid-cols-1 gap-3 lg:grid-cols-2" },
            vendorAppRows.map((row) => {
              const applicantUser = {
                displayName: row.accountDisplayName || row.fullName,
                email: row.email,
                id: row.userId,
                role: "buyer"
              };
              const locationLine = [VENDOR_LOC_BASE_LABELS[row.locationBase] || row.locationBase, row.nearbyArea]
                .filter(Boolean)
                .join(" · ");
              const detail = (label, value) =>
                value == null || String(value).trim() === ""
                  ? null
                  : h("div", { key: label, className: "min-w-0 sm:col-span-1" }, [
                      h(
                        "dt",
                        { className: "text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400" },
                        label
                      ),
                      h("dd", { className: "mt-0.5 break-words text-sm text-slate-800 dark:text-slate-200" }, value)
                    ]);
              const statusLabel =
                row.status === "pending" ? "Pending review" : row.status === "approved" ? "Approved" : "Rejected";
              return h(
                GlassCard,
                { key: row.id },
                [
                  h("div", { key: "top", className: "flex items-start justify-between gap-3" }, [
                    h("div", { className: "flex min-w-0 flex-1 items-center gap-3" }, [
                      h(Avatar, { key: "a", user: applicantUser, size: 48 }),
                      h("div", { key: "m", className: "min-w-0 flex-1" }, [
                        h("p", { className: "truncate font-semibold text-slate-900 dark:text-white" }, row.shopName),
                        h(
                          "p",
                          { className: "truncate text-xs text-slate-500 dark:text-slate-400" },
                          `${row.fullName} · ${row.email}`
                        ),
                        h("div", { key: "badges", className: "mt-2 flex flex-wrap items-center gap-2" }, [
                          h("span", { className: "text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, "Status"),
                          h(Badge, { key: "s", tone: vendorAppStatusTone(row.status) }, statusLabel),
                          h(Badge, { key: "c", tone: "neutral" }, CATEGORY_LABELS[row.category] || row.category)
                        ])
                      ])
                    ]),
                    h("div", { key: "meta", className: "shrink-0 text-right" }, [
                      h("p", { className: "text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, "Submitted"),
                      h("p", { className: "text-xs font-medium text-slate-700 dark:text-slate-200" }, fmtDate(row.createdAt)),
                      h("p", { className: "mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, "Applicant ID"),
                      h("p", { className: "font-mono text-[11px] text-slate-600 dark:text-slate-300" }, shortId(row.userId))
                    ])
                  ]),
                  h(
                    "div",
                    {
                      key: "details",
                      className: "mt-4 rounded-2xl border border-white/10 bg-white/35 p-3 dark:bg-white/5"
                    },
                    [
                      h(
                        "p",
                        { className: "mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400" },
                        "Details"
                      ),
                      h(
                        "dl",
                        { className: "grid gap-3 sm:grid-cols-2" },
                        [
                          detail("Shop description", row.shopDescription),
                          detail("What they sell", row.sellsDescription),
                          detail("Location", locationLine || "—"),
                          detail("Phone", row.phone ? `${row.phone}${row.altPhone ? ` · Alt ${row.altPhone}` : ""}` : "—"),
                          detail("Verification", row.verificationDocUrl ? "File uploaded" : "None uploaded"),
                          row.reviewedAt ? detail("Reviewed on", fmtDateTime(row.reviewedAt)) : null,
                          row.adminNote ? detail("Admin note", row.adminNote) : null,
                          row.accountRole ? detail("Account role", row.accountRole) : null
                        ].filter(Boolean)
                      )
                    ]
                  ),
                  row.status === "approved" && row.accountRole !== "seller"
                    ? h(
                        "p",
                        {
                          key: "pending-role",
                          className:
                            "mt-3 rounded-xl border border-amber-300/60 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-100"
                        },
                        row.accountRole === "buyer" || row.sellerRolePending
                          ? "Approved, but this email is still a buyer in Users. Use Apply seller role below (requires latest admin + API deploy)."
                          : row.accountRole == null
                            ? "Approved — no shopper account with this email yet. They must register with the same email, then use Apply seller role."
                            : `Approved — linked account role is “${row.accountRole}”. Use Apply seller role if they should be a vendor.`
                      )
                    : null,
                  h("div", { key: "actions", className: "mt-4 flex flex-wrap gap-2" }, [
                    h(
                      Button,
                      {
                        key: "det",
                        variant: "ghost",
                        className: "!min-h-[36px] !px-3 !text-xs",
                        onClick: () => setVendorVerificationApp(row)
                      },
                      [h(Eye, { key: "i", className: "h-4 w-4" }), "View details"]
                    ),
                    row.verificationDocUrl
                      ? h(
                          Button,
                          {
                            key: "doc",
                            variant: "ghost",
                            className: "!min-h-[36px] !px-3 !text-xs",
                            onClick: () => window.open(row.verificationDocUrl, "_blank", "noopener,noreferrer")
                          },
                          "Open verification file"
                        )
                      : null,
                    vendorAppsStatus === "pending" && row.status === "pending"
                      ? [
                          h(
                            Button,
                            {
                              key: "ok",
                              className: "!min-h-[36px] !bg-emerald-600 !px-3 !text-xs hover:!bg-emerald-500",
                              onClick: () => onVendorAppDecision(row, "approve")
                            },
                            [h(Check, { key: "i", className: "h-4 w-4" }), "Approve"]
                          ),
                          h(
                            Button,
                            {
                              key: "no",
                              variant: "danger",
                              className: "!min-h-[36px] !px-3 !text-xs",
                              onClick: () => onVendorAppDecision(row, "reject")
                            },
                            [h(XCircle, { key: "i", className: "h-4 w-4" }), "Reject"]
                          )
                        ]
                      : null,
                    row.status === "approved" && row.accountRole !== "seller" && row.accountRole !== "admin" && row.accountRole !== "rider"
                      ? h(
                          Button,
                          {
                            key: "sync",
                            className: "!min-h-[36px] !bg-amber-600 !px-3 !text-xs hover:!bg-amber-500",
                            onClick: () => onSyncVendorSellerRole(row)
                          },
                          "Apply seller role"
                        )
                      : null,
                    row.status !== "pending" && isSuperAdmin
                      ? h(
                          "button",
                          {
                            key: "del",
                            type: "button",
                            onClick: () => deleteVendorAppRow(row),
                            className:
                              "ml-auto inline-flex items-center gap-1 rounded-xl border border-rose-300/60 bg-white/60 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 dark:border-rose-400/40 dark:bg-night-900/40 dark:text-rose-200 dark:hover:bg-rose-950/30"
                          },
                          [h(Trash2, { key: "i", className: "h-3.5 w-3.5" }), "Delete (super)"]
                        )
                      : null
                  ].flat().filter(Boolean))
                ]
              );
            })
          ),
      h(Pager, {
        key: "p",
        page: vendorAppsPage,
        total: vendorAppsTotal,
        limit: vendorAppsLimit,
        onPage: setVendorAppsPage
      })
    ]);
  };

  /* ---------------- Courier applications (buyer → rider) ---------------- */

  const renderCourierApplications = () => {
    return h("div", { className: "space-y-4" }, [
      h(
        "p",
        { key: "hd", className: "text-sm text-slate-500 dark:text-slate-400" },
        "Approve shoppers who will pick up and hand off deliveries. Approval promotes the account to rider and creates a vehicle profile."
      ),
      h("div", { key: "bar", className: "flex flex-wrap items-center justify-between gap-3" }, [
        h(TabBar, { key: "tabs", tabs: COURIER_APP_TABS, value: courierAppsStatus, onChange: setCourierAppsStatus }),
        h(
          "form",
          {
            key: "f",
            className: "flex items-center gap-2 sm:w-80",
            onSubmit: (e) => {
              e.preventDefault();
              setCourierAppsSearch(courierAppsSearchInput.trim());
            }
          },
          [
            h(SearchBox, {
              key: "s",
              value: courierAppsSearchInput,
              onChange: setCourierAppsSearchInput,
              placeholder: "Search name, email, phone…",
              className: "flex-1"
            }),
            h(
              "button",
              {
                key: "go",
                type: "submit",
                className:
                  "rounded-2xl border border-slate-300/70 bg-white/50 px-3 py-2 text-sm font-medium hover:bg-white/70 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
              },
              "Filter"
            )
          ]
        )
      ]),
      courierAppRows.length === 0
        ? h(EmptyState, {
            key: "e",
            title: "No applications",
            hint:
              courierAppsStatus === "pending"
                ? "Pending requests appear when shoppers submit Become a rider."
                : "Try another filter or search.",
            icon: Truck
          })
        : h(
            "div",
            { key: "l", className: "grid grid-cols-1 gap-3 lg:grid-cols-2" },
            courierAppRows.map((row) => {
              const applicantUser = {
                displayName: row.accountDisplayName || row.fullName,
                email: row.email,
                id: row.userId,
                role: "buyer"
              };
              const detail = (label, value) =>
                value == null || String(value).trim() === ""
                  ? null
                  : h("div", { key: label, className: "min-w-0 sm:col-span-1" }, [
                      h(
                        "dt",
                        { className: "text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400" },
                        label
                      ),
                      h("dd", { className: "mt-0.5 break-words text-sm text-slate-800 dark:text-slate-200" }, value)
                    ]);
              const statusLabel =
                row.status === "pending" ? "Pending review" : row.status === "approved" ? "Approved" : "Rejected";
              return h(
                GlassCard,
                { key: row.id },
                [
                  h("div", { key: "top", className: "flex items-start justify-between gap-3" }, [
                    h("div", { className: "flex min-w-0 flex-1 items-center gap-3" }, [
                      h(Avatar, { key: "a", user: applicantUser, size: 48 }),
                      h("div", { key: "m", className: "min-w-0 flex-1" }, [
                        h("p", { className: "truncate font-semibold text-slate-900 dark:text-white" }, row.fullName),
                        h(
                          "p",
                          { className: "truncate text-xs text-slate-500 dark:text-slate-400" },
                          `${row.email} · ${row.phone}`
                        ),
                        h("div", { key: "badges", className: "mt-2 flex flex-wrap items-center gap-2" }, [
                          h("span", { className: "text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, "Status"),
                          h(Badge, { key: "s", tone: vendorAppStatusTone(row.status) }, statusLabel),
                          h(Badge, { key: "v", tone: "neutral" }, row.vehicleType)
                        ])
                      ])
                    ]),
                    h("div", { key: "meta", className: "shrink-0 text-right" }, [
                      h("p", { className: "text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, "Submitted"),
                      h("p", { className: "text-xs font-medium text-slate-700 dark:text-slate-200" }, fmtDate(row.createdAt)),
                      h("p", { className: "mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, "Applicant ID"),
                      h("p", { className: "font-mono text-[11px] text-slate-600 dark:text-slate-300" }, shortId(row.userId))
                    ])
                  ]),
                  h(
                    "div",
                    {
                      key: "details",
                      className: "mt-4 rounded-2xl border border-white/10 bg-white/35 p-3 dark:bg-white/5"
                    },
                    [
                      h(
                        "p",
                        { className: "mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400" },
                        "Details"
                      ),
                      h(
                        "dl",
                        { className: "grid gap-3 sm:grid-cols-2" },
                        [
                          detail("Notes", row.notes),
                          detail("ID document", row.idDocUrl ? "File uploaded" : "None uploaded"),
                          row.reviewedAt ? detail("Reviewed on", fmtDateTime(row.reviewedAt)) : null,
                          row.adminNote ? detail("Admin note", row.adminNote) : null
                        ].filter(Boolean)
                      )
                    ]
                  ),
                  h("div", { key: "actions", className: "mt-4 flex flex-wrap gap-2" }, [
                    row.idDocUrl
                      ? h(
                          Button,
                          {
                            key: "doc",
                            variant: "ghost",
                            className: "!min-h-[36px] !px-3 !text-xs",
                            onClick: () => window.open(row.idDocUrl, "_blank", "noopener,noreferrer")
                          },
                          "Open ID file"
                        )
                      : null,
                    courierAppsStatus === "pending" && row.status === "pending"
                      ? [
                          h(
                            Button,
                            {
                              key: "ok",
                              className: "!min-h-[36px] !bg-emerald-600 !px-3 !text-xs hover:!bg-emerald-500",
                              onClick: () => onCourierApplicationDecision(row, "approve")
                            },
                            [h(Check, { key: "i", className: "h-4 w-4" }), "Approve"]
                          ),
                          h(
                            Button,
                            {
                              key: "no",
                              variant: "danger",
                              className: "!min-h-[36px] !px-3 !text-xs",
                              onClick: () => onCourierApplicationDecision(row, "reject")
                            },
                            [h(XCircle, { key: "i", className: "h-4 w-4" }), "Reject"]
                          )
                        ]
                      : null,
                    row.status !== "pending" && isSuperAdmin
                      ? h(
                          "button",
                          {
                            key: "del",
                            type: "button",
                            onClick: () => deleteCourierAppRow(row),
                            className:
                              "ml-auto inline-flex items-center gap-1 rounded-xl border border-rose-300/60 bg-white/60 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 dark:border-rose-400/40 dark:bg-night-900/40 dark:text-rose-200 dark:hover:bg-rose-950/30"
                          },
                          [h(Trash2, { key: "i", className: "h-3.5 w-3.5" }), "Delete (super)"]
                        )
                      : null
                  ].flat().filter(Boolean))
                ]
              );
            })
          ),
      h(Pager, {
        key: "p",
        page: courierAppsPage,
        total: courierAppsTotal,
        limit: courierAppsLimit,
        onPage: setCourierAppsPage
      })
    ]);
  };

  /* ---------------- Sellers verification ---------------- */

  const renderSellers = () => {
    return h("div", { className: "space-y-4" }, [
      h("p", { key: "hd", className: "text-sm text-slate-500 dark:text-slate-400" }, "Verify and approve seller accounts."),
      h("div", { key: "bar", className: "flex flex-wrap items-center justify-between gap-3" }, [
        h(TabBar, { key: "tabs", tabs: SELLER_TABS, value: sellersTab, onChange: setSellersTab }),
        h(
          "form",
          {
            key: "f",
            className: "flex items-center gap-2 sm:w-80",
            onSubmit: (e) => {
              e.preventDefault();
              setSellersSearch(sellersSearchInput.trim());
            }
          },
          [
            h(SearchBox, {
              key: "s",
              value: sellersSearchInput,
              onChange: setSellersSearchInput,
              placeholder: "Search sellers…",
              className: "flex-1"
            }),
            h(
              "button",
              {
                key: "go",
                type: "submit",
                className:
                  "rounded-2xl border border-slate-300/70 bg-white/50 px-3 py-2 text-sm font-medium hover:bg-white/70 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
              },
              "Filter"
            )
          ]
        )
      ]),
      sellers.length === 0
        ? h(EmptyState, {
            key: "e",
            title: sellersTab === "pending" ? "No pending verifications" : sellersTab === "verified" ? "No verified sellers" : "No rejected sellers",
            hint: "New seller accounts will show up here for review.",
            icon: UserCheck
          })
        : h(
            "div",
            { key: "l", className: "grid grid-cols-1 gap-3 md:grid-cols-2" },
            sellers.map((u) =>
              h(
                GlassCard,
                { key: u.id },
                [
                  h("div", { key: "top", className: "flex items-start justify-between gap-3" }, [
                    h("div", { className: "flex min-w-0 items-center gap-3" }, [
                      h(Avatar, { key: "a", user: u, size: 48 }),
                      h("div", { key: "m", className: "min-w-0" }, [
                        h(
                          "p",
                          { className: "font-semibold text-slate-900 dark:text-white" },
                          u.displayName || "—"
                        ),
                        h(
                          "p",
                          { className: "truncate text-xs text-slate-500" },
                          u.email || u.id
                        ),
                        h("div", { className: "mt-1 flex flex-wrap gap-1" }, [
                          h(
                            Badge,
                            { key: "s", tone: accountStatusTone(u.accountStatus || "active") },
                            u.accountStatus || "active"
                          ),
                          u.sellerVerified
                            ? h(Badge, { key: "v", tone: "success" }, "Verified")
                            : h(Badge, { key: "nv", tone: "warn" }, "Unverified")
                        ])
                      ])
                    ])
                  ]),
                  h(
                    "div",
                    { key: "b", className: "mt-4 flex flex-wrap gap-2" },
                    sellersTab === "pending"
                      ? [
                          h(Button, {
                            key: "v",
                            className: "!min-h-[36px] !px-3 !text-xs",
                            onClick: () => onVerifySeller(u, true)
                          }, [h(Check, { key: "i", className: "h-4 w-4" }), "Verify"]),
                          h(Button, {
                            key: "r",
                            variant: "danger",
                            className: "!min-h-[36px] !px-3 !text-xs",
                            onClick: async () => {
                              const ok = await confirm(`Reject ${u.displayName || u.email || "this seller"}? They'll be banned.`, {
                                title: "Reject seller",
                                confirmLabel: "Reject"
                              });
                              if (!ok) return;
                              await patchUser(u.id, { accountStatus: "banned", sellerVerified: false }, loadSellers);
                            }
                          }, [h(XCircle, { key: "i", className: "h-4 w-4" }), "Reject"]),
                          h(Button, {
                            key: "d",
                            variant: "ghost",
                            className: "!min-h-[36px] !px-3 !text-xs",
                            onClick: () => onOpenUserDetails(u)
                          }, "View details")
                        ]
                      : sellersTab === "verified"
                        ? [
                            h(Button, {
                              key: "d",
                              variant: "ghost",
                              className: "!min-h-[36px] !px-3 !text-xs",
                              onClick: () => onOpenUserDetails(u)
                            }, "View details"),
                            h(Button, {
                              key: "un",
                              variant: "danger",
                              className: "!min-h-[36px] !px-3 !text-xs",
                              onClick: () => onVerifySeller(u, false)
                            }, "Revoke verification")
                          ]
                        : [
                            h(Button, {
                              key: "d",
                              variant: "ghost",
                              className: "!min-h-[36px] !px-3 !text-xs",
                              onClick: () => onOpenUserDetails(u)
                            }, "View details"),
                            h(Button, {
                              key: "res",
                              className: "!min-h-[36px] !px-3 !text-xs",
                              onClick: () => patchUser(u.id, { accountStatus: "active" }, loadSellers)
                            }, "Reinstate")
                          ]
                  )
                ]
              )
            )
          ),
      h(Pager, {
        key: "p",
        page: sellersPage,
        total: sellersTotal,
        limit: sellersLimit,
        onPage: setSellersPage
      })
    ]);
  };

  /* ---------------- Listings ---------------- */

  const renderListings = () => {
    const isPending = listingsTab === "pending_approval";
    return h("div", { className: "space-y-4" }, [
      h(
        "div",
        { key: "bar", className: "flex flex-wrap items-center justify-between gap-3" },
        [
          h(TabBar, { key: "t", tabs: LISTING_TABS, value: listingsTab, onChange: setListingsTab }),
          isPending && listingsTotal > 0
            ? h(
                Button,
                {
                  key: "aa",
                  className: "!min-h-[36px] !px-3 !text-xs whitespace-nowrap",
                  disabled: bulkApproveBusy,
                  onClick: () => void approveAllPendingListings()
                },
                bulkApproveBusy
                  ? "Approving…"
                  : [h(Check, { key: "i", className: "h-4 w-4" }), ` Approve all (up to ${ADMIN_BULK_APPROVE_PENDING_CAP})`]
              )
            : null,
          h(
            "form",
            {
              key: "f",
              className: "flex items-center gap-2 sm:w-96",
              onSubmit: (e) => {
                e.preventDefault();
                setListingsSearch(listingsSearchInput.trim());
              }
            },
            [
              h(SearchBox, {
                key: "s",
                value: listingsSearchInput,
                onChange: setListingsSearchInput,
                placeholder: "Search listings…",
                className: "flex-1"
              }),
              h(
                "button",
                {
                  key: "go",
                  type: "submit",
                  className:
                    "rounded-2xl border border-slate-300/70 bg-white/50 px-3 py-2 text-sm font-medium hover:bg-white/70 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                },
                "Filter"
              )
            ]
          )
        ]
      ),
      isPending
        ? listings.length === 0
          ? h(EmptyState, { key: "e", title: "Nothing pending", hint: "All new listings have been reviewed.", icon: Check })
          : h(
              "div",
              { key: "pend", className: "space-y-3" },
              listings.map((p) =>
                h(
                  GlassCard,
                  { key: p.id, className: "!p-4" },
                  h(
                    "div",
                    { className: "flex flex-wrap items-center gap-4" },
                    [
                      h(
                        "div",
                        {
                          key: "th",
                          className:
                            "flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-900/10 dark:bg-white/5"
                        },
                        productThumb(p)
                          ? h("img", {
                              src: productThumb(p),
                              alt: p.name,
                              className: "h-full w-full object-cover"
                            })
                          : h(Package, { className: "h-8 w-8 text-slate-400" })
                      ),
                      h("div", { key: "mi", className: "min-w-0 flex-1" }, [
                        h(
                          "p",
                          { className: "truncate font-semibold text-slate-900 dark:text-white" },
                          p.name
                        ),
                        h(
                          "p",
                          { className: "mt-1 text-xs text-slate-500" },
                          `${CATEGORY_LABELS[p.category] || p.category} · ${formatGhc(p.price)} · ${
                            Number(p.stock) > 0 ? "In stock" : "Out of stock"
                          }`
                        ),
                        h(
                          "p",
                          { className: "mt-1 text-xs text-slate-500" },
                          `Seller: ${p.sellerLabel || "—"} · submitted ${fmtDate(p.createdAt)}`
                        )
                      ]),
                      h("div", { key: "btns", className: "flex items-center gap-2" }, [
                        h(Button, {
                          key: "ap",
                          className: "!min-h-[36px] !px-3 !text-xs",
                          onClick: () => approveListing(p.id)
                        }, [h(Check, { key: "i", className: "h-4 w-4" }), "Approve"]),
                        h(Button, {
                          key: "rj",
                          variant: "danger",
                          className: "!min-h-[36px] !px-3 !text-xs",
                          onClick: () => openReject(p)
                        }, [h(XCircle, { key: "i", className: "h-4 w-4" }), "Reject"]),
                        h(Button, {
                          key: "vw",
                          variant: "ghost",
                          className: "!min-h-[36px] !px-3 !text-xs",
                          onClick: () => setViewProduct(p)
                        }, "View details")
                      ])
                    ]
                  )
                )
              )
            )
        : h(
            GlassCard,
            { key: "tbl", className: "!overflow-x-auto !p-0" },
            h(
              "table",
              { className: "w-full min-w-[900px] table-fixed text-left text-[11px] leading-snug" },
              [
                h(
                  "thead",
                  { className: "bg-slate-100/95 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-white/5 dark:text-slate-400" },
                  h("tr", null, [
                    h("th", { className: "w-[30%] px-3 py-2" }, "Product"),
                    h("th", { className: "w-[9%] px-3 py-2" }, "Seller"),
                    h("th", { className: "w-[12%] px-3 py-2" }, "Category"),
                    h("th", { className: "w-[8%] px-3 py-2" }, "Price"),
                    h("th", { className: "w-[8%] px-3 py-2" }, "Availability"),
                    h("th", { className: "w-[10%] px-3 py-2" }, "Status"),
                    h("th", { className: "w-[11%] px-3 py-2" }, "Date"),
                    h("th", { className: "w-[14%] px-3 py-2" }, "Actions")
                  ])
                ),
                h(
                  "tbody",
                  { className: "divide-y divide-slate-200/90 dark:divide-white/10" },
                  listings.length === 0
                    ? h("tr", { key: "e" }, h("td", { colSpan: 8, className: "px-3 py-10 text-center text-xs text-slate-500" }, "No listings found."))
                    : listings.map((p) =>
                        h(
                          "tr",
                          { key: p.id, className: "align-middle hover:bg-white/5" },
                          [
                            h("td", { className: "px-3 py-2" }, h("div", { className: "flex items-start gap-2" }, [
                              h(
                                "div",
                                {
                                  key: "th",
                                  className:
                                    "mt-0.5 h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-slate-900/10 dark:bg-white/5"
                                },
                                productThumb(p)
                                  ? h("img", { src: productThumb(p), alt: "", title: p.name, className: "h-full w-full object-cover" })
                                  : h("div", { className: "flex h-full items-center justify-center" }, h(Package, { className: "h-4 w-4 text-slate-400" }))
                              ),
                              h("div", { key: "n", className: "min-w-0 flex-1" }, [
                                h(
                                  "p",
                                  {
                                    className: "line-clamp-2 font-medium text-slate-900 dark:text-white",
                                    title: p.name
                                  },
                                  p.name
                                ),
                                p.flagged
                                  ? h(
                                      "p",
                                      { className: "mt-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-300" },
                                      "Flagged"
                                    )
                                  : null,
                                p.rejectionReason && p.status === "rejected"
                                  ? h(
                                      "p",
                                      {
                                        className: "mt-0.5 line-clamp-1 text-[10px] text-rose-600 dark:text-rose-300",
                                        title: p.rejectionReason
                                      },
                                      `Reason: ${p.rejectionReason}`
                                    )
                                  : null
                              ])
                            ])),
                            h("td", { className: "truncate px-3 py-2 text-slate-700 dark:text-slate-200" }, p.sellerLabel || "—"),
                            h("td", { className: "truncate px-3 py-2 text-slate-600 dark:text-slate-300" }, CATEGORY_LABELS[p.category] || p.category || "—"),
                            h("td", { className: "whitespace-nowrap px-3 py-2 font-medium tabular-nums" }, formatGhc(p.price)),
                            h("td", { className: "whitespace-nowrap px-3 py-2" }, Number(p.stock) > 0 ? "In stock" : "Out of stock"),
                            h("td", { className: "px-3 py-2" }, h(Badge, { tone: listingStatusTone(p.status) }, formatListingStatus(p.status))),
                            h("td", { className: "whitespace-nowrap px-3 py-2 text-[10px] text-slate-500" }, fmtDateTable(p.createdAt)),
                            h("td", { className: "px-3 py-2" }, h("div", { className: "flex flex-nowrap items-center gap-0.5" }, [
                              h(
                                "button",
                                {
                                  key: "vw",
                                  type: "button",
                                  onClick: () => setViewProduct(p),
                                  className:
                                    "tap-target rounded-lg border border-slate-300/70 bg-white/50 p-1 text-slate-700 hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10",
                                  title: "View"
                                },
                                h(Eye, { className: "h-3 w-3" })
                              ),
                              h(
                                "button",
                                {
                                  key: "ed",
                                  type: "button",
                                  onClick: () => openEditListing(p),
                                  className:
                                    "tap-target rounded-lg border border-slate-300/70 bg-white/50 p-1 text-slate-700 hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10",
                                  title: "Edit"
                                },
                                h(Edit3, { className: "h-3 w-3" })
                              ),
                              h(
                                "button",
                                {
                                  key: "fl",
                                  type: "button",
                                  onClick: () => toggleFlagListing(p),
                                  className: `tap-target rounded-lg border p-1 ${
                                    p.flagged
                                      ? "border-amber-400/50 bg-amber-500/15 text-amber-700 dark:text-amber-200"
                                      : "border-slate-300/70 bg-white/50 text-slate-700 hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                                  }`,
                                  title: p.flagged ? "Unflag" : "Flag"
                                },
                                h(Flag, { className: "h-3 w-3" })
                              ),
                              p.status !== "active"
                                ? h(
                                    "button",
                                    {
                                      key: "ap",
                                      type: "button",
                                      onClick: () => approveListing(p.id),
                                      className:
                                        "tap-target rounded-lg border border-emerald-300/50 bg-emerald-500/10 p-1 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-200",
                                      title: "Approve"
                                    },
                                    h(Check, { className: "h-3 w-3" })
                                  )
                                : null,
                              p.status !== "rejected"
                                ? h(
                                    "button",
                                    {
                                      key: "rj",
                                      type: "button",
                                      onClick: () => openReject(p),
                                      className:
                                        "tap-target rounded-lg border border-rose-300/50 bg-rose-500/10 p-1 text-rose-700 hover:bg-rose-500/15 dark:text-rose-200",
                                      title: "Reject"
                                    },
                                    h(XCircle, { className: "h-3 w-3" })
                                  )
                                : null,
                              isSuperAdmin
                                ? h(
                                    "button",
                                    {
                                      key: "dl",
                                      type: "button",
                                      onClick: () => deleteListing(p),
                                      className:
                                        "tap-target rounded-lg border border-rose-300/50 bg-rose-500/10 p-1 text-rose-700 hover:bg-rose-500/15 dark:text-rose-200",
                                      title: "Delete (super admin only)"
                                    },
                                    h(Trash2, { className: "h-3 w-3" })
                                  )
                                : null
                            ]))
                          ]
                        )
                      )
                )
              ]
            )
          ),
      h(Pager, { key: "p", page: listingsPage, total: listingsTotal, limit: listingsLimit, onPage: setListingsPage })
    ]);
  };

  /* ---------------- Orders ---------------- */

  const renderOrders = () => {
    return h("div", { className: "space-y-4" }, [
      h(
        "div",
        { key: "bar", className: "flex flex-wrap items-center justify-between gap-3" },
        [
          h(TabBar, { key: "t", tabs: ORDER_TABS, value: ordersTab, onChange: setOrdersTab }),
          h(
            "form",
            {
              key: "f",
              className: "flex items-center gap-2 sm:w-80",
              onSubmit: (e) => {
                e.preventDefault();
                setOrdersSearch(ordersSearchInput.trim());
              }
            },
            [
              h(SearchBox, {
                key: "s",
                value: ordersSearchInput,
                onChange: setOrdersSearchInput,
                placeholder: "Search order ID, items…",
                className: "flex-1"
              }),
              h("button", {
                key: "go",
                type: "submit",
                className:
                  "rounded-2xl border border-slate-300/70 bg-white/50 px-3 py-2 text-sm font-medium hover:bg-white/70 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
              }, "Filter")
            ]
          )
        ]
      ),
      h(
        GlassCard,
        { key: "tbl", className: "!overflow-x-auto !p-0" },
        h("table", { className: "w-full min-w-[900px] text-left text-sm" }, [
          h(
            "thead",
            { className: "bg-slate-100/95 text-xs font-semibold uppercase text-slate-700 dark:bg-white/5 dark:text-slate-400" },
            h("tr", null, [
              h("th", { className: "px-4 py-3" }, "Order"),
              h("th", { className: "px-4 py-3" }, "Buyer"),
              h("th", { className: "px-4 py-3" }, "Items"),
              h("th", { className: "px-4 py-3" }, "Total"),
              h("th", { className: "px-4 py-3" }, "Platform fee"),
              h("th", { className: "px-4 py-3" }, "Status"),
              h("th", { className: "px-4 py-3" }, "Date"),
              h("th", { className: "px-4 py-3" }, "Actions")
            ])
          ),
          h(
            "tbody",
            { className: "divide-y divide-slate-200/90 dark:divide-white/10" },
            orders.length === 0
              ? h("tr", { key: "e" }, h("td", { colSpan: 8, className: "px-4 py-12 text-center text-sm text-slate-500" }, "No orders match."))
              : orders.map((o) =>
                  h(
                    "tr",
                    { key: o.id, className: "hover:bg-white/5" },
                    [
                      h("td", { className: "px-4 py-3 font-mono text-xs" }, shortId(o.id)),
                      h(
                        "td",
                        { className: "px-4 py-3 text-slate-700 dark:text-slate-200" },
                        o.buyerContact ? (o.buyerContact.displayName || o.buyerContact.email || "—") : "—"
                      ),
                      h(
                        "td",
                        { className: "px-4 py-3 text-slate-500" },
                        Array.isArray(o.items) ? `${o.items.length} item${o.items.length === 1 ? "" : "s"}` : "—"
                      ),
                      h(
                        "td",
                        { className: "px-4 py-3 font-semibold" },
                        o.total != null ? formatGhc(o.total) : "—"
                      ),
                      h(
                        "td",
                        { className: "px-4 py-3 font-medium text-slate-800 dark:text-slate-100" },
                        o.platformFeeTotal != null ? formatGhc(o.platformFeeTotal) : "—"
                      ),
                      h(
                        "td",
                        { className: "px-4 py-3" },
                        h("div", { className: "flex flex-wrap items-center gap-1" }, [
                          h(Badge, { key: "s", tone: adminOrderFulfillmentBadgeTone(o) }, formatOrderFulfillmentLabel(o)),
                          o.disputeOpen ? h(Badge, { key: "d", tone: "warn" }, "Dispute") : null,
                          o.refundStatus && o.refundStatus !== "none" && o.refundStatus !== "refunded"
                            ? h(
                                Badge,
                                {
                                  key: "r",
                                  tone: refundBadgeTone(o)
                                },
                                humanizeRefundStatus(o.refundStatus, o.paystackRefundRemoteStatus)
                              )
                            : null
                        ].filter(Boolean))
                      ),
                      h("td", { className: "px-4 py-3 text-xs text-slate-500" }, fmtDate(o.createdAt)),
                      h(
                        "td",
                        { className: "px-4 py-3" },
                        h("div", { className: "flex flex-wrap items-center gap-1" }, [
                          o.status === "pending_payment" || o.status === "awaiting_vendor_payment"
                            ? h(
                                "button",
                                {
                                  key: "mp",
                                  type: "button",
                                  onClick: () => markOrderPaymentReceived(o),
                                  className:
                                    "rounded-xl border border-emerald-300/50 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-500/15 dark:text-emerald-200"
                                },
                                "Mark paid"
                              )
                            : null,
                          o.paymentMethod === "paystack" &&
                          o.status !== "cancelled" &&
                          o.refundStatus !== "refunded"
                            ? h(
                                "button",
                                {
                                  key: "rf",
                                  type: "button",
                                  onClick: () => quickRefund(o),
                                  className:
                                    "rounded-xl border border-sky-300/50 bg-sky-500/10 px-2.5 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-500/15 dark:text-sky-200"
                                },
                                o.refundStatus === "refund_processing" ? "Paystack refund…" : "Refund buyer"
                              )
                            : null,
                          o.status === "cancelled" && isSuperAdmin
                            ? h(
                                "button",
                                {
                                  key: "del",
                                  type: "button",
                                  title: "Delete cancelled order (super admin only)",
                                  onClick: () => deleteOrderRow(o),
                                  className:
                                    "inline-flex items-center gap-1 rounded-xl border border-rose-300/50 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-500/15 dark:border-rose-400/40 dark:text-rose-200"
                                },
                                [h(Trash2, { key: "i", className: "h-3.5 w-3.5" }), "Delete"]
                              )
                            : null
                        ].filter(Boolean))
                      )
                    ]
                  )
                )
          )
        ])
      ),
      h(Pager, { key: "p", page: ordersPage, total: ordersTotal, limit: ordersLimit, onPage: setOrdersPage })
    ]);
  };

  /* ---------------- Payments ---------------- */

  const renderPayments = () => {
    const revTotal = revenue?.totals?.platformFee || 0;
    const revGross = revenue?.totals?.gross || 0;
    const paidOrdersById = new Map();
    for (const o of paidOrders) paidOrdersById.set(o.id, o);
    const paidCount = [...paidOrdersById.values()].filter((o) => o.refundStatus !== "refunded").length;
    const refundPending = refundOrders.filter(
      (o) => o.refundStatus === "requested" || o.refundStatus === "refund_processing"
    ).length;
    return h("div", { className: "space-y-4" }, [
      h("div", { key: "stats", className: "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" }, [
        h(StatCard, {
          key: "rev",
          label: "Total revenue",
          value: formatGhc(revTotal),
          hint: `${revenue?.totals?.commissionPercent ?? 5}% of gross · excludes fully refunded`,
          icon: DollarSign,
          tone: "success"
        }),
        h(StatCard, {
          key: "gross",
          label: "Gross volume",
          value: formatGhc(revGross),
          hint: `Last ${revenue?.days || 30} days · excludes fully refunded`,
          icon: TrendingUp,
          tone: "info"
        }),
        h(StatCard, {
          key: "paid",
          label: "Paid orders",
          value: String(paidCount),
          hint: "Paid + delivered, excluding fully refunded",
          icon: Wallet,
          tone: "info"
        }),
        h(StatCard, {
          key: "rf",
          label: "Pending refunds",
          value: String(refundPending),
          hint:
            refundPending > 0
              ? "Refund requested or Paystack still processing — buyer has not been fully reimbursed until status is Refunded"
              : "No open refund queue items",
          icon: RefreshCcw,
          tone: refundPending > 0 ? "warn" : "info"
        })
      ]),
      h("div", { key: "bar", className: "flex flex-wrap items-center justify-between gap-3" }, [
        h(TabBar, { key: "t", tabs: PAYMENT_TABS, value: paymentsTab, onChange: setPaymentsTab }),
        h("div", { key: "rr", className: "flex items-center gap-2 text-sm" }, [
          h("span", { className: "text-slate-500" }, "Chart range:"),
          h(SelectInput, {
            value: String(revDays),
            onChange: (e) => setRevDays(Number(e.target.value)),
            className: "!min-h-[36px] !w-auto !px-3 !py-1.5 !text-xs"
          }, [
            h("option", { key: "7", value: "7" }, "7 days"),
            h("option", { key: "30", value: "30" }, "30 days"),
            h("option", { key: "90", value: "90" }, "90 days")
          ])
        ])
      ]),
      paymentsTab === "transactions"
        ? h(
            GlassCard,
            { key: "tx", className: "!overflow-x-auto !p-0" },
            h("table", { className: "w-full min-w-[820px] text-left text-sm" }, [
              h(
                "thead",
                { className: "bg-slate-100/95 text-xs font-semibold uppercase text-slate-700 dark:bg-white/5 dark:text-slate-400" },
                h("tr", null, [
                  h("th", { className: "px-4 py-3" }, "Transaction"),
                  h("th", { className: "px-4 py-3" }, "Type"),
                  h("th", { className: "px-4 py-3" }, "Customer"),
                  h("th", { className: "px-4 py-3" }, "Amount"),
                  h("th", { className: "px-4 py-3" }, "Platform fee"),
                  h("th", { className: "px-4 py-3" }, "Status"),
                  h("th", { className: "px-4 py-3" }, "Refund"),
                  h("th", { className: "px-4 py-3" }, "Date")
                ])
              ),
              h(
                "tbody",
                { className: "divide-y divide-slate-200/90 dark:divide-white/10" },
                paidOrders.length === 0
                  ? h("tr", { key: "e" }, h("td", { colSpan: 8, className: "px-4 py-12 text-center text-sm text-slate-500" }, "No transactions yet."))
                  : paidOrders.map((o) =>
                      h(
                        "tr",
                        { key: o.id, className: "hover:bg-white/5" },
                        [
                          h("td", { className: "px-4 py-3 font-mono text-xs" }, shortId(o.id)),
                          h("td", { className: "px-4 py-3" }, h(Badge, { tone: "info" }, "Order payment")),
                          h(
                            "td",
                            { className: "px-4 py-3 text-slate-700 dark:text-slate-200" },
                            o.buyerContact ? (o.buyerContact.displayName || o.buyerContact.email || "—") : "—"
                          ),
                          h("td", { className: "px-4 py-3 font-semibold" }, o.total != null ? formatGhc(o.total) : "—"),
                          h("td", { className: "px-4 py-3 text-slate-500" }, o.platformFeeTotal != null ? formatGhc(o.platformFeeTotal) : "—"),
                          h("td", { className: "px-4 py-3" }, h(Badge, { tone: adminOrderFulfillmentBadgeTone(o) }, formatOrderFulfillmentLabel(o))),
                          h("td", { className: "px-4 py-3" }, h("div", { className: "flex flex-wrap items-center gap-1" }, [
                            o.refundStatus && o.refundStatus !== "none"
                              ? h(Badge, { key: "rs", tone: refundBadgeTone(o) }, humanizeRefundStatus(o.refundStatus, o.paystackRefundRemoteStatus))
                              : h("span", { key: "na", className: "text-xs text-slate-500" }, "—")
                          ])),
                          h("td", { className: "px-4 py-3 text-xs text-slate-500" }, fmtDate(o.createdAt))
                        ]
                      )
                    )
              )
            ])
          )
        : paymentsTab === "payouts"
          ? h(
              GlassCard,
              { key: "po", className: "!overflow-x-auto !p-0" },
              h("table", { className: "w-full min-w-[640px] text-left text-sm" }, [
                h(
                  "thead",
                  { className: "bg-slate-100/95 text-xs font-semibold uppercase text-slate-700 dark:bg-white/5 dark:text-slate-400" },
                  h("tr", null, [
                    h("th", { className: "px-4 py-3" }, "Seller"),
                    h("th", { className: "px-4 py-3" }, "Email"),
                    h("th", { className: "px-4 py-3" }, "Line items"),
                    h("th", { className: "px-4 py-3" }, "Proceeds (paid)"),
                    h("th", { className: "px-4 py-3" }, "Actions")
                  ])
                ),
                h(
                  "tbody",
                  { className: "divide-y divide-slate-200/90 dark:divide-white/10" },
                  balances.length === 0
                    ? h("tr", { key: "e" }, h("td", { colSpan: 5, className: "px-4 py-12 text-center text-sm text-slate-500" }, "No seller balances yet."))
                    : balances.map((s) =>
                        h(
                          "tr",
                          { key: s.id, className: "hover:bg-white/5" },
                          [
                            h("td", { className: "px-4 py-3" }, h("div", { className: "flex items-center gap-2" }, [
                              h(Avatar, { key: "a", user: s, size: 32 }),
                              h("span", { key: "n", className: "font-medium text-slate-900 dark:text-white" }, s.displayName || "—")
                            ])),
                            h("td", { className: "px-4 py-3 text-slate-600 dark:text-slate-300" }, s.email || "—"),
                            h("td", { className: "px-4 py-3" }, String(s.lineCount || 0)),
                            h("td", { className: "px-4 py-3 font-semibold" }, formatGhc(s.sellerProceedsTotal || 0)),
                            h("td", { className: "px-4 py-3" }, h(
                              "button",
                              {
                                type: "button",
                                onClick: () => copyToClipboard(s.email || ""),
                                className:
                                  "inline-flex items-center gap-1 rounded-xl border border-slate-300/70 bg-white/50 px-2.5 py-1.5 text-xs font-medium hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                              },
                              [h(ClipboardCopy, { key: "i", className: "h-3.5 w-3.5" }), "Copy email"]
                            ))
                          ]
                        )
                      )
                )
              ])
            )
          : h(
              GlassCard,
              { key: "rf", className: "!overflow-x-auto !p-0" },
              h("table", { className: "w-full min-w-[760px] text-left text-sm" }, [
                h(
                  "thead",
                  { className: "bg-slate-100/95 text-xs font-semibold uppercase text-slate-700 dark:bg-white/5 dark:text-slate-400" },
                  h("tr", null, [
                    h("th", { className: "px-4 py-3" }, "Order"),
                    h("th", { className: "px-4 py-3" }, "Buyer"),
                    h("th", { className: "px-4 py-3" }, "Amount"),
                    h("th", { className: "px-4 py-3" }, "Refund status"),
                    h("th", { className: "px-4 py-3" }, "Date"),
                    h("th", { className: "px-4 py-3" }, "Actions")
                  ])
                ),
                h(
                  "tbody",
                  { className: "divide-y divide-slate-200/90 dark:divide-white/10" },
                  refundOrders.length === 0
                    ? h("tr", { key: "e" }, h("td", { colSpan: 6, className: "px-4 py-12 text-center text-sm text-slate-500" }, "No refunds."))
                    : refundOrders.map((o) =>
                        h(
                          "tr",
                          { key: o.id, className: "hover:bg-white/5" },
                          [
                            h("td", { className: "px-4 py-3 font-mono text-xs" }, shortId(o.id)),
                            h(
                              "td",
                              { className: "px-4 py-3 text-slate-700 dark:text-slate-200" },
                              o.buyerContact ? (o.buyerContact.displayName || o.buyerContact.email || "—") : "—"
                            ),
                            h("td", { className: "px-4 py-3 font-semibold" }, o.total != null ? formatGhc(o.total) : "—"),
                            h("td", { className: "px-4 py-3" }, h(Badge, { tone: refundBadgeTone(o) }, humanizeRefundStatus(o.refundStatus || "none", o.paystackRefundRemoteStatus))),
                            h("td", { className: "px-4 py-3 text-xs text-slate-500" }, fmtDate(o.createdAt)),
                            h("td", { className: "px-4 py-3" }, (() => {
                              const refundBtn =
                                o.paymentMethod === "paystack" && o.refundStatus !== "refunded"
                                  ? h(
                                      "button",
                                      {
                                        key: "rf",
                                        type: "button",
                                        onClick: () => quickRefund(o),
                                        className:
                                          "rounded-xl border border-sky-300/50 bg-sky-500/10 px-2.5 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-500/15 dark:text-sky-200"
                                      },
                                      o.refundStatus === "refund_processing" ? "Refresh Paystack" : "Refund buyer"
                                    )
                                  : null;
                              return refundBtn
                                ? h("div", { className: "flex items-center gap-1" }, refundBtn)
                                : h("span", { className: "text-xs text-slate-400" }, "—");
                            })())
                          ]
                        )
                      )
                )
              ])
            ),
      paymentsTab !== "refunds" && revenue && (revenue.series?.length || 0) > 0
        ? h(GlassPanel, { key: "chart" }, [
            h("p", { key: "t", className: "mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, "Platform fees over time"),
            h(RevenueLineChart, { series: revenue.series })
          ])
        : null
    ].filter(Boolean));
  };

  /* ---------------- Reports ---------------- */

  /** Tiny avatar pill used in reports tables and side panel. Falls back to colored initials. */
  const renderUserAvatar = (u, { size = "sm" } = {}) => {
    const cls = size === "lg" ? "h-10 w-10 text-xs" : "h-8 w-8 text-[10px]";
    if (u && u.avatarUrl) {
      return h("img", {
        src: buildUrl(u.avatarUrl),
        alt: "",
        className: `${cls} shrink-0 rounded-full border border-white/20 object-cover`
      });
    }
    const initials = userInitials({ displayName: u?.name, email: u?.email });
    return h(
      "span",
      {
        className: `${cls} shrink-0 inline-flex items-center justify-center rounded-full bg-gradient-to-br from-purple-500/80 to-sky-500/80 font-semibold text-white`
      },
      initials
    );
  };

  const renderReporterCell = (r) => {
    const u = r.reporter;
    const role = (u?.role || "buyer").toLowerCase();
    const isVendor = role === "seller" || role === "admin";
    return h("div", { className: "flex items-center gap-2" }, [
      renderUserAvatar(u),
      h("div", { className: "min-w-0" }, [
        h(
          "p",
          { className: "truncate text-sm font-medium text-slate-800 dark:text-slate-100" },
          u?.name || r.reporterLabel || "—"
        ),
        h(
          "p",
          { className: `text-[11px] font-medium ${isVendor ? "text-purple-600 dark:text-purple-300" : "text-sky-600 dark:text-sky-300"}` },
          isVendor ? (role === "admin" ? "Admin" : "Vendor") : "Buyer"
        )
      ])
    ]);
  };

  const renderReportedUserCell = (r) => {
    let target = null;
    let role = "buyer";
    if (r.targetUser) {
      target = r.targetUser;
      role = (r.targetUser.role || "buyer").toLowerCase();
    } else if (r.productSeller) {
      target = r.productSeller;
      role = "seller";
    } else if (r.orderBuyer) {
      target = r.orderBuyer;
      role = (r.orderBuyer.role || "buyer").toLowerCase();
    }
    if (!target) {
      return h("div", { className: "text-xs text-slate-500" }, [
        h("div", { key: "t", className: "capitalize" }, r.targetType),
        r.targetId
          ? h("div", { key: "i", className: "font-mono text-[10px]" }, r.targetId.slice(-8))
          : null
      ].filter(Boolean));
    }
    const isVendor = role === "seller" || role === "admin";
    const label = target.businessName || target.name;
    return h("div", { className: "flex items-center gap-2" }, [
      renderUserAvatar(target),
      h("div", { className: "min-w-0" }, [
        h(
          "p",
          { className: "truncate text-sm font-medium text-slate-800 dark:text-slate-100" },
          label
        ),
        h(
          "p",
          { className: `text-[11px] font-medium ${isVendor ? "text-purple-600 dark:text-purple-300" : "text-sky-600 dark:text-sky-300"}` },
          isVendor ? (role === "admin" ? "Admin" : "Vendor") : "Buyer"
        )
      ])
    ]);
  };

  const reportTabsWithCounts = REPORT_TABS.map((t) => ({
    ...t,
    label: `${t.label}${reportsCounts[t.countKey] ? ` ${reportsCounts[t.countKey]}` : ""}`
  }));

  const renderReports = () => {
    return h("div", { className: "space-y-4" }, [
      h("div", { key: "stats", className: "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" }, [
        h(StatCard, {
          key: "tot",
          label: "Total Reports",
          value: reportsCounts.all || 0,
          hint: "All time",
          icon: FileText,
          tone: "info"
        }),
        h(StatCard, {
          key: "pen",
          label: "Pending",
          value: reportsCounts.open || 0,
          hint: "Needs attention",
          icon: Clock,
          tone: "warn"
        }),
        h(StatCard, {
          key: "rev",
          label: "Reviewing",
          value: reportsCounts.in_review || 0,
          hint: "In progress",
          icon: Eye,
          tone: "info"
        }),
        h(StatCard, {
          key: "res",
          label: "Resolved",
          value: reportsCounts.resolved || 0,
          hint: "This month",
          icon: CheckCircle2,
          tone: "success"
        })
      ]),
      h("div", { key: "bar", className: "flex flex-wrap items-center justify-between gap-3" }, [
        h(TabBar, { key: "t", tabs: reportTabsWithCounts, value: reportsTab, onChange: setReportsTab }),
        h(
          "form",
          {
            key: "f",
            className: "flex flex-wrap items-center gap-2 sm:w-auto",
            onSubmit: (e) => {
              e.preventDefault();
              setReportsSearch(reportsSearchInput.trim());
            }
          },
          [
            h(SearchBox, {
              key: "s",
              value: reportsSearchInput,
              onChange: setReportsSearchInput,
              placeholder: "Search reports by ID, user, order…",
              className: "min-w-[14rem] flex-1"
            }),
            h(
              "select",
              {
                key: "pri",
                value: reportsPriority,
                onChange: (e) => setReportsPriority(e.target.value),
                className:
                  "rounded-2xl border border-slate-300/70 bg-white/60 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white/80 focus:border-sky-400 focus:outline-none dark:border-white/10 dark:bg-night-900/60 dark:text-slate-200"
              },
              REPORT_PRIORITY_OPTS.map((o) => h("option", { key: o.id, value: o.id }, o.label))
            ),
            h(
              "button",
              {
                key: "go",
                type: "submit",
                className:
                  "rounded-2xl border border-slate-300/70 bg-white/50 px-3 py-2 text-sm font-medium hover:bg-white/70 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
              },
              "Apply"
            )
          ]
        )
      ]),
      h(
        GlassCard,
        { key: "tbl", className: "!overflow-x-auto !p-0" },
        h("table", { className: "w-full min-w-[1100px] text-left text-sm" }, [
          h(
            "thead",
            { className: "bg-slate-100/95 text-xs font-semibold uppercase text-slate-700 dark:bg-white/5 dark:text-slate-400" },
            h("tr", null, [
              h("th", { className: "px-4 py-3" }, "Report ID"),
              h("th", { className: "px-4 py-3" }, "Type"),
              h("th", { className: "px-4 py-3" }, "Reporter"),
              h("th", { className: "px-4 py-3" }, "Reported User"),
              h("th", { className: "px-4 py-3" }, "Order ID"),
              h("th", { className: "px-4 py-3" }, "Date"),
              h("th", { className: "px-4 py-3" }, "Status"),
              h("th", { className: "px-4 py-3" }, "Priority"),
              h("th", { className: "w-10 px-4 py-3", "aria-label": "Open" })
            ])
          ),
          h(
            "tbody",
            { className: "divide-y divide-slate-200/90 dark:divide-white/10" },
            reports.length === 0
              ? h(
                  "tr",
                  { key: "e" },
                  h(
                    "td",
                    { colSpan: 9, className: "px-4 py-12 text-center text-sm text-slate-500" },
                    "No reports match."
                  )
                )
              : reports.map((r) => {
                  const isSelected = viewReport && viewReport.id === r.id;
                  return h(
                    "tr",
                    {
                      key: r.id,
                      className: `cursor-pointer align-top hover:bg-white/5 ${
                        isSelected ? "bg-sky-500/5" : ""
                      }`,
                      onClick: () => {
                        setViewReport(r);
                        setReportNote(r.adminNote || "");
                      }
                    },
                    [
                      h(
                        "td",
                        { className: "px-4 py-3 font-mono text-xs font-semibold text-purple-700 dark:text-purple-300" },
                        shortId(r.id)
                      ),
                      h(
                        "td",
                        { className: "px-4 py-3 text-slate-700 dark:text-slate-200" },
                        REPORT_CATS[r.category] || r.category
                      ),
                      h("td", { className: "px-4 py-3" }, renderReporterCell(r)),
                      h("td", { className: "px-4 py-3" }, renderReportedUserCell(r)),
                      h(
                        "td",
                        { className: "px-4 py-3 font-mono text-xs text-slate-500" },
                        r.order ? shortId(r.order.id) : r.targetType === "order" && r.targetId ? shortId(r.targetId) : "—"
                      ),
                      h(
                        "td",
                        { className: "px-4 py-3 text-xs text-slate-500" },
                        h("div", null, [
                          h("p", { key: "d" }, fmtDate(r.createdAt)),
                          h(
                            "p",
                            { key: "t", className: "text-[10px] text-slate-400" },
                            (() => {
                              try {
                                return new Date(r.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
                              } catch {
                                return "";
                              }
                            })()
                          )
                        ])
                      ),
                      h(
                        "td",
                        { className: "px-4 py-3" },
                        h(Badge, { tone: reportStatusTone(r.status) }, reportStatusLabel(r.status))
                      ),
                      h(
                        "td",
                        { className: "px-4 py-3" },
                        h(
                          Badge,
                          { tone: reportPriorityTone(r.priority || "medium") },
                          (r.priority || "medium").charAt(0).toUpperCase() + (r.priority || "medium").slice(1)
                        )
                      ),
                      h(
                        "td",
                        { className: "px-4 py-3 text-right" },
                        h(ChevronRight, { className: "h-4 w-4 text-slate-400" })
                      )
                    ]
                  );
                })
          )
        ])
      ),
      h(Pager, { key: "p", page: reportsPage, total: reportsTotal, limit: reportsLimit, onPage: setReportsPage })
    ]);
  };

  /* ---------------- Messages ---------------- */

  const renderMessages = () => {
    const listSelected = (id) => String(selectedThreadId) === String(id) && !composeTargetUser;
    return h("div", { className: "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]" }, [
      h(
        GlassCard,
        { key: "list", className: "!p-0" },
        [
          h("div", { key: "find", className: "space-y-2 border-b border-white/10 px-4 py-3 dark:border-white/5" }, [
            h("h2", { className: "text-sm font-semibold text-slate-900 dark:text-white" }, "Message any user"),
            h("p", { className: "text-xs text-slate-500 dark:text-slate-400" }, "Search by name or email to open a SHOPIQGH Support thread with that account."),
            h(TextInput, {
              value: msgUserSearch,
              onChange: (e) => setMsgUserSearch(e.target.value),
              placeholder: "Type at least 2 characters…",
              className: "!text-sm"
            }),
            msgUserHits.length > 0
              ? h(
                  "div",
                  { key: "hits", className: "max-h-40 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-white/20 p-1 dark:bg-night-900/40" },
                  msgUserHits.map((u) =>
                    h(
                      "button",
                      {
                        key: u.id,
                        type: "button",
                        onClick: () => openUserMessageThread(u),
                        className:
                          "flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm transition hover:bg-sky-500/15 dark:hover:bg-sky-500/10"
                      },
                      [
                        h(
                          "span",
                          { className: "font-medium text-slate-900 dark:text-white" },
                          (u.displayName || "").trim() || u.email || u.id
                        ),
                        h("span", { className: "text-xs text-slate-500" }, `${u.role || "buyer"} · ${u.email || "—"}`)
                      ]
                    )
                  )
                )
              : null
          ]),
          h(
            "div",
            { key: "h", className: "border-b border-white/10 px-4 py-3 dark:border-white/5" },
            h("h2", { className: "font-semibold text-slate-900 dark:text-white" }, "Conversations")
          ),
          h(
            "div",
            { key: "b", className: "max-h-[48vh] divide-y divide-white/5 overflow-y-auto" },
            conversations.length === 0
              ? h("p", { className: "p-6 text-center text-sm text-slate-500" }, "No threads yet. Use search above to message a user, or wait until buyers/sellers chat.")
              : conversations.map((c) =>
                  h(
                    "button",
                    {
                      key: c.id,
                      type: "button",
                      onClick: () => {
                        setComposeTargetUser(null);
                        setSelectedThreadId(c.id);
                      },
                      className: `flex w-full flex-col gap-1 px-4 py-3 text-left transition hover:bg-white/10 ${
                        listSelected(c.id) ? "bg-sky-500/10" : ""
                      }`
                    },
                    [
                      h(
                        "div",
                        { className: "flex flex-wrap items-center justify-between gap-2" },
                        [
                          h(
                            "span",
                            { className: "truncate font-medium text-slate-900 dark:text-white" },
                            c.kind === "support"
                              ? `Support · ${c.buyerLabel}`
                              : `${c.buyerLabel} ↔ ${c.sellerLabel}`
                          ),
                          h("div", { className: "flex shrink-0 items-center gap-1" }, [
                            c.kind === "support"
                              ? h(Badge, { key: "k", tone: "success" }, "Support")
                              : h(Badge, { key: "o", tone: "neutral" }, "Order"),
                            h(Badge, { key: "n", tone: "info" }, String(c.messageCount))
                          ])
                        ]
                      ),
                      h(
                        "span",
                        { className: "truncate text-xs text-slate-500" },
                        c.lastMessage ? c.lastMessage.text : "—"
                      ),
                      h(
                        "span",
                        { className: "text-[10px] text-slate-400" },
                        c.lastMessage ? fmtDateTime(c.lastMessage.createdAt) : fmtDate(c.updatedAt)
                      )
                    ]
                  )
                )
          ),
          h(Pager, {
            key: "p",
            page: conversationsPage,
            total: conversationsTotal,
            limit: conversationsLimit,
            onPage: setConversationsPage,
            className: "!px-4 !py-3"
          })
        ]
      ),
      h(
        GlassPanel,
        { key: "d" },
        !threadDetail
          ? h(EmptyState, {
              title: "Select or start a chat",
              hint: "Search for a user on the left, or pick an existing thread.",
              icon: MessageSquare
            })
          : h("div", { className: "space-y-3" }, [
              h(
                "div",
                { key: "h", className: "flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2 dark:border-white/5" },
                [
                  h(
                    "p",
                    { className: "font-semibold text-slate-900 dark:text-white" },
                    threadDetail.kind === "support"
                      ? `Support · ${threadDetail.buyerLabel}`
                      : `${threadDetail.buyerLabel} ↔ ${threadDetail.sellerLabel}`
                  ),
                  threadDetail.kind === "support"
                    ? h(Badge, { tone: "success" }, "Support")
                    : h(Badge, { tone: "neutral" }, "Buyer ↔ seller · moderation")
                ]
              ),
              threadDetail.kind === "order"
                ? h(
                    "p",
                    { key: "ro", className: "text-xs text-slate-500 dark:text-slate-400" },
                    "This is an order thread between a buyer and a seller. You can read it for moderation; messaging is not available here."
                  )
                : null,
              h(
                "div",
                { key: "m", className: "max-h-[48vh] space-y-2 overflow-y-auto pr-1" },
                (threadDetail.messages || []).map((m, i) =>
                  h(
                    "div",
                    {
                      key: i,
                      className: `rounded-2xl border border-white/10 p-3 text-sm ${
                        m.senderRole === "buyer"
                          ? "ml-0 mr-8 bg-sky-500/10"
                          : m.senderRole === "admin"
                            ? "ml-8 mr-0 bg-violet-500/10"
                            : m.senderRole === "seller"
                              ? "ml-8 mr-0 bg-fuchsia-500/10"
                              : "bg-white/10"
                      }`
                    },
                    [
                      h(
                        "p",
                        { className: "text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" },
                        `${m.senderLabel || m.senderRole} · ${fmtDateTime(m.createdAt)}`
                      ),
                      h("p", { className: "mt-1 whitespace-pre-wrap text-slate-800 dark:text-slate-100" }, m.text)
                    ]
                  )
                )
              ),
              threadDetail.kind === "support"
                ? h("div", { key: "reply", className: "space-y-2 border-t border-white/10 pt-3 dark:border-white/5" }, [
                    h(TextArea, {
                      value: adminSupportDraft,
                      onChange: (e) => setAdminSupportDraft(e.target.value),
                      rows: 3,
                      placeholder: "Write a support message…",
                      className: "!text-sm"
                    }),
                    h(
                      Button,
                      {
                        type: "button",
                        disabled: adminMsgSending || !adminSupportDraft.trim(),
                        onClick: () => void sendAdminSupportReply()
                      },
                      adminMsgSending ? "Sending…" : "Send"
                    )
                  ])
                : null
            ])
      )
    ]);
  };

  /* ---------------- Settings ---------------- */

  const renderSettings = () => {
    return h("div", { className: "grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]" }, [
      h(
        GlassCard,
        { key: "nav", className: "!p-2" },
        h(
          "nav",
          { className: "flex flex-col gap-1" },
          SETTINGS_TABS.map((t) =>
            h(
              "button",
              {
                key: t.id,
                type: "button",
                onClick: () => setSettingsSection(t.id),
                className: `rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                  settingsTab === t.id
                    ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-sky-900/30"
                    : "text-slate-700 hover:bg-white/40 dark:text-slate-200 dark:hover:bg-white/10"
                }`
              },
              t.label
            )
          )
        )
      ),
      h(GlassPanel, { key: "form" }, renderSettingsBody())
    ]);
  };

  const renderSettingsBody = () => {
    const toggleRow = (id, label, hint, checked, onChange) =>
      h(
        "label",
        {
          key: id,
          className:
            "flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/30 px-4 py-3 text-sm dark:bg-white/5"
        },
        [
          h("div", { key: "l", className: "min-w-0" }, [
            h("p", { className: "font-semibold text-slate-900 dark:text-white" }, label),
            h("p", { className: "text-xs text-slate-500" }, hint)
          ]),
          h("input", {
            key: "c",
            type: "checkbox",
            checked: !!checked,
            onChange: (e) => onChange(e.target.checked),
            className: "h-5 w-5 shrink-0"
          })
        ]
      );

    if (settingsTab === "general") {
      return h("div", { className: "space-y-4" }, [
        h("h3", { key: "t", className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, "General"),
        h(
          "p",
          { key: "intro", className: "text-sm text-slate-500 dark:text-slate-400" },
          "Branding and access control are stored in the database and exposed publicly via GET /api/platform/config (site name, maintenance, signup availability)."
        ),
        h(Field, { key: "n", label: "Site name" }, h(TextInput, {
          value: settingsForm.siteName,
          onChange: (e) => setSettingsForm((s) => ({ ...s, siteName: e.target.value }))
        })),
        h(Field, { key: "d", label: "Site description" }, h(TextArea, {
          rows: 3,
          value: settingsForm.siteDescription,
          onChange: (e) => setSettingsForm((s) => ({ ...s, siteDescription: e.target.value })),
          placeholder: "Short tagline or description for emails and future storefront use."
        })),
        h(Field, { key: "e", label: "Support / contact email (public)" }, h(TextInput, {
          type: "email",
          value: settingsForm.supportEmail,
          onChange: (e) => setSettingsForm((s) => ({ ...s, supportEmail: e.target.value })),
          placeholder: "support@yourdomain.edu"
        })),
        h("div", { key: "toggles", className: "space-y-3" }, [
          toggleRow(
            "maint",
            "Maintenance mode",
            "Blocks new account registration, vendor applications, and shopper courier applications. Existing users can still sign in.",
            settingsForm.maintenanceMode,
            (v) => setSettingsForm((s) => ({ ...s, maintenanceMode: v }))
          ),
          settingsForm.maintenanceMode
            ? h(Field, { key: "mm", label: "Maintenance message (shown in API errors + can be displayed on register/apply pages)" }, h(TextArea, {
                rows: 3,
                value: settingsForm.maintenanceMessage,
                onChange: (e) => setSettingsForm((s) => ({ ...s, maintenanceMessage: e.target.value })),
                placeholder: "We’re upgrading checkout. We’ll be back within the hour."
              }))
            : null,
          toggleRow(
            "reg",
            "Allow public registration",
            "When off, POST /api/auth/register returns 403. Use when you want invite-only or closed signup.",
            settingsForm.allowPublicRegistration,
            (v) => setSettingsForm((s) => ({ ...s, allowPublicRegistration: v }))
          ),
          toggleRow(
            "vapp",
            "Allow vendor applications",
            "When off, authenticated buyers cannot submit a new seller application until you turn this back on.",
            settingsForm.allowVendorApplications,
            (v) => setSettingsForm((s) => ({ ...s, allowVendorApplications: v }))
          ),
          toggleRow(
            "capp",
            "Allow courier applications",
            "When off, shoppers cannot apply to become delivery partners from the storefront.",
            settingsForm.allowCourierApplications,
            (v) => setSettingsForm((s) => ({ ...s, allowCourierApplications: v }))
          )
        ]),
        h("div", { key: "b", className: "pt-2" }, h(Button, { loading: savingSettings, onClick: saveSettings }, "Save general settings"))
      ]);
    }
    if (settingsTab === "vendor-billing") {
      return h("div", { className: "space-y-4" }, [
        h("h3", { key: "t", className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, "Seller subscription & launch trial"),
        h(
          "p",
          { key: "h", className: "text-sm text-slate-500 dark:text-slate-400" },
          "New sellers sell free for the trial window after deployment. When the trial ends, they pay the seller platform fee (via Paystack) to add or edit stores and listings."
        ),
        toggleRow(
          "vsb",
          "Require seller subscription after trial",
          "When off, sellers never pay a platform fee (useful for local development).",
          settingsForm.vendorSubscriptionBillingEnabled,
          (v) => setSettingsForm((s) => ({ ...s, vendorSubscriptionBillingEnabled: v }))
        ),
        h(Field, { key: "dep", label: "App deployment date (trial starts here)" }, h(TextInput, {
          type: "date",
          value: settingsForm.platformDeployedAt,
          onChange: (e) => setSettingsForm((s) => ({ ...s, platformDeployedAt: e.target.value }))
        })),
        h(Field, { key: "trial", label: "Free trial length (months after deployment)" }, h(TextInput, {
          type: "number",
          min: 0,
          max: 24,
          value: String(settingsForm.vendorTrialMonths),
          onChange: (e) => setSettingsForm((s) => ({ ...s, vendorTrialMonths: Number(e.target.value) || 0 }))
        })),
        h(Field, { key: "price", label: "Seller fee after trial (GHS)" }, h(TextInput, {
          type: "number",
          min: 0,
          step: "0.01",
          value: String(settingsForm.vendorSubscriptionPriceGhs),
          onChange: (e) => setSettingsForm((s) => ({ ...s, vendorSubscriptionPriceGhs: Number(e.target.value) || 0 }))
        })),
        h(Field, { key: "period", label: "Subscription period (months per payment)" }, h(TextInput, {
          type: "number",
          min: 1,
          max: 36,
          value: String(settingsForm.vendorSubscriptionPeriodMonths),
          onChange: (e) => setSettingsForm((s) => ({ ...s, vendorSubscriptionPeriodMonths: Number(e.target.value) || 12 }))
        })),
        h("div", { key: "b", className: "pt-2" }, h(Button, { loading: savingSettings, onClick: saveSettings }, "Save seller billing"))
      ]);
    }
    if (settingsTab === "commission") {
      return h("div", { className: "space-y-4" }, [
        h("h3", { key: "t", className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, "Platform commission"),
        h("p", { key: "h", className: "text-sm text-slate-500 dark:text-slate-400" }, "Percent deducted from each paid line item. New orders use the latest value; existing orders keep their stored fee."),
        h(Field, { key: "p", label: "Commission % (0-100)" }, h(TextInput, {
          type: "number",
          min: 0,
          max: 100,
          step: "0.01",
          value: String(settingsForm.commissionPercent),
          onChange: (e) => setSettingsForm((s) => ({ ...s, commissionPercent: Number(e.target.value) }))
        })),
        h("div", { key: "b", className: "pt-2" }, h(Button, { loading: savingSettings, onClick: saveSettings }, "Save commission"))
      ]);
    }
    if (settingsTab === "payments") {
      return h("div", { className: "space-y-4" }, [
        h("h3", { key: "t", className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, "Payment methods"),
        h("p", { key: "h", className: "text-sm text-slate-500 dark:text-slate-400" }, "Toggle which payment options are exposed at checkout."),
        h("div", { key: "l", className: "space-y-3" },
          [
            { id: "momoEnabled", label: "Mobile money / MoMo instructions", icon: Wallet, hint: "Buyer is guided to pay off-platform" },
            {
              id: "stripeEnabled",
              label: "Card checkout (Paystack)",
              icon: CreditCard,
              hint: "Buyer card tab uses Paystack when PAYSTACK_SECRET_KEY is set on the API"
            },
            { id: "bankEnabled", label: "Bank transfer / manual", icon: DollarSign, hint: "Shows bank info to the buyer" }
          ].map((opt) =>
            h(
              "label",
              {
                key: opt.id,
                className:
                  "flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/30 px-4 py-3 text-sm dark:bg-white/5"
              },
              [
                h("div", { key: "l", className: "flex items-center gap-3" }, [
                  h("div", { className: "flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-300" }, h(opt.icon, { className: "h-4 w-4" })),
                  h("div", null, [
                    h("p", { className: "font-semibold text-slate-900 dark:text-white" }, opt.label),
                    h("p", { className: "text-xs text-slate-500" }, opt.hint)
                  ])
                ]),
                h("input", {
                  key: "c",
                  type: "checkbox",
                  checked: !!settingsForm[opt.id],
                  onChange: (e) => setSettingsForm((s) => ({ ...s, [opt.id]: e.target.checked })),
                  className: "h-5 w-5"
                })
              ]
            )
          )
        ),
        h("div", { key: "b", className: "pt-2" }, h(Button, { loading: savingSettings, onClick: saveSettings }, "Save payment methods"))
      ]);
    }
    if (settingsTab === "email") {
      const transportLabel =
        emailDelivery?.transport === "brevo"
          ? "Brevo API (HTTPS — use on Render free tier)"
          : emailDelivery?.transport === "smtp"
            ? "SMTP (custom host)"
            : emailDelivery?.transport === "gmail"
              ? "Gmail / App password"
              : "Not configured (development-only dev OTP may still apply)";
      const diag = emailDelivery?.diagnostics;
      const missingVars = Array.isArray(diag?.missingVariables) ? diag.missingVariables : [];
      const diagHints = Array.isArray(diag?.hints) ? diag.hints : [];
      const fallbackFlowRows = [
        { id: "welcome", title: "Welcome email", description: "After registration when verification is required or to confirm account.", sampleHtml: "" },
        { id: "verify", title: "Email verification OTP", description: "6-digit code; set AUTH_SKIP_EMAIL_VERIFICATION=true only for local dev.", sampleHtml: "" },
        { id: "reset", title: "Password reset", description: "Token link flow from Forgot password.", sampleHtml: "" },
        { id: "order", title: "Order confirmation", description: "Buyer receipt after successful checkout.", sampleHtml: "" },
        { id: "seller", title: "Vendor order alert", description: "Notifies seller of a new paid line item (when mailer is configured).", sampleHtml: "" },
        { id: "report", title: "Report acknowledgement", description: "Confirms a user report was received.", sampleHtml: "" }
      ];
      const flowRows =
        emailTemplatePreviews.length > 0
          ? emailTemplatePreviews.map((p) => ({
              id: p.id,
              title: p.title,
              description: p.description,
              sampleHtml: p.sampleHtml || ""
            }))
          : fallbackFlowRows;
      const statusClass = (st) =>
        st === "sent"
          ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
          : st === "failed"
            ? "bg-rose-500/15 text-rose-800 dark:text-rose-200"
            : "bg-amber-500/15 text-amber-800 dark:text-amber-200";

      return h("div", { className: "space-y-4" }, [
        h("h3", { key: "t", className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, "Email & outbound delivery"),
        h(
          InlineNotice,
          { key: "n", variant: "info" },
          "Mail credentials and transactional templates are configured on the API (backend/.env). This page shows live status, a delivery log, and a composer to send a real message through your provider — for announcements, smoke tests, or ops checks."
        ),
        !emailDelivery?.configured || missingVars.length
          ? h(
              InlineNotice,
              { key: "diag", variant: "warning", size: "sm" },
              [
                h("p", { key: "d0", className: "font-semibold" }, "Outbound email is not fully configured"),
                missingVars.length
                  ? h(
                      "p",
                      { key: "d1", className: "mt-2 break-all font-mono text-[11px] text-slate-800 dark:text-slate-200" },
                      `Missing or empty environment variables: ${missingVars.join(", ")}`
                    )
                  : null,
                diagHints.length
                  ? h(
                      "ul",
                      { key: "d2", className: "mt-2 list-inside list-disc space-y-1 text-xs" },
                      diagHints.map((hint, i) => h("li", { key: i }, hint))
                    )
                  : null
              ]
            )
          : null,
        h(GlassCard, { key: "del", className: "!p-4" }, [
          h("p", { className: "text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, "Live server status"),
          h("dl", { className: "mt-3 space-y-2 text-sm" }, [
            h("div", { key: "cfg", className: "flex flex-wrap justify-between gap-2" }, [
              h("dt", { className: "text-slate-500 dark:text-slate-400" }, "Transport"),
              h("dd", { className: "font-medium text-slate-900 dark:text-white" }, transportLabel)
            ]),
            diag?.mode
              ? h("div", { key: "mode", className: "flex flex-wrap justify-between gap-2" }, [
                  h("dt", { className: "text-slate-500 dark:text-slate-400" }, "Diagnostic mode"),
                  h("dd", { className: "font-mono text-xs text-slate-800 dark:text-slate-200" }, String(diag.mode))
                ])
              : null,
            h("div", { key: "from", className: "flex flex-wrap justify-between gap-2" }, [
              h("dt", { className: "text-slate-500 dark:text-slate-400" }, "From (EMAIL_FROM)"),
              h("dd", { className: "max-w-[min(100%,20rem)] break-all font-mono text-xs text-slate-800 dark:text-slate-200" }, emailDelivery?.from || "—")
            ]),
            h("div", { key: "ok", className: "flex flex-wrap justify-between gap-2" }, [
              h("dt", { className: "text-slate-500 dark:text-slate-400" }, "Ready to send"),
              h("dd", { className: "font-medium text-slate-900 dark:text-white" }, emailDelivery?.configured ? "Yes" : "No — verify .env")
            ])
          ]),
          h("div", { key: "actions", className: "mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 dark:border-white/5" }, [
            h(
              "p",
              { className: "text-xs text-slate-600 dark:text-slate-400" },
              "Composer sends through your configured transport (super admin only). Subject and message are optional: if either is left blank, the server uses a professional verification template with your saved platform name. Message must be plain text — no HTML; blank lines form separate paragraphs."
            ),
            h(Field, { key: "to", label: "Recipient" }, h(TextInput, {
              type: "email",
              value: emailTestTo,
              onChange: (e) => setEmailTestTo(e.target.value),
              placeholder: "you@yourdomain.edu",
              disabled: !isSuperAdmin,
              autoComplete: "email"
            })),
            h(Field, { key: "sub", label: "Subject (optional)" }, h(TextInput, {
              value: emailTestSubject,
              onChange: (e) => setEmailTestSubject(e.target.value),
              placeholder: settings?.siteName
                ? `Default: ${settings.siteName} — outbound mail verification`
                : "Default: [site name] — outbound mail verification",
              disabled: !isSuperAdmin
            })),
            h(Field, { key: "body", label: "Message (optional)" }, h(TextArea, {
              rows: 5,
              autoMinHeight: false,
              value: emailTestBody,
              onChange: (e) => setEmailTestBody(e.target.value),
              className: "resize-y !py-2 !text-sm leading-snug max-h-64",
              placeholder:
                "Plain text only. Example: “We’re scheduling maintenance Sunday 2–4am.” Leave blank to send the standard verification wording instead.",
              disabled: !isSuperAdmin
            })),
            h(
              Button,
              {
                key: "send",
                type: "button",
                loading: emailTestSending,
                disabled: !isSuperAdmin,
                onClick: () => void sendTestEmail()
              },
              "Send email"
            ),
            !isSuperAdmin
              ? h("p", { key: "sup", className: "text-xs text-amber-700 dark:text-amber-300" }, "Sending from this panel requires super admin.")
              : null
          ])
        ]),
        h(GlassCard, { key: "logs", className: "!p-4" }, [
          h("div", { key: "hdr", className: "flex flex-wrap items-center justify-between gap-2" }, [
            h("p", { className: "text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, "Recent email activity"),
            h(Button, {
              key: "ref",
              type: "button",
              variant: "ghost",
              loading: emailLogsLoading,
              onClick: () => void loadEmailLogs()
            }, "Refresh")
          ]),
          h(
            "p",
            { key: "sub", className: "mt-1 text-xs text-slate-500 dark:text-slate-400" },
            "Logged sends, failures, and skipped attempts (no transport). Entries auto-expire after about 45 days."
          ),
          emailLogs.length === 0 && !emailLogsLoading
            ? h("p", { key: "empty", className: "mt-3 text-sm text-slate-500" }, "No log entries yet.")
            : h(
                "div",
                { key: "tblw", className: "mt-3 max-h-[min(24rem,50vh)] overflow-auto rounded-xl border border-white/10 dark:border-white/5" },
                h("table", { className: "w-full min-w-[36rem] border-collapse text-left text-xs" }, [
                  h(
                    "thead",
                    { className: "sticky top-0 bg-white/90 dark:bg-night-900/95" },
                    h("tr", { className: "border-b border-slate-200/80 dark:border-white/10" }, [
                      h("th", { className: "px-3 py-2 font-semibold text-slate-600 dark:text-slate-300" }, "Time"),
                      h("th", { className: "px-3 py-2 font-semibold text-slate-600 dark:text-slate-300" }, "Status"),
                      h("th", { className: "px-3 py-2 font-semibold text-slate-600 dark:text-slate-300" }, "To"),
                      h("th", { className: "px-3 py-2 font-semibold text-slate-600 dark:text-slate-300" }, "Category"),
                      h("th", { className: "px-3 py-2 font-semibold text-slate-600 dark:text-slate-300" }, "Subject"),
                      h("th", { className: "px-3 py-2 font-semibold text-slate-600 dark:text-slate-300" }, "Detail")
                    ])
                  ),
                  h(
                    "tbody",
                    null,
                    emailLogs.map((row) =>
                      h("tr", { key: row.id, className: "border-b border-slate-100/80 dark:border-white/5" }, [
                        h("td", { className: "whitespace-nowrap px-3 py-2 text-slate-600 dark:text-slate-400" }, fmtDateTime(row.createdAt)),
                        h("td", { className: "px-3 py-2" }, h("span", { className: `rounded-md px-2 py-0.5 font-medium ${statusClass(row.status)}` }, row.status)),
                        h("td", { className: "max-w-[10rem] truncate px-3 py-2 font-mono text-[11px] text-slate-800 dark:text-slate-200" }, row.to || "—"),
                        h("td", { className: "max-w-[8rem] truncate px-3 py-2 text-slate-700 dark:text-slate-300" }, row.category || "—"),
                        h("td", { className: "max-w-[12rem] truncate px-3 py-2 text-slate-700 dark:text-slate-300" }, row.subject || "—"),
                        h(
                          "td",
                          { className: "max-w-[14rem] truncate px-3 py-2 text-rose-700 dark:text-rose-300" },
                          row.errorMessage || "—"
                        )
                      ])
                    )
                  )
                ])
              ),
          emailLogsTotal > emailLogs.length
            ? h(
                "p",
                { key: "more", className: "mt-2 text-xs text-slate-500" },
                `Showing latest ${emailLogs.length} of ${emailLogsTotal} logged events.`
              )
            : null
        ]),
        h("h4", { key: "tpl-h", className: "text-sm font-bold text-slate-800 dark:text-slate-200" }, "Transactional flows"),
        h(
          "ul",
          { key: "l", className: "space-y-2 text-sm" },
          flowRows.map((t) =>
            h(
              "li",
              {
                key: t.id,
                className: "rounded-2xl border border-white/10 bg-white/30 px-4 py-3 dark:bg-white/5"
              },
              [
                h("div", { key: "row", className: "flex flex-wrap items-start justify-between gap-3" }, [
                  h("div", { key: "l", className: "min-w-0 flex-1" }, [
                    h("p", { className: "font-semibold text-slate-900 dark:text-white" }, t.title),
                    h("p", { className: "text-xs text-slate-500" }, t.description)
                  ]),
                  h("div", { key: "r", className: "flex shrink-0 flex-wrap items-center gap-2" }, [
                    t.sampleHtml
                      ? h(
                          Button,
                          {
                            type: "button",
                            variant: "ghost",
                            className: "!text-xs",
                            onClick: () => setEmailPreviewId((cur) => (cur === t.id ? null : t.id))
                          },
                          emailPreviewId === t.id ? "Hide preview" : "Preview HTML"
                        )
                      : null,
                    h("span", { className: "inline-flex shrink-0 items-center gap-1 text-xs text-slate-500" }, [
                      h(Mail, { className: "h-3.5 w-3.5" }),
                      "Server"
                    ])
                  ])
                ]),
                emailPreviewId === t.id && t.sampleHtml
                  ? h("iframe", {
                      key: "ifr",
                      title: `Preview: ${t.title}`,
                      srcDoc: t.sampleHtml,
                      sandbox: "allow-same-origin",
                      className: "mt-3 h-64 w-full rounded-xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-night-950"
                    })
                  : null
              ]
            )
          )
        )
      ]);
    }
    if (settingsTab === "rules") {
      const ruleCard = (key, icon, titleAccent, title, hint, body) =>
        h(GlassCard, { key, className: "!p-4" }, [
          h("div", { className: "mb-3 flex items-start gap-3" }, [
            h(
              "div",
              {
                className:
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-600 dark:text-sky-300"
              },
              h(icon, { className: "h-5 w-5" })
            ),
            h("div", { className: "min-w-0" }, [
              h(
                "p",
                { className: "text-[11px] font-bold uppercase tracking-wide text-sky-700 dark:text-sky-400" },
                titleAccent
              ),
              h("h4", { className: "font-display text-base font-bold text-slate-900 dark:text-white" }, title),
              hint
                ? h("p", { className: "mt-0.5 text-xs text-slate-500 dark:text-slate-400" }, hint)
                : null
            ])
          ]),
          body
        ]);

      const addKeyword = () => {
        const k = listingKeywordDraft.trim().toLowerCase();
        if (!k) return;
        setSettingsForm((s) => ({
          ...s,
          listingAutoRejectKeywords: [...new Set([...s.listingAutoRejectKeywords, k.slice(0, 64)])].slice(0, 50)
        }));
        setListingKeywordDraft("");
      };

      const modToggle = (id, label, hint, checked, onChange) =>
        h(
          "label",
          {
            key: id,
            className:
              "flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/30 px-4 py-3 text-sm dark:bg-white/5"
          },
          [
            h("div", { className: "min-w-0" }, [
              h("p", { className: "font-semibold text-slate-900 dark:text-white" }, label),
              h("p", { className: "text-xs text-slate-500" }, hint)
            ]),
            h("input", {
              type: "checkbox",
              checked: !!checked,
              onChange: (e) => onChange(e.target.checked),
              className: "h-5 w-5 shrink-0"
            })
          ]
        );

      return h("div", { className: "space-y-4" }, [
        h("div", { className: "flex flex-wrap items-start justify-between gap-3" }, [
          h("div", null, [
            h("h3", { className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, "Listing rules & policy"),
            h(
              "p",
              { className: "mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400" },
              "Reference material for reviewers plus automated checks on publish. Live listing edits always return to the approval queue."
            )
          ]),
          h("div", { className: "flex flex-wrap items-center gap-2" }, [
            h(
              Button,
              {
                type: "button",
                loading: savingSettings,
                onClick: () => void saveSettings()
              },
              "Save listing policy"
            ),
            h(
              Button,
              { type: "button", variant: "ghost", onClick: () => setListingPolicyPreviewOpen(true) },
              [h(Eye, { key: "i", className: "h-4 w-4" }), " Preview as moderator"]
            )
          ])
        ]),
        h(
          InlineNotice,
          { key: "ph", variant: "info", size: "sm" },
          "Light gray placeholder hints in the boxes are not saved. Type your real policy text, then click Save listing policy. The moderator preview shows whatever is currently in the form — including unsaved edits."
        ),
        h(
          "div",
          { className: "flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400" },
          [
            settings?.listingRulesVersion != null
              ? h("span", { key: "v" }, `Version v${settings.listingRulesVersion}`)
              : null,
            settings?.listingRulesUpdatedAt
              ? h("span", { key: "t" }, `Last updated: ${fmtDateTime(settings.listingRulesUpdatedAt)}`)
              : null,
            listingRulesLastEditor?.label
              ? h("span", { key: "e" }, `Edited by: ${listingRulesLastEditor.label}`)
              : null
          ].filter(Boolean)
        ),
        ruleCard(
          "allowed",
          CheckCircle2,
          "Reference",
          "Allowed items",
          "What sellers may list.",
          h(TextArea, {
            rows: 2,
            autoMinHeight: false,
            value: settingsForm.listingAllowedItemsNote,
            onChange: (e) => setSettingsForm((s) => ({ ...s, listingAllowedItemsNote: e.target.value })),
            className: "resize-y !py-2 !text-sm leading-snug max-h-40",
            placeholder: "Example: course materials, handmade goods, on-local services…"
          })
        ),
        ruleCard(
          "prohibited",
          Ban,
          "Reference",
          "Prohibited items",
          "Hard boundaries for reviewers.",
          h(TextArea, {
            rows: 2,
            autoMinHeight: false,
            value: settingsForm.listingProhibitedItemsNote,
            onChange: (e) => setSettingsForm((s) => ({ ...s, listingProhibitedItemsNote: e.target.value })),
            className: "resize-y !py-2 !text-sm leading-snug max-h-40",
            placeholder: "Example: weapons, illegal items, counterfeit goods…"
          })
        ),
        ruleCard(
          "guide",
          ClipboardList,
          "Reference",
          "Moderation guidelines",
          "How your team should decide.",
          h(TextArea, {
            rows: 3,
            autoMinHeight: false,
            value: settingsForm.listingModerationGuidelines,
            onChange: (e) => setSettingsForm((s) => ({ ...s, listingModerationGuidelines: e.target.value })),
            className: "resize-y !py-2 !text-sm leading-snug max-h-48",
            placeholder: "How your team should interpret edge cases, escalation, tone, etc."
          })
        ),
        ruleCard(
          "kw",
          Shield,
          "Automation",
          "Auto-rejection keywords",
          "Case-insensitive substring match in name, description, and tags when both automation toggles are on.",
          h("div", { className: "space-y-3" }, [
            h(
              "div",
              { className: "flex flex-wrap gap-2" },
              (settingsForm.listingAutoRejectKeywords || []).map((kw) =>
                h(
                  "span",
                  {
                    key: kw,
                    className:
                      "inline-flex items-center gap-1 rounded-full bg-slate-800/10 px-2.5 py-1 text-xs font-medium text-slate-800 dark:bg-white/10 dark:text-slate-200"
                  },
                  [
                    kw,
                    h(
                      "button",
                      {
                        type: "button",
                        className: "tap-target rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10",
                        onClick: () =>
                          setSettingsForm((s) => ({
                            ...s,
                            listingAutoRejectKeywords: s.listingAutoRejectKeywords.filter((x) => x !== kw)
                          })),
                        "aria-label": `Remove ${kw}`
                      },
                      h(X, { className: "h-3 w-3" })
                    )
                  ]
                )
              )
            ),
            h("div", { className: "flex flex-wrap gap-2" }, [
              h(TextInput, {
                value: listingKeywordDraft,
                onChange: (e) => setListingKeywordDraft(e.target.value),
                placeholder: "Add keyword or phrase",
                className: "min-w-[12rem] flex-1",
                onKeyDown: (e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addKeyword();
                  }
                }
              }),
              h(Button, { type: "button", variant: "ghost", onClick: addKeyword }, "Add")
            ])
          ])
        ),
        ruleCard(
          "modset",
          SettingsIcon,
          "Enforcement",
          "Moderation settings",
          "Controls automated behavior when sellers publish.",
          h("div", { className: "space-y-3" }, [
            modToggle(
              "am",
              "Enable auto moderation",
              "Master switch for keyword scanning when listings are submitted.",
              settingsForm.listingAutoModerationEnabled,
              (v) => setSettingsForm((s) => ({ ...s, listingAutoModerationEnabled: v }))
            ),
            modToggle(
              "kb",
              "Block prohibited keywords automatically",
              "Requires auto moderation. Uses the keyword list above.",
              settingsForm.listingKeywordBlockEnabled,
              (v) => setSettingsForm((s) => ({ ...s, listingKeywordBlockEnabled: v }))
            ),
            h("div", { className: "grid gap-3 sm:grid-cols-2" }, [
              h(
                Field,
                { label: "New listings default" },
                h(
                  SelectInput,
                  {
                    value: settingsForm.listingDefaultApprovalMode,
                    onChange: (e) => setSettingsForm((s) => ({ ...s, listingDefaultApprovalMode: e.target.value }))
                  },
                  [
                    h("option", { key: "r", value: "require_approval" }, "Require admin approval"),
                    h("option", { key: "a", value: "auto_approve" }, "Auto-approve (if no keyword hit)")
                  ]
                )
              ),
              h(
                Field,
                { label: "If keyword matched" },
                h(
                  SelectInput,
                  {
                    value: settingsForm.listingKeywordViolationAction,
                    onChange: (e) => setSettingsForm((s) => ({ ...s, listingKeywordViolationAction: e.target.value }))
                  },
                  [
                    h("option", { key: "f", value: "flag_review" }, "Flag for review (pending)"),
                    h("option", { key: "j", value: "reject_auto" }, "Reject automatically")
                  ]
                )
              )
            ]),
            h(
              InlineNotice,
              { variant: "info", size: "sm" },
              "Changes to a live listing always send it back for approval, regardless of auto-approve."
            )
          ])
        ),
        ruleCard(
          "extra",
          FileText,
          "Optional",
          "Additional notes",
          "Legacy freeform notes.",
          h(TextArea, {
            rows: 2,
            autoMinHeight: false,
            value: settingsForm.listingPolicyNote,
            onChange: (e) => setSettingsForm((s) => ({ ...s, listingPolicyNote: e.target.value })),
            className: "resize-y !py-2 !text-sm leading-snug max-h-40",
            placeholder: "Optional extra notes (legacy freeform field)."
          })
        ),
        (settings?.listingRulesAuditTail || []).length > 0
          ? h(GlassCard, { key: "hist", className: "!p-4" }, [
              h(
                "p",
                { className: "text-xs font-semibold uppercase tracking-wide text-slate-500" },
                "Change log (recent)"
              ),
              h(
                "ul",
                { className: "mt-2 max-h-48 space-y-2 overflow-y-auto text-xs text-slate-600 dark:text-slate-300" },
                settings.listingRulesAuditTail.map((row, i) =>
                  h("li", { key: i, className: "border-l-2 border-sky-500/40 pl-2" }, [
                    h("span", { className: "font-mono text-[10px] text-slate-400" }, fmtDateTime(row.at)),
                    " — ",
                    row.summary
                  ])
                )
              )
            ])
          : null
      ]);
    }
    return h("div", { className: "space-y-4" }, [
      h("h3", { key: "t", className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, "Platform overview"),
      h(InlineNotice, { key: "n", variant: "info", title: "Public config endpoint" }, [
        h("p", { className: "text-sm" }, "The storefront can read non-secret settings from this URL (no auth):"),
        h(
          "code",
          {
            className: "mt-2 block break-all rounded-lg bg-black/5 px-2 py-1.5 text-xs dark:bg-white/10"
          },
          `${(process.env.REACT_APP_API_URL || "").replace(/\/$/, "") || "(set REACT_APP_API_URL)"}/api/platform/config`
        ),
        h("p", { className: "mt-2 text-xs text-slate-600 dark:text-slate-400" }, "Exposes site name, maintenance flags, whether signup, vendor, and courier applications are open, and which payment rails are enabled.")
      ]),
      h(GlassCard, { key: "snap", className: "!p-4" }, [
        h("p", { className: "text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, "Saved platform state"),
        h("ul", { className: "mt-2 list-inside list-disc space-y-1 text-sm text-slate-800 dark:text-slate-200" }, [
          h("li", { key: "0" }, `Site: ${settings?.siteName ?? "—"}`),
          h("li", { key: "0b" }, `Support email: ${(settings?.supportEmail || "").trim() || "—"}`),
          h("li", { key: "m" }, `Maintenance: ${settings?.maintenanceMode ? "On" : "Off"}`),
          h("li", { key: "r" }, `New sign-ups: ${settings?.allowPublicRegistration !== false ? "Open" : "Closed"}`),
          h("li", { key: "v" }, `Vendor applications: ${settings?.allowVendorApplications !== false ? "Open" : "Closed"}`),
          h("li", { key: "c" }, `Courier applications: ${settings?.allowCourierApplications !== false ? "Open" : "Closed"}`),
          h("li", { key: "1" }, `Commission: ${settings?.commissionPercent ?? "—"}%`),
          h("li", { key: "2" }, `MoMo: ${settings?.momoEnabled ? "On" : "Off"}`),
          h("li", { key: "3" }, `Card (Paystack): ${settings?.stripeEnabled ? "On" : "Off"}`),
          h("li", { key: "4" }, `Bank transfer: ${settings?.bankEnabled ? "On" : "Off"}`)
        ])
      ])
    ]);
  };

  /* ---------------- System logs ---------------- */

  const renderLogs = () => {
    const LOG_TIMELINE_CAP = 150;
    const orders = (dashboard?.recent?.orders || []).map((o) => ({
      ts: o.createdAt,
      icon: ShoppingCart,
      tone: "info",
      title: `Order ${shortId(o.id)} — ${formatOrderFulfillmentLabel(o)}`,
      hint: o.total != null ? formatGhc(o.total) : ""
    }));
    const signups = (dashboard?.recent?.signups || []).map((u) => ({
      ts: u.createdAt,
      icon: UsersIcon,
      tone: "success",
      title: `New ${u.role}: ${u.displayName || u.email || u.id}`,
      hint: u.email || ""
    }));
    const listingsEvents = (dashboard?.recent?.listings || []).map((p) => ({
      ts: p.createdAt,
      icon: Package,
      tone: p.status === "pending_approval" ? "warn" : "info",
      title: `Listing ${p.name} — ${formatListingStatus(p.status)}`,
      hint: p.sellerLabel || ""
    }));
    const reportEvents = (dashboard?.recent?.reports || []).map((r) => {
      const catLabel = REPORT_CATS[r.category] || r.category;
      const st = r.status ? String(r.status).replace(/_/g, " ") : "";
      return {
        ts: r.createdAt,
        icon: Flag,
        tone: r.status === "open" || r.status === "in_review" ? "warn" : "info",
        title: `Report — ${catLabel}${st ? ` (${st})` : ""}`,
        hint: r.targetType ? `Target: ${r.targetType}` : ""
      };
    });
    const vendorAppEvents = (dashboard?.recent?.vendorApplications || []).map((a) => ({
      ts: a.createdAt,
      icon: Store,
      tone: a.status === "pending" ? "warn" : a.status === "approved" ? "success" : "info",
      title: `Vendor application — ${a.shopName} (${a.status})`,
      hint: a.email || ""
    }));
    const auditEvents = (dashboard?.recent?.audit || []).map((ev) => {
      const action = String(ev.action || "");
      let icon = ClipboardList;
      let tone = "info";
      if (action.startsWith("admin.")) {
        icon = Shield;
        tone = action.includes("revoke") ? "warn" : "success";
      } else if (action.startsWith("settings.")) {
        icon = SettingsIcon;
        tone = "success";
      } else if (action === "user.password_reset") {
        icon = AlertTriangle;
        tone = "warn";
      } else if (action.startsWith("user.")) {
        icon = UsersIcon;
      } else if (action.startsWith("delete.")) {
        icon = Trash2;
        tone = "warn";
      } else if (action.startsWith("product.")) {
        icon = Package;
        tone = action.includes("reject") ? "warn" : "info";
      } else if (action.startsWith("order.")) {
        icon = ShoppingCart;
      } else if (action.startsWith("report.")) {
        icon = Flag;
      } else if (action.startsWith("application.") || action === "delete.vendorApplication") {
        icon = Store;
      } else if (action.startsWith("system.")) {
        icon = RefreshCcw;
      }
      const hintParts = [];
      if (ev.actorLabel) hintParts.push(`By ${ev.actorLabel}`);
      if (ev.detail) hintParts.push(ev.detail);
      return {
        ts: ev.createdAt,
        icon,
        tone,
        title: ev.title || `Audit — ${action}`,
        hint: hintParts.join(" · ")
      };
    });
    const all = [...orders, ...signups, ...listingsEvents, ...reportEvents, ...vendorAppEvents, ...auditEvents]
      .sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0))
      .slice(0, LOG_TIMELINE_CAP);
    if (all.length === 0) {
      return h(EmptyState, {
        title: "No activity yet",
        hint: "Recent orders, sign-ups, listings, reports, vendor applications, and admin audit events appear here.",
        icon: Activity
      });
    }
    return h(
      GlassCard,
      { className: "!p-0" },
      h(
        "ol",
        { className: "divide-y divide-white/5" },
        all.map((ev, i) => {
          const toneBg =
            ev.tone === "success"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
              : ev.tone === "warn"
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-300"
                : "bg-sky-500/10 text-sky-600 dark:text-sky-300";
          const Ic = ev.icon;
          return h(
            "li",
            { key: i, className: "flex items-start gap-3 px-4 py-3" },
            [
              h(
                "div",
                { key: "ic", className: `flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneBg}` },
                h(Ic, { className: "h-4 w-4" })
              ),
              h("div", { key: "m", className: "min-w-0 flex-1" }, [
                h("p", { className: "truncate text-sm font-medium text-slate-900 dark:text-white" }, ev.title),
                ev.hint
                  ? h("p", { className: "truncate text-xs text-slate-500" }, ev.hint)
                  : null
              ]),
              h("span", { key: "t", className: "shrink-0 text-xs text-slate-500" }, fmtDateTime(ev.ts))
            ]
          );
        })
      )
    );
  };

  /* ---------------- Content switch ---------------- */

  const content = (() => {
    if (loading && !err) {
      return h(
        "div",
        { className: "flex min-h-[40vh] items-center justify-center" },
        h("p", { className: "text-sm text-slate-500" }, "Loading…")
      );
    }
    if (tab === "dashboard") return renderDashboard();
    if (tab === "users") return renderUsers();
    if (tab === "riders") return renderRiders();
    if (tab === "vendor-apps") return renderVendorApplications();
    if (tab === "stores") return h(AdminStoresPanel, { auth, confirm, toast, alert });
    if (tab === "promotions") return h(AdminPromotionsPanel, { auth, confirm, toast, alert });
    if (tab === "courier-apps") return renderCourierApplications();
    if (tab === "sellers") return renderSellers();
    if (tab === "listings") return renderListings();
    if (tab === "orders") return renderOrders();
    if (tab === "payments") return renderPayments();
    if (tab === "reports") return renderReports();
    if (tab === "messages") return renderMessages();
    if (tab === "settings") return renderSettings();
    if (tab === "logs") return renderLogs();
    return null;
  })();

  /* ---------------- Modals ---------------- */

  const userModal = viewUser
    ? h(
        Modal,
        { open: true, onClose: () => setViewUser(null), title: "User activity", size: "md" },
        [
          h(
            "div",
            { key: "top", className: "flex items-center gap-3" },
            [
              h(Avatar, { key: "a", user: viewUser.user, size: 56 }),
              h("div", { key: "m" }, [
                h(
                  "p",
                  { className: "font-display text-lg font-bold text-slate-900 dark:text-white" },
                  viewUser.user.displayName || "—"
                ),
                h(
                  "p",
                  { className: "text-sm text-slate-500" },
                  viewUser.user.email || viewUser.user.id
                ),
                h("div", { className: "mt-1 flex flex-wrap gap-1" }, [
                  h(
                    Badge,
                    {
                      key: "r",
                      tone:
                        viewUser.user.role === "admin" && viewUser.user.adminLevel !== "normal" ? "warn" : "neutral"
                    },
                    viewUser.user.role === "admin"
                      ? viewUser.user.adminLevel === "super"
                        ? "Super admin"
                        : viewUser.user.adminLevel === "normal"
                          ? "Admin"
                          : viewUser.user.role
                      : viewUser.user.role
                  ),
                  h(Badge, { key: "s", tone: accountStatusTone(viewUser.user.accountStatus) }, viewUser.user.accountStatus)
                ])
              ])
            ]
          ),
          h(
            "div",
            { key: "stats", className: "mt-4 grid grid-cols-2 gap-2 text-sm" },
            [
              h(StatCard, { key: "b", label: "Orders as buyer", value: String(viewUser.activity.ordersAsBuyer), icon: ShoppingCart }),
              h(StatCard, { key: "s", label: "Orders touching seller", value: String(viewUser.activity.ordersTouchingSeller), icon: Store }),
              h(StatCard, { key: "l", label: "Listings", value: String(viewUser.activity.listings), icon: Package }),
              h(StatCard, { key: "r", label: "Reports mentioning user", value: String(viewUser.activity.reportsMentioningUser), icon: AlertTriangle })
            ]
          ),
          (viewUser.recentOrders || []).length > 0
            ? h("div", { key: "ro", className: "mt-4" }, [
                h("p", { key: "t", className: "mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, "Recent orders"),
                h(
                  "ul",
                  { className: "space-y-1 text-sm" },
                  viewUser.recentOrders.map((o) =>
                    h(
                      "li",
                      {
                        key: o.id,
                        className: "flex items-center justify-between rounded-xl bg-white/5 px-3 py-1.5"
                      },
                      [
                        h("span", { className: "font-mono text-xs" }, shortId(o.id)),
                        h("span", { className: "text-xs" }, formatOrderFulfillmentLabel(o)),
                        h("span", { className: "font-medium" }, o.total != null ? formatGhc(o.total) : "—")
                      ]
                    )
                  )
                )
              ])
            : null
        ].filter(Boolean)
      )
    : null;

  const vendorVerificationModal = vendorVerificationApp
    ? h(
        Modal,
        {
          open: true,
          onClose: () => setVendorVerificationApp(null),
          title: "Verification document",
          size: "lg"
        },
        h(
          "div",
          { className: "flex flex-col gap-4" },
          [
          h("div", { key: "meta", className: "shrink-0" }, [
            h("p", { className: "font-semibold text-slate-900 dark:text-white" }, vendorVerificationApp.shopName),
            h("p", { className: "text-sm text-slate-500 dark:text-slate-400" }, `${vendorVerificationApp.fullName} · ${vendorVerificationApp.email}`),
            h("div", { className: "mt-2 flex flex-wrap gap-2" }, [
              h(Badge, { key: "c", tone: "neutral" }, CATEGORY_LABELS[vendorVerificationApp.category] || vendorVerificationApp.category),
              h(
                Badge,
                {
                  key: "s",
                  tone:
                    vendorVerificationApp.status === "pending"
                      ? "warn"
                      : vendorVerificationApp.status === "approved"
                        ? "success"
                        : "danger"
                },
                vendorVerificationApp.status
              )
            ])
          ]),
          h(
            "div",
            {
              key: "actions",
              className:
                "shrink-0 flex flex-col gap-3 border-b border-white/10 pb-4 dark:border-white/5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
            },
            [
              vendorVerificationApp.status === "pending"
                ? h("div", { className: "flex flex-wrap gap-2" }, [
                    h(
                      Button,
                      {
                        key: "ok",
                        type: "button",
                        className: "!bg-emerald-600 hover:!bg-emerald-500",
                        onClick: () => onVendorAppDecision(vendorVerificationApp, "approve")
                      },
                      "Approve seller"
                    ),
                    h(
                      Button,
                      {
                        key: "no",
                        type: "button",
                        variant: "ghost",
                        className: "!border-rose-400/50 !text-rose-700 dark:!text-rose-300",
                        onClick: () => onVendorAppDecision(vendorVerificationApp, "reject")
                      },
                      "Reject application"
                    )
                  ])
                : vendorVerificationApp.status === "approved"
                  ? h("div", { className: "flex flex-wrap items-center gap-2" }, [
                      h(
                        Button,
                        {
                          key: "ban",
                          type: "button",
                          variant: "ghost",
                          className: "!border-rose-500/50 !text-rose-700 dark:!text-rose-300",
                          onClick: onBanVendorApplicantAccount
                        },
                        "Ban account"
                      ),
                      h(
                        "span",
                        { key: "hint", className: "text-xs text-slate-500 dark:text-slate-400" },
                        "Removes sign-in access for this applicant."
                      )
                    ])
                  : h("p", { key: "nr", className: "text-xs text-slate-500 dark:text-slate-400" }, "This application was rejected."),
              h(Button, { key: "cl", variant: "ghost", onClick: () => setVendorVerificationApp(null) }, "Close")
            ]
          ),
          vendorVerificationApp.verificationDocUrl
            ? h(
                "div",
                {
                  key: "doclink",
                  className:
                    "rounded-2xl border border-white/10 bg-slate-900/5 px-4 py-3 dark:bg-white/5"
                },
                h(
                  "a",
                  {
                    href: vendorVerificationApp.verificationDocUrl,
                    target: "_blank",
                    rel: "noreferrer",
                    className: "text-sm font-medium text-sky-600 hover:underline dark:text-sky-300"
                  },
                  "Open verification document in new tab →"
                )
              )
            : h("p", { key: "nodoc", className: "text-sm text-slate-500" }, "No verification document uploaded.")
          ].filter(Boolean)
        )
      )
    : null;

  const rejectModal = rejectProduct
    ? h(
        Modal,
        { open: true, onClose: () => setRejectProduct(null), title: "Reject listing", size: "md" },
        h("div", { className: "space-y-4" }, [
          h(
            "div",
            { key: "p", className: "flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3" },
            [
              h(
                "div",
                {
                  className:
                    "flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-900/10 dark:bg-white/10"
                },
                productThumb(rejectProduct)
                  ? h("img", { src: productThumb(rejectProduct), alt: rejectProduct.name, className: "h-full w-full object-cover" })
                  : h(Package, { className: "h-6 w-6 text-slate-400" })
              ),
              h("div", null, [
                h("p", { className: "font-semibold text-slate-900 dark:text-white" }, rejectProduct.name),
                h(
                  "p",
                  { className: "text-xs text-slate-500" },
                  `${CATEGORY_LABELS[rejectProduct.category] || rejectProduct.category} · ${formatGhc(rejectProduct.price)}`
                )
              ])
            ]
          ),
          h(Field, { key: "r", label: "Select a reason" }, h(SelectInput, {
            value: rejectReasonSel,
            onChange: (e) => setRejectReasonSel(e.target.value)
          }, REJECT_REASONS.map((r) => h("option", { key: r, value: r }, r)))),
          h(Field, { key: "n", label: "Additional notes (optional)" }, h(TextArea, {
            rows: 4,
            placeholder: "Add more context for the seller…",
            value: rejectNote,
            onChange: (e) => setRejectNote(e.target.value)
          })),
          h("div", { key: "b", className: "flex flex-wrap justify-end gap-2" }, [
            h(Button, { key: "c", variant: "ghost", onClick: () => setRejectProduct(null) }, "Cancel"),
            h(Button, { key: "r", variant: "danger", onClick: submitReject }, "Reject listing")
          ])
        ])
      )
    : null;

  const editImageUrls = productImageUrls(editProduct);

  const editModal = editProduct
    ? h(
        Modal,
        { open: true, onClose: () => setEditProduct(null), title: `Edit ${editProduct.name}`, size: "lg" },
        h("div", { className: "space-y-3" }, [
          h("div", { key: "photos", className: "space-y-2" }, [
            h("p", { className: "text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, "Photos (from seller)"),
            editImageUrls.length
              ? h(
                  "div",
                  { className: "grid max-h-64 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3" },
                  editImageUrls.map((src, i) =>
                    h(
                      "a",
                      {
                        key: i,
                        href: src,
                        target: "_blank",
                        rel: "noopener noreferrer",
                        className: "block overflow-hidden rounded-2xl ring-1 ring-slate-200/80 dark:ring-white/10"
                      },
                      h("img", { src, alt: `${editProduct.name} ${i + 1}`, className: "h-32 w-full object-cover hover:opacity-90" })
                    )
                  )
                )
              : h(
                  "p",
                  { className: "rounded-2xl border border-dashed border-slate-300/60 px-3 py-4 text-center text-sm text-slate-500 dark:border-white/20 dark:text-slate-400" },
                  "No images in this listing yet."
                )
          ]),
          h(Field, { key: "n", label: "Name" }, h(TextInput, {
            value: editForm.name,
            onChange: (e) => setEditForm((s) => ({ ...s, name: e.target.value }))
          })),
          h("div", { key: "g", className: "grid grid-cols-2 gap-3" }, [
            h(Field, { key: "p", label: "Price (GHC)" }, h(TextInput, {
              type: "number",
              min: 0,
              step: "0.01",
              value: editForm.price,
              onChange: (e) => setEditForm((s) => ({ ...s, price: e.target.value }))
            })),
            h(Field, { key: "s", label: "Availability" }, h("div", { className: "space-y-2" }, [
              h("label", { className: "flex cursor-pointer items-center gap-2.5" }, [
                h("input", {
                  type: "checkbox",
                  checked: editForm.inStock,
                  onChange: (e) => setEditForm((s) => ({ ...s, inStock: e.target.checked })),
                  className: "h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 dark:border-white/20 dark:bg-night-950"
                }),
                h("span", { className: "text-sm font-medium text-slate-800 dark:text-slate-100" }, "In stock — available to buy")
              ]),
              h(
                "p",
                { className: "text-xs text-slate-500 dark:text-slate-400" },
                "Uncheck when sold out. Buyers cannot add out-of-stock items to cart."
              )
            ]))
          ]),
          h(Field, { key: "c", label: "Category slug" }, h(TextInput, {
            value: editForm.category,
            onChange: (e) => setEditForm((s) => ({ ...s, category: e.target.value }))
          })),
          h(Field, { key: "d", label: "Description" }, h(TextArea, {
            rows: 4,
            value: editForm.description,
            onChange: (e) => setEditForm((s) => ({ ...s, description: e.target.value }))
          })),
          h("div", { key: "b", className: "flex flex-wrap justify-end gap-2" }, [
            h(Button, { key: "c", variant: "ghost", onClick: () => setEditProduct(null) }, "Cancel"),
            h(Button, { key: "s", onClick: submitEditListing }, "Save listing")
          ])
        ])
      )
    : null;

  const viewProductModal = viewProduct
    ? h(
        Modal,
        { open: true, onClose: () => setViewProduct(null), title: "Listing details", size: "md" },
        h("div", { className: "space-y-3 text-sm" }, [
          productThumb(viewProduct)
            ? h("img", { key: "im", src: productThumb(viewProduct), alt: viewProduct.name, className: "h-48 w-full rounded-2xl object-cover" })
            : null,
          h("p", { key: "n", className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, viewProduct.name),
          h("div", { key: "meta", className: "flex flex-wrap gap-1" }, [
            h(Badge, { key: "s", tone: listingStatusTone(viewProduct.status) }, formatListingStatus(viewProduct.status)),
            viewProduct.flagged ? h(Badge, { key: "f", tone: "warn" }, "Flagged") : null,
            h(Badge, { key: "c", tone: "neutral" }, CATEGORY_LABELS[viewProduct.category] || viewProduct.category || "—")
          ].filter(Boolean)),
          h(
            "p",
            { key: "p", className: "text-slate-700 dark:text-slate-200" },
            `Price: ${formatGhc(viewProduct.price)} · ${Number(viewProduct.stock) > 0 ? "In stock" : "Out of stock"}`
          ),
          h("p", { key: "se", className: "text-slate-600 dark:text-slate-300" }, `Seller: ${viewProduct.sellerLabel || "—"}`),
          viewProduct.rejectionReason
            ? h(InlineNotice, { key: "rr", variant: "error", title: "Rejection reason" }, viewProduct.rejectionReason)
            : null,
          viewProduct.description
            ? h("p", { key: "d", className: "whitespace-pre-wrap text-slate-700 dark:text-slate-200" }, viewProduct.description)
            : null,
          h("div", { key: "b", className: "flex flex-wrap justify-end gap-2" }, [
            viewProduct.status !== "active" &&
              h(Button, { key: "ap", onClick: () => { approveListing(viewProduct.id); setViewProduct(null); } }, "Approve"),
            viewProduct.status !== "rejected" &&
              h(Button, { key: "rj", variant: "danger", onClick: () => { openReject(viewProduct); setViewProduct(null); } }, "Reject"),
            h(Button, { key: "cl", variant: "ghost", onClick: () => setViewProduct(null) }, "Close")
          ].filter(Boolean))
        ].filter(Boolean))
      )
    : null;

  /** Build the report details panel body (used inside the modal so it works on every screen size). */
  const renderReportDetailsPanel = (rep) => {
    const reporter = rep.reporter || null;
    const targetUser =
      rep.targetUser || rep.productSeller || rep.orderBuyer || null;
    const reporterRole = (reporter?.role || "buyer").toLowerCase();
    const targetRole = rep.targetUser
      ? (rep.targetUser.role || "buyer").toLowerCase()
      : rep.productSeller
        ? "seller"
        : rep.orderBuyer
          ? (rep.orderBuyer.role || "buyer").toLowerCase()
          : "buyer";
    const reporterLabel =
      reporterRole === "admin" ? "Admin" : reporterRole === "seller" ? "Vendor" : "Buyer";
    const targetLabel =
      targetRole === "admin" ? "Admin" : targetRole === "seller" ? "Vendor" : "Buyer";
    const order = rep.order;
    const product = rep.product;

    return h("div", { className: "space-y-4 text-sm" }, [
      // Top: ID + status pills
      h("div", { key: "top", className: "flex flex-wrap items-center justify-between gap-2" }, [
        h("div", { key: "ids", className: "flex items-center gap-2" }, [
          h(
            "span",
            { className: "rounded-lg bg-purple-100 px-2 py-0.5 font-mono text-xs font-semibold text-purple-700 dark:bg-purple-900/40 dark:text-purple-200" },
            shortId(rep.id)
          ),
          h(
            Badge,
            { tone: reportStatusTone(rep.status) },
            reportStatusLabel(rep.status)
          ),
          h(
            Badge,
            { tone: reportPriorityTone(rep.priority || "medium") },
            `${(rep.priority || "medium").charAt(0).toUpperCase()}${(rep.priority || "medium").slice(1)} priority`
          )
        ])
      ]),
      // Type
      h("div", { key: "type", className: "flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 dark:bg-white/[0.03]" }, [
        h(
          "div",
          { className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200" },
          h(AlertTriangle, { className: "h-5 w-5" })
        ),
        h("div", null, [
          h("p", { className: "text-[11px] uppercase tracking-wide text-slate-400" }, "Type"),
          h("p", { className: "font-semibold text-slate-800 dark:text-slate-100" }, REPORT_CATS[rep.category] || rep.category)
        ])
      ]),
      // Reported by
      h("div", { key: "rep", className: "rounded-2xl border border-white/10 bg-white/5 p-3 dark:bg-white/[0.03]" }, [
        h("p", { className: "mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, [
          "Reported by ",
          h("span", { className: "font-medium normal-case text-slate-400" }, `(${reporterLabel})`)
        ]),
        reporter
          ? h("div", { className: "flex items-center gap-3" }, [
              renderUserAvatar(reporter, { size: "lg" }),
              h("div", { className: "min-w-0" }, [
                h("p", { className: "truncate text-sm font-semibold text-slate-800 dark:text-slate-100" }, reporter.name || rep.reporterLabel || "—"),
                h("p", { className: "truncate text-xs text-slate-500" }, reporter.email || "—")
              ])
            ])
          : h("p", { className: "text-sm text-slate-500" }, rep.reporterLabel || "—")
      ]),
      // Reported user
      targetUser || rep.targetType !== "other"
        ? h("div", { key: "tgt", className: "rounded-2xl border border-white/10 bg-white/5 p-3 dark:bg-white/[0.03]" }, [
            h("p", { className: "mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, [
              "Reported user ",
              h("span", { className: "font-medium normal-case text-slate-400" }, `(${targetLabel})`)
            ]),
            targetUser
              ? h("div", { className: "flex items-center gap-3" }, [
                  renderUserAvatar(targetUser, { size: "lg" }),
                  h("div", { className: "min-w-0" }, [
                    h(
                      "p",
                      { className: "truncate text-sm font-semibold text-slate-800 dark:text-slate-100" },
                      targetUser.businessName || targetUser.name
                    ),
                    h("p", { className: "truncate text-xs text-slate-500" }, targetUser.email || "—")
                  ])
                ])
              : h("p", { className: "text-sm text-slate-500" }, [
                  h("span", { className: "capitalize" }, rep.targetType),
                  rep.targetId ? ` · ${rep.targetId}` : ""
                ])
          ])
        : null,
      // Order info
      order || product
        ? h("div", { key: "ord", className: "rounded-2xl border border-white/10 bg-white/5 p-3 dark:bg-white/[0.03]" }, [
            h(
              "p",
              { className: "mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" },
              order ? "Order information" : "Product information"
            ),
            h(
              "dl",
              { className: "grid grid-cols-2 gap-x-3 gap-y-2 text-xs" },
              [
                order
                  ? h("div", { key: "oid" }, [
                      h("dt", { className: "text-slate-500" }, "Order ID"),
                      h("dd", { className: "font-mono font-semibold text-purple-700 dark:text-purple-300" }, shortId(order.id))
                    ])
                  : null,
                product
                  ? h("div", { key: "pid" }, [
                      h("dt", { className: "text-slate-500" }, "Product"),
                      h("dd", { className: "truncate font-medium" }, product.name || shortId(product.id))
                    ])
                  : null,
                order
                  ? h("div", { key: "names" }, [
                      h("dt", { className: "text-slate-500" }, "Product"),
                      h("dd", { className: "truncate font-medium" }, order.productNames || "—")
                    ])
                  : null,
                order
                  ? h("div", { key: "amt" }, [
                      h("dt", { className: "text-slate-500" }, "Amount"),
                      h("dd", { className: "font-semibold" }, formatGhc(order.total || 0))
                    ])
                  : null,
                product && !order
                  ? h("div", { key: "pp" }, [
                      h("dt", { className: "text-slate-500" }, "Price"),
                      h("dd", { className: "font-semibold" }, formatGhc(product.price || 0))
                    ])
                  : null,
                order
                  ? h("div", { key: "od" }, [
                      h("dt", { className: "text-slate-500" }, "Order date"),
                      h("dd", null, fmtDate(order.createdAt))
                    ])
                  : null
              ].filter(Boolean)
            )
          ])
        : null,
      // Description
      h("div", { key: "desc", className: "rounded-2xl border border-white/10 bg-white/5 p-3 dark:bg-white/[0.03]" }, [
        h("p", { className: "mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, "Issue description"),
        h(
          "p",
          { className: "whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200" },
          rep.description || "—"
        )
      ]),
      // Evidence
      rep.evidenceUrls && rep.evidenceUrls.length
        ? h("div", { key: "ev", className: "rounded-2xl border border-white/10 bg-white/5 p-3 dark:bg-white/[0.03]" }, [
            h("p", { className: "mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, [
              h(ImageIcon, { className: "mr-1 inline h-3.5 w-3.5" }),
              "Evidence"
            ]),
            h(
              "div",
              { className: "flex flex-wrap gap-2" },
              rep.evidenceUrls.map((u) =>
                h(
                  "a",
                  {
                    key: u,
                    href: buildUrl(u),
                    target: "_blank",
                    rel: "noopener noreferrer",
                    className: "block"
                  },
                  h("img", {
                    src: buildUrl(u),
                    alt: "",
                    className: "h-20 w-20 rounded-lg border border-white/10 object-cover"
                  })
                )
              )
            )
          ])
        : null,
      // Timeline
      h("div", { key: "tl", className: "rounded-2xl border border-white/10 bg-white/5 p-3 dark:bg-white/[0.03]" }, [
        h("p", { className: "mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, "Timeline"),
        h("ol", { className: "space-y-3" }, [
          h("li", { key: "sub", className: "flex items-start gap-3" }, [
            h("span", { className: "mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" }),
            h("div", { className: "min-w-0" }, [
              h("p", { className: "text-sm font-medium text-slate-800 dark:text-slate-100" }, "Report submitted"),
              h("p", { className: "text-xs text-slate-500" }, fmtDateTime(rep.createdAt))
            ])
          ]),
          rep.status === "in_review"
            ? h("li", { key: "rev", className: "flex items-start gap-3" }, [
                h("span", { className: "mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-sky-500" }),
                h("div", { className: "min-w-0" }, [
                  h("p", { className: "text-sm font-medium text-slate-800 dark:text-slate-100" }, "Under review"),
                  h("p", { className: "text-xs text-slate-500" }, fmtDateTime(rep.updatedAt))
                ])
              ])
            : null,
          rep.status === "resolved" && rep.resolvedAt
            ? h("li", { key: "res", className: "flex items-start gap-3" }, [
                h("span", { className: "mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" }),
                h("div", { className: "min-w-0" }, [
                  h("p", { className: "text-sm font-medium text-slate-800 dark:text-slate-100" }, "Resolved"),
                  h(
                    "p",
                    { className: "text-xs text-slate-500" },
                    `${fmtDateTime(rep.resolvedAt)}${rep.resolvedByLabel ? ` · ${rep.resolvedByLabel}` : ""}`
                  )
                ])
              ])
            : null,
          rep.status === "dismissed" && rep.resolvedAt
            ? h("li", { key: "dm", className: "flex items-start gap-3" }, [
                h("span", { className: "mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-slate-400" }),
                h("div", { className: "min-w-0" }, [
                  h("p", { className: "text-sm font-medium text-slate-800 dark:text-slate-100" }, "Dismissed"),
                  h("p", { className: "text-xs text-slate-500" }, fmtDateTime(rep.resolvedAt))
                ])
              ])
            : null,
          rep.status === "open"
            ? h("li", { key: "wait", className: "flex items-start gap-3" }, [
                h("span", { className: "mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500" }),
                h("div", { className: "min-w-0" }, [
                  h("p", { className: "text-sm font-medium text-slate-800 dark:text-slate-100" }, "Awaiting admin review")
                ])
              ])
            : null
        ].filter(Boolean))
      ]),
      // Admin note
      h(Field, { key: "n", label: "Admin note" }, h(TextArea, {
        rows: 4,
        value: reportNote,
        onChange: (e) => setReportNote(e.target.value),
        placeholder: "Visible to other admins. Use this for internal context."
      })),
      // Priority changer
      h(
        "div",
        { key: "pri", className: "flex items-center gap-2" },
        [
          h(
            "label",
            { key: "l", className: "text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" },
            "Priority"
          ),
          h(
            "select",
            {
              key: "s",
              value: rep.priority || "medium",
              onChange: (e) => patchReport(rep, { priority: e.target.value }),
              className:
                "rounded-xl border border-slate-300/70 bg-white/60 px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-sky-400 focus:outline-none dark:border-white/10 dark:bg-night-900/60 dark:text-slate-200"
            },
            ["low", "medium", "high"].map((p) =>
              h("option", { key: p, value: p }, p.charAt(0).toUpperCase() + p.slice(1))
            )
          )
        ]
      ),
      // Action buttons (Resolve / Request More Info / Dismiss / Delete)
      h("div", { key: "actions", className: "grid grid-cols-1 gap-2 sm:grid-cols-2" }, [
        h(
          "button",
          {
            key: "rs",
            type: "button",
            disabled: rep.status === "resolved",
            onClick: () => patchReport(rep, { status: "resolved", adminNote: reportNote }),
            className:
              "inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-900/20 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
          },
          [h(Check, { key: "i", className: "h-4 w-4" }), h("span", { key: "l" }, "Resolve report")]
        ),
        h(
          "button",
          {
            key: "ir",
            type: "button",
            onClick: () => patchReport(rep, { status: "in_review", adminNote: reportNote }),
            className:
              "inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-300/60 bg-amber-50/70 px-4 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-100/80 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200"
          },
          [h(MessageCircle, { key: "i", className: "h-4 w-4" }), h("span", { key: "l" }, "Request more info")]
        ),
        h(
          "button",
          {
            key: "dm",
            type: "button",
            disabled: rep.status === "dismissed",
            onClick: () => patchReport(rep, { status: "dismissed", adminNote: reportNote }),
            className:
              "inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-300/60 bg-white/60 px-4 py-2.5 text-sm font-semibold text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-amber-500/30 dark:bg-night-900/50 dark:text-amber-200"
          },
          [h(XCircle, { key: "i", className: "h-4 w-4" }), h("span", { key: "l" }, "Dismiss report")]
        ),
        isSuperAdmin
          ? h(
              "button",
              {
                key: "del",
                type: "button",
                onClick: () => deleteReport(rep),
                className:
                  "inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-400/70 bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-rose-900/30 transition hover:bg-rose-500"
              },
              [h(Trash2, { key: "i", className: "h-4 w-4" }), h("span", { key: "l" }, "Delete report")]
            )
          : null
      ].filter(Boolean))
    ].filter(Boolean));
  };

  const reportModal = viewReport
    ? h(
        Modal,
        {
          open: true,
          onClose: () => setViewReport(null),
          title: `Report details ${shortId(viewReport.id)}`,
          size: "lg"
        },
        renderReportDetailsPanel(viewReport)
      )
    : null;

  const listingPolicyPreviewModal = listingPolicyPreviewOpen
    ? h(
        Modal,
        {
          open: true,
          onClose: () => setListingPolicyPreviewOpen(false),
          title: "Preview — moderator reference",
          size: "lg"
        },
        h("div", { className: "max-h-[75vh] space-y-2 overflow-y-auto pr-1 text-sm" }, [
          h("p", { className: "text-xs text-slate-500 dark:text-slate-400" }, "What you see here is taken from the form on this page (draft). Placeholder text in empty fields is not stored — type real content and save to persist. Allowed / Prohibited / Guidelines map to the first three reference cards; “Additional notes” is the optional legacy field at the bottom."),
          h("div", { className: "rounded-2xl border border-amber-200/60 bg-amber-50/70 p-3 text-xs text-amber-950 dark:border-amber-500/25 dark:bg-amber-950/30 dark:text-amber-100" }, [
            h("p", { className: "font-semibold uppercase tracking-wide" }, "Enforcement (current toggles)"),
            h("ul", { className: "mt-2 list-inside list-disc space-y-0.5" }, [
              h("li", { key: "a" }, `Auto moderation: ${settingsForm.listingAutoModerationEnabled ? "On" : "Off"}`),
              h("li", { key: "b" }, `Keyword block: ${settingsForm.listingKeywordBlockEnabled ? "On" : "Off"}`),
              h(
                "li",
                { key: "c" },
                `New listings: ${settingsForm.listingDefaultApprovalMode === "auto_approve" ? "Auto-approve when clean" : "Require approval"}`
              ),
              h(
                "li",
                { key: "d" },
                `Keyword hit: ${settingsForm.listingKeywordViolationAction === "reject_auto" ? "Auto-reject" : "Flag for review"}`
              ),
              h(
                "li",
                { key: "e" },
                `Keywords (${(settingsForm.listingAutoRejectKeywords || []).length}): ${(settingsForm.listingAutoRejectKeywords || []).join(", ") || "—"}`
              )
            ])
          ]),
          h("div", { className: "rounded-xl border border-white/10 bg-white/40 p-2.5 dark:bg-white/5" }, [
            h("p", { className: "text-[10px] font-bold uppercase tracking-wide text-slate-500" }, "Allowed"),
            h("div", { className: "mt-0.5 min-h-0 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100" }, (settingsForm.listingAllowedItemsNote || "").trim() || "—")
          ]),
          h("div", { className: "rounded-xl border border-white/10 bg-white/40 p-2.5 dark:bg-white/5" }, [
            h("p", { className: "text-[10px] font-bold uppercase tracking-wide text-slate-500" }, "Prohibited"),
            h("div", { className: "mt-0.5 min-h-0 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100" }, (settingsForm.listingProhibitedItemsNote || "").trim() || "—")
          ]),
          h("div", { className: "rounded-xl border border-white/10 bg-white/40 p-2.5 dark:bg-white/5" }, [
            h("p", { className: "text-[10px] font-bold uppercase tracking-wide text-slate-500" }, "Guidelines"),
            h("div", { className: "mt-0.5 min-h-0 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100" }, (settingsForm.listingModerationGuidelines || "").trim() || "—")
          ]),
          (settingsForm.listingPolicyNote || "").trim()
            ? h("div", { className: "rounded-xl border border-white/10 bg-white/40 p-2.5 dark:bg-white/5" }, [
                h("p", { className: "text-[10px] font-bold uppercase tracking-wide text-slate-500" }, "Additional notes"),
                h("div", { className: "mt-0.5 min-h-0 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100" }, settingsForm.listingPolicyNote.trim())
              ])
            : null
        ])
      )
    : null;

  /* ---------------- Page shell ---------------- */

  return h(
    "div",
    { className: "relative min-h-screen bg-slate-100 dark:bg-night-950" },
    [
      sidebarOpen
        ? h("button", {
            key: "ov",
            type: "button",
            className: "fixed inset-0 z-30 bg-slate-950/50 backdrop-blur-sm lg:hidden",
            onClick: () => setSidebarOpen(false),
            "aria-label": "Close menu"
          })
        : null,
      h("div", { key: "layout", className: "flex min-h-screen" }, [
        h("div", { key: "gutter", className: "w-0 shrink-0 lg:w-60", "aria-hidden": true }),
        sidebar,
        h("div", { key: "content", className: "flex min-h-screen min-w-0 flex-1 flex-col" }, [
          header,
          h("main", { key: "m", className: "mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6" }, [
            err
              ? h(InlineNotice, { key: "e", variant: "error", className: "mb-4", onDismiss: () => setErr("") }, err)
              : null,
            content
          ].filter(Boolean))
        ])
      ]),
      userModal,
      vendorVerificationModal,
      rejectModal,
      editModal,
      viewProductModal,
      reportModal,
      listingPolicyPreviewModal
    ].filter(Boolean)
  );
}
