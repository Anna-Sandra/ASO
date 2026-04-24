import React, { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  CreditCard,
  DollarSign,
  Edit3,
  Eye,
  Filter as FilterIcon,
  Flag,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  Package,
  RefreshCcw,
  Search,
  Settings as SettingsIcon,
  Shield,
  ShoppingCart,
  Store,
  Trash2,
  TrendingUp,
  UserCheck,
  Users as UsersIcon,
  Wallet,
  X,
  XCircle
} from "lucide-react";
import { useAuth } from "./AuthContext";
import { useNotice } from "./NoticeContext";
import { useTheme } from "./ThemeContext";
import { apiFetch, getApiBase } from "./api";
import { CATEGORY_LABELS } from "./catalog";
import { formatGhc } from "./money";
import { h } from "./h";
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
} from "./ui";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const ORDER_STATUS_OPTS = [
  "pending_payment",
  "awaiting_vendor_payment",
  "paid",
  "processing",
  "sent_for_delivery",
  "delivered",
  "cancelled"
];

const REFUND_OPTS = ["none", "requested", "refunded"];

const REPORT_CATS = {
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

const SIDEBAR_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "users", label: "Users", icon: UsersIcon },
  { id: "sellers", label: "Sellers", icon: UserCheck },
  { id: "listings", label: "Listings", icon: Package },
  { id: "orders", label: "Orders", icon: ShoppingCart },
  { id: "payments", label: "Payments", icon: DollarSign },
  { id: "reports", label: "Reports", icon: AlertTriangle },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "settings", label: "Settings", icon: SettingsIcon },
  { id: "logs", label: "System logs", icon: Activity }
];

const PAGE_TITLES = {
  dashboard: { title: "Dashboard", hint: "Overview of your marketplace" },
  users: { title: "Users", hint: "Filter by buyers, vendors (sellers), or admins" },
  sellers: { title: "Sellers verification", hint: "Verify and approve seller accounts" },
  listings: { title: "Listings", hint: "Manage every product on the platform" },
  orders: { title: "Orders", hint: "Manage customer orders" },
  payments: { title: "Payments & Revenue", hint: "Track transactions and platform earnings" },
  reports: { title: "Reports & Complaints", hint: "Manage user reports and complaints" },
  messages: { title: "Messages", hint: "Read conversations to detect fraud or abuse" },
  settings: { title: "Settings", hint: "Manage platform settings and configurations" },
  logs: { title: "System logs", hint: "Recent admin-relevant activity" }
};

const USER_TABS = [
  { id: "all", label: "All users" },
  { id: "buyer", label: "Buyers" },
  { id: "seller", label: "Sellers" },
  { id: "admin", label: "Admins" }
];

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
  { id: "processing", label: "Processing" },
  { id: "delivered", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
  { id: "refunded", label: "Refunded" },
  { id: "dispute", label: "Disputes" }
];

const PAYMENT_TABS = [
  { id: "transactions", label: "Transactions" },
  { id: "payouts", label: "Payouts" },
  { id: "refunds", label: "Refunds" }
];

const REPORT_TABS = [
  { id: "all", label: "All reports" },
  { id: "open", label: "Open" },
  { id: "in_review", label: "In progress" },
  { id: "resolved", label: "Resolved" },
  { id: "dismissed", label: "Closed" }
];

const SETTINGS_TABS = [
  { id: "general", label: "General" },
  { id: "commission", label: "Commission" },
  { id: "payments", label: "Payment methods" },
  { id: "email", label: "Email templates" },
  { id: "rules", label: "Listing rules" },
  { id: "others", label: "Others" }
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function humanizeOrderStatus(s) {
  return String(s || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
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

function orderStatusTone(s) {
  if (s === "delivered") return "success";
  if (s === "cancelled") return "danger";
  if (s === "paid" || s === "processing" || s === "sent_for_delivery") return "info";
  return "warn";
}

function reportStatusTone(s) {
  if (s === "open") return "warn";
  if (s === "in_review") return "info";
  if (s === "resolved") return "success";
  if (s === "dismissed") return "neutral";
  return "neutral";
}

function accountStatusTone(s) {
  if (s === "active") return "success";
  if (s === "suspended") return "warn";
  if (s === "banned") return "danger";
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

function generatePassword(len = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const a = new Uint32Array(len);
  if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(a);
    for (let i = 0; i < len; i++) out += chars[a[i] % chars.length];
  } else {
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Small components                                                          */
/* -------------------------------------------------------------------------- */

function StatCard({ label, value, hint, icon: Icon, tone = "info" }) {
  const toneClass =
    tone === "success"
      ? "from-emerald-500/20 to-emerald-500/5 text-emerald-200"
      : tone === "warn"
        ? "from-amber-500/20 to-amber-500/5 text-amber-200"
        : tone === "danger"
          ? "from-rose-500/20 to-rose-500/5 text-rose-200"
          : "from-sky-500/20 to-sky-500/5 text-sky-200";
  return h(GlassPanel, { className: "!p-4 sm:!p-5" }, [
    h("div", { key: "row", className: "flex items-start justify-between gap-3" }, [
      h("div", { key: "meta", className: "min-w-0" }, [
        h(
          "p",
          { className: "text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" },
          label
        ),
        h(
          "p",
          { className: "mt-2 font-display text-2xl font-bold text-slate-900 dark:text-white" },
          value
        ),
        hint
          ? h("p", { className: "mt-1 text-xs text-slate-500 dark:text-slate-400" }, hint)
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
  return h(
    "div",
    {
      className: `flex flex-wrap gap-1 rounded-2xl border border-white/10 bg-white/40 p-1 shadow-inner dark:bg-white/5 ${className}`
    },
    tabs.map((t) =>
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
      className: `flex flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-white/15 bg-white/30 p-10 text-center dark:bg-white/5 ${className}`
    },
    [
      h(
        "div",
        {
          key: "ic",
          className:
            "flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900/5 text-slate-500 dark:bg-white/5 dark:text-slate-300"
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
            { key: "h", className: "max-w-sm text-sm text-slate-500 dark:text-slate-400" },
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
        className: `relative w-full ${w} rounded-3xl border border-white/15 bg-gradient-to-br from-slate-50 to-white p-0 text-slate-900 shadow-2xl dark:from-night-900 dark:to-night-950 dark:text-slate-100`
      },
      [
        h(
          "div",
          {
            key: "head",
            className:
              "flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4 dark:border-white/5"
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
            h("stop", { offset: "0%", stopColor: "rgb(56 189 248)", stopOpacity: 0.45 }),
            h("stop", { offset: "100%", stopColor: "rgb(56 189 248)", stopOpacity: 0 })
          ]
        ),
        h(
          "linearGradient",
          { key: "str", id: "admRevStroke", x1: "0%", y1: "0%", x2: "100%", y2: "0%" },
          [
            h("stop", { offset: "0%", stopColor: "rgb(125 211 252)" }),
            h("stop", { offset: "100%", stopColor: "rgb(165 180 252)" })
          ]
        )
      ]),
      h("line", {
        key: "base",
        x1: padL,
        x2: w - padR,
        y1: baselineY,
        y2: baselineY,
        stroke: "rgba(148,163,184,0.25)"
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
              fill: "rgb(125 211 252)",
              stroke: "rgb(15 23 42)",
              strokeWidth: 1
            }),
            (i % tickStep === 0 || i === pts.length - 1) &&
              h(
                "text",
                {
                  key: "lb",
                  x: p.x,
                  y: svgH - 6,
                  fontSize: 9,
                  fill: "rgb(148 163 184)",
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

  const auth = accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : null;

  /* Dashboard */
  const [dashboard, setDashboard] = useState(null);

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
        } else {
          n.set("tab", id);
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
  const usersLimit = 20;
  const [viewUser, setViewUser] = useState(null);
  const [resetUser, setResetUser] = useState(null);
  const [resetPwd, setResetPwd] = useState("");

  /* Sellers verification */
  const [sellers, setSellers] = useState([]);
  const [sellersTotal, setSellersTotal] = useState(0);
  const [sellersPage, setSellersPage] = useState(1);
  const [sellersTab, setSellersTab] = useState("pending");
  const [sellersSearch, setSellersSearch] = useState("");
  const [sellersSearchInput, setSellersSearchInput] = useState("");
  const sellersLimit = 12;

  /* Listings */
  const [listings, setListings] = useState([]);
  const [listingsTotal, setListingsTotal] = useState(0);
  const [listingsPage, setListingsPage] = useState(1);
  const [listingsTab, setListingsTab] = useState("pending_approval");
  const [listingsSearch, setListingsSearch] = useState("");
  const [listingsSearchInput, setListingsSearchInput] = useState("");
  const listingsLimit = 15;
  const [rejectProduct, setRejectProduct] = useState(null);
  const [rejectReasonSel, setRejectReasonSel] = useState(REJECT_REASONS[0]);
  const [rejectNote, setRejectNote] = useState("");
  const [editProduct, setEditProduct] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", price: "", stock: "", category: "", description: "" });
  const [viewProduct, setViewProduct] = useState(null);

  /* Orders */
  const [orders, setOrders] = useState([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersTab, setOrdersTab] = useState("all");
  const [ordersSearch, setOrdersSearch] = useState("");
  const [ordersSearchInput, setOrdersSearchInput] = useState("");
  const ordersLimit = 15;
  const [moderateOrder, setModerateOrder] = useState(null);
  const [ordStatus, setOrdStatus] = useState("");
  const [ordDispute, setOrdDispute] = useState(false);
  const [ordNote, setOrdNote] = useState("");
  const [ordRefund, setOrdRefund] = useState("none");

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
  const [reportsPage, setReportsPage] = useState(1);
  const [reportsTab, setReportsTab] = useState("all");
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

  /* Settings */
  const [settingsTab, setSettingsTab] = useState("general");
  const [settings, setSettings] = useState(null);
  const [settingsForm, setSettingsForm] = useState({
    commissionPercent: 7,
    momoEnabled: true,
    stripeEnabled: true,
    bankEnabled: true,
    listingPolicyNote: "",
    siteName: "Campus Mart",
    siteDescription: "The official campus marketplace for students.",
    adminEmail: ""
  });
  const [savingSettings, setSavingSettings] = useState(false);

  /* Global UI */
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  /** Ignore stale fetches so tab/filter switches never show data from a previous request. */
  const reqGen = useRef({
    users: 0,
    sellers: 0,
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
    const [a1, a2] = await Promise.all([
      apiFetch(`/api/admin/orders?${qsRequested.toString()}`, auth),
      apiFetch(`/api/admin/orders?${qsRefunded.toString()}`, auth)
    ]);
    const all = [...(a1.orders || []), ...(a2.orders || [])];
    all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    setRefundOrders(all);
  }, [accessToken]);

  const loadReports = useCallback(async () => {
    if (!auth) return;
    const g = ++reqGen.current.reports;
    const qs = new URLSearchParams({
      page: String(reportsPage),
      limit: String(reportsLimit),
      status: reportsTab,
      search: reportsSearch
    });
    const d = await apiFetch(`/api/admin/reports?${qs.toString()}`, auth);
    if (g !== reqGen.current.reports) return;
    setReports(d.reports || []);
    setReportsTotal(d.total || 0);
  }, [accessToken, reportsPage, reportsTab, reportsSearch]);

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
    [accessToken]
  );

  const loadSettings = useCallback(async () => {
    if (!auth) return;
    const d = await apiFetch("/api/admin/settings", auth);
    setSettings(d.settings || null);
    if (d.settings) {
      setSettingsForm((s) => ({
        ...s,
        commissionPercent: d.settings.commissionPercent,
        momoEnabled: d.settings.momoEnabled,
        stripeEnabled: d.settings.stripeEnabled,
        bankEnabled: d.settings.bankEnabled,
        listingPolicyNote: d.settings.listingPolicyNote || ""
      }));
    }
  }, [accessToken]);

  /* ---------------- Tab-driven load effect ---------------- */

  useEffect(() => {
    if (!accessToken) return;
    setLoading(true);
    setErr("");
    const run = async () => {
      try {
        if (tab === "dashboard") await loadDashboard();
        else if (tab === "users") await loadUsers();
        else if (tab === "sellers") await loadSellers();
        else if (tab === "listings") await loadListings();
        else if (tab === "orders") await loadOrders();
        else if (tab === "payments") {
          if (paymentsTab === "transactions") await Promise.all([loadRevenue(), loadPaidOrders()]);
          else if (paymentsTab === "payouts") await Promise.all([loadRevenue(), loadBalances()]);
          else if (paymentsTab === "refunds") await loadRefundOrders();
        } else if (tab === "reports") await loadReports();
        else if (tab === "messages") await loadConversations();
        else if (tab === "settings") await loadSettings();
        else if (tab === "logs") await loadDashboard();
      } catch (ex) {
        setErr(ex.message || "Load failed");
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
    loadSellers,
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
    sellersPage,
    sellersTab,
    sellersSearch,
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
    if (tab !== "messages" || !selectedThreadId) {
      setThreadDetail(null);
      return;
    }
    loadThread(selectedThreadId);
  }, [tab, selectedThreadId, loadThread]);

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
  useEffect(() => setSellersPage(1), [sellersTab, sellersSearch]);
  useEffect(() => setListingsPage(1), [listingsTab, listingsSearch]);
  useEffect(() => setOrdersPage(1), [ordersTab, ordersSearch]);
  useEffect(() => setReportsPage(1), [reportsTab, reportsSearch]);

  /* ---------------- Guards ---------------- */

  if (!user || user.role !== "admin") {
    if (!accessToken) return h(Navigate, { to: "/login", replace: true, state: { from: "/admin" } });
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
      await alert(ex.message || "Update failed", { variant: "error" });
    }
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

  const onOpenUserDetails = async (u) => {
    try {
      const d = await apiFetch(`/api/admin/users/${u.id}/summary`, auth);
      setViewUser(d);
    } catch (ex) {
      await alert(ex.message || "Couldn’t load user", { variant: "error" });
    }
  };

  const openResetUser = (u) => {
    setResetUser(u);
    setResetPwd(generatePassword(12));
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

  const submitResetPwd = async () => {
    if (!resetUser) return;
    if (!resetPwd || resetPwd.length < 8) {
      await alert("Password must be at least 8 characters.", { variant: "warning" });
      return;
    }
    try {
      await apiFetch(`/api/admin/users/${resetUser.id}/reset-password`, {
        method: "POST",
        ...auth,
        json: { newPassword: resetPwd }
      });
      toast("Password updated", { variant: "success" });
      setResetUser(null);
      setResetPwd("");
    } catch (ex) {
      await alert(ex.message || "Couldn’t reset password", { variant: "error" });
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
      await alert(ex.message || "Approve failed", { variant: "error" });
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
      await alert(ex.message || "Reject failed", { variant: "error" });
    }
  };

  const openEditListing = (p) => {
    setEditProduct(p);
    setEditForm({
      name: p.name || "",
      price: String(p.price ?? ""),
      stock: String(p.stock ?? ""),
      category: p.category || "",
      description: p.description || ""
    });
  };

  const submitEditListing = async () => {
    if (!editProduct) return;
    const price = Number(editForm.price);
    const stock = Number(editForm.stock);
    if (!Number.isFinite(price) || price < 0) {
      await alert("Enter a valid price", { variant: "warning" });
      return;
    }
    if (!Number.isFinite(stock) || stock < 0) {
      await alert("Enter a valid stock quantity", { variant: "warning" });
      return;
    }
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
      await alert(ex.message || "Save failed", { variant: "error" });
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
      await alert(ex.message || "Update failed", { variant: "error" });
    }
  };

  const deleteListing = async (p) => {
    const ok = await confirm(`Delete "${p.name}" permanently?`, { title: "Delete listing", confirmLabel: "Delete" });
    if (!ok) return;
    try {
      await apiFetch(`/api/admin/products/${p.id}`, { method: "DELETE", ...auth });
      toast("Listing deleted", { variant: "success" });
      await loadListings();
      await loadDashboard();
    } catch (ex) {
      await alert(ex.message || "Delete failed", { variant: "error" });
    }
  };

  /* Orders */
  const openOrderModeration = (o) => {
    setModerateOrder(o);
    setOrdStatus(o.status);
    setOrdDispute(!!o.disputeOpen);
    setOrdNote(o.adminNote || "");
    setOrdRefund(o.refundStatus || "none");
  };

  const saveOrderModeration = async () => {
    if (!moderateOrder) return;
    try {
      await apiFetch(`/api/admin/orders/${moderateOrder.id}`, {
        method: "PATCH",
        ...auth,
        json: {
          status: ordStatus,
          disputeOpen: ordDispute,
          adminNote: ordNote,
          refundStatus: ordRefund
        }
      });
      toast("Order updated", { variant: "success" });
      setModerateOrder(null);
      await loadOrders();
    } catch (ex) {
      await alert(ex.message || "Update failed", { variant: "error" });
    }
  };

  const quickRefund = async (o) => {
    const ok = await confirm(`Mark order ${shortId(o.id)} as refunded?`, {
      title: "Refund order",
      confirmLabel: "Refund"
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/admin/orders/${o.id}`, {
        method: "PATCH",
        ...auth,
        json: { refundStatus: "refunded" }
      });
      toast("Order marked refunded", { variant: "success" });
      if (tab === "orders") await loadOrders();
      if (tab === "payments") await loadRefundOrders();
    } catch (ex) {
      await alert(ex.message || "Refund failed", { variant: "error" });
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
      await alert(ex.message || "Update failed", { variant: "error" });
    }
  };

  /* Settings */
  const saveSettings = async () => {
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
          listingPolicyNote: settingsForm.listingPolicyNote
        }
      });
      toast("Settings saved", { variant: "success" });
      await loadSettings();
    } catch (ex) {
      await alert(ex.message || "Save failed", { variant: "error" });
    } finally {
      setSavingSettings(false);
    }
  };

  /* ---------------- Sidebar ---------------- */

  const pageMeta = PAGE_TITLES[tab] || PAGE_TITLES.dashboard;

  const sidebar = h(
    "aside",
    {
      className: `fixed inset-y-0 left-0 z-40 flex h-[100dvh] max-h-[100dvh] w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-white/10 bg-white/80 shadow-2xl backdrop-blur-2xl transition-transform dark:bg-night-900/80 lg:max-w-none lg:translate-x-0 ${
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      }`
    },
    [
      h(
        "div",
        { key: "top", className: "flex items-center justify-between gap-2 border-b border-white/10 px-5 py-4 dark:border-white/5" },
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
                "CampusMart"
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
              className: "tap-target rounded-xl p-2 lg:hidden",
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
        SIDEBAR_ITEMS.map((it) => {
          const active = tab === it.id;
          return h(
            "button",
            {
              key: it.id,
              type: "button",
              onClick: () => {
                setTab(it.id);
                setSidebarOpen(false);
              },
              className: `flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-900/30"
                  : "text-slate-700 hover:bg-white/60 dark:text-slate-200 dark:hover:bg-white/10"
              }`
            },
            [
              h(it.icon, { key: "i", className: "h-4 w-4" }),
              h("span", { key: "l" }, it.label)
            ]
          );
        })
      ),
      h(
        "div",
        { key: "foot", className: "border-t border-white/10 px-3 py-3 dark:border-white/5" },
        [
          h(
            "button",
            {
              key: "logout",
              type: "button",
              onClick: async () => {
                await logout();
                window.location.href = "/login";
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
        "sticky top-0 z-20 border-b border-white/10 bg-white/70 px-4 py-3 backdrop-blur-xl dark:bg-night-900/60 sm:px-6"
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
          h(ThemeToggleButton, { key: "th", dark, onToggle: toggle }),
          h(
            "div",
            {
              key: "chip",
              className:
                "flex min-w-0 max-w-[12rem] items-center gap-2 rounded-2xl border border-white/10 bg-white/50 px-2.5 py-1.5 dark:bg-white/5"
            },
            [
              h(Avatar, { key: "av", user, size: 28 }),
              h(
                "span",
                {
                  key: "n",
                  className: "min-w-0 truncate text-xs font-medium text-slate-800 dark:text-slate-100 sm:text-sm"
                },
                user?.displayName || user?.email || "Admin"
              )
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
                        { className: "text-xs uppercase text-slate-500 dark:text-slate-400" },
                        h("tr", null, [
                          h("th", { className: "py-2 pr-3" }, "Order"),
                          h("th", { className: "py-2 pr-3" }, "Total"),
                          h("th", { className: "py-2 pr-3" }, "Status"),
                          h("th", { className: "py-2 pr-3" }, "Date")
                        ])
                      ),
                      h(
                        "tbody",
                        { className: "divide-y divide-white/10" },
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
                                h(Badge, { tone: orderStatusTone(o.status) }, humanizeOrderStatus(o.status))
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
            `Last ${revenue?.days || 30} days · non-cancelled orders`
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
          { className: "w-full min-w-[900px] text-left text-sm" },
          [
            h(
              "thead",
              { className: "bg-white/30 text-xs uppercase text-slate-500 dark:bg-white/5 dark:text-slate-400" },
              h("tr", null, [
                h("th", { className: "px-4 py-3" }, "Name"),
                h("th", { className: "px-4 py-3" }, "Role"),
                h("th", { className: "px-4 py-3" }, "Email"),
                h("th", { className: "px-4 py-3" }, "Joined"),
                h("th", { className: "px-4 py-3" }, "Status"),
                h("th", { className: "px-4 py-3" }, "Actions")
              ])
            ),
            h(
              "tbody",
              { className: "divide-y divide-white/10" },
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
                          h(Badge, { tone: u.role === "admin" ? "warn" : "neutral" }, u.role)
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
                          { className: "px-4 py-3" },
                          h("div", { className: "flex flex-wrap items-center gap-1" }, [
                            h(
                              "button",
                              {
                                key: "v",
                                type: "button",
                                onClick: () => onOpenUserDetails(u),
                                title: "View activity",
                                className:
                                  "tap-target rounded-xl border border-slate-300/70 bg-white/50 px-2 py-1.5 text-xs font-medium hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                              },
                              [h(Eye, { key: "i", className: "h-3.5 w-3.5" })]
                            ),
                            h(
                              "button",
                              {
                                key: "pw",
                                type: "button",
                                onClick: () => openResetUser(u),
                                title: "Reset password",
                                className:
                                  "tap-target rounded-xl border border-slate-300/70 bg-white/50 px-2 py-1.5 text-xs font-medium hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                              },
                              [h(KeyRound, { key: "i", className: "h-3.5 w-3.5" })]
                            ),
                            u.accountStatus === "active"
                              ? h(
                                  "button",
                                  {
                                    key: "su",
                                    type: "button",
                                    onClick: () => patchUser(u.id, { accountStatus: "suspended" }),
                                    className:
                                      "rounded-xl border border-amber-300/50 bg-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-500/15 dark:text-amber-200"
                                  },
                                  "Suspend"
                                )
                              : h(
                                  "button",
                                  {
                                    key: "re",
                                    type: "button",
                                    onClick: () => patchUser(u.id, { accountStatus: "active" }),
                                    className:
                                      "rounded-xl border border-emerald-300/50 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-200"
                                  },
                                  "Restore"
                                ),
                            u.role !== "admin" && u.accountStatus !== "banned"
                              ? h(
                                  "button",
                                  {
                                    key: "ba",
                                    type: "button",
                                    onClick: () => onBanUser(u),
                                    className:
                                      "rounded-xl border border-rose-300/50 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-500/15 dark:text-rose-200"
                                  },
                                  "Ban"
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
      })
    ].filter(Boolean));
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
                          `${CATEGORY_LABELS[p.category] || p.category} · ${formatGhc(p.price)} · Stock ${p.stock ?? 0}`
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
              { className: "w-full min-w-[960px] text-left text-sm" },
              [
                h(
                  "thead",
                  { className: "bg-white/30 text-xs uppercase text-slate-500 dark:bg-white/5 dark:text-slate-400" },
                  h("tr", null, [
                    h("th", { className: "px-4 py-3" }, "Product"),
                    h("th", { className: "px-4 py-3" }, "Seller"),
                    h("th", { className: "px-4 py-3" }, "Category"),
                    h("th", { className: "px-4 py-3" }, "Price"),
                    h("th", { className: "px-4 py-3" }, "Stock"),
                    h("th", { className: "px-4 py-3" }, "Status"),
                    h("th", { className: "px-4 py-3" }, "Date"),
                    h("th", { className: "px-4 py-3" }, "Actions")
                  ])
                ),
                h(
                  "tbody",
                  { className: "divide-y divide-white/10" },
                  listings.length === 0
                    ? h("tr", { key: "e" }, h("td", { colSpan: 8, className: "px-4 py-12 text-center text-sm text-slate-500" }, "No listings found."))
                    : listings.map((p) =>
                        h(
                          "tr",
                          { key: p.id, className: "align-top hover:bg-white/5" },
                          [
                            h("td", { className: "px-4 py-3" }, h("div", { className: "flex items-center gap-3" }, [
                              h(
                                "div",
                                {
                                  key: "th",
                                  className:
                                    "h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-slate-900/10 dark:bg-white/5"
                                },
                                productThumb(p)
                                  ? h("img", { src: productThumb(p), alt: p.name, className: "h-full w-full object-cover" })
                                  : h("div", { className: "flex h-full items-center justify-center" }, h(Package, { className: "h-5 w-5 text-slate-400" }))
                              ),
                              h("div", { key: "n", className: "min-w-0" }, [
                                h(
                                  "p",
                                  { className: "truncate font-medium text-slate-900 dark:text-white" },
                                  p.name
                                ),
                                p.flagged
                                  ? h(
                                      "p",
                                      { className: "text-xs font-semibold text-amber-600 dark:text-amber-300" },
                                      "Flagged"
                                    )
                                  : null,
                                p.rejectionReason && p.status === "rejected"
                                  ? h(
                                      "p",
                                      { className: "mt-1 text-xs text-rose-600 dark:text-rose-300" },
                                      `Reason: ${p.rejectionReason}`
                                    )
                                  : null
                              ])
                            ])),
                            h("td", { className: "px-4 py-3 text-slate-700 dark:text-slate-200" }, p.sellerLabel || "—"),
                            h("td", { className: "px-4 py-3" }, CATEGORY_LABELS[p.category] || p.category || "—"),
                            h("td", { className: "px-4 py-3 font-medium" }, formatGhc(p.price)),
                            h("td", { className: "px-4 py-3" }, String(p.stock ?? 0)),
                            h("td", { className: "px-4 py-3" }, h(Badge, { tone: listingStatusTone(p.status) }, formatListingStatus(p.status))),
                            h("td", { className: "px-4 py-3 text-xs text-slate-500" }, fmtDate(p.createdAt)),
                            h("td", { className: "px-4 py-3" }, h("div", { className: "flex flex-wrap items-center gap-1" }, [
                              h(
                                "button",
                                {
                                  key: "vw",
                                  type: "button",
                                  onClick: () => setViewProduct(p),
                                  className:
                                    "tap-target rounded-xl border border-slate-300/70 bg-white/50 p-1.5 text-slate-700 hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10",
                                  title: "View"
                                },
                                h(Eye, { className: "h-3.5 w-3.5" })
                              ),
                              h(
                                "button",
                                {
                                  key: "ed",
                                  type: "button",
                                  onClick: () => openEditListing(p),
                                  className:
                                    "tap-target rounded-xl border border-slate-300/70 bg-white/50 p-1.5 text-slate-700 hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10",
                                  title: "Edit"
                                },
                                h(Edit3, { className: "h-3.5 w-3.5" })
                              ),
                              h(
                                "button",
                                {
                                  key: "fl",
                                  type: "button",
                                  onClick: () => toggleFlagListing(p),
                                  className: `tap-target rounded-xl border p-1.5 ${
                                    p.flagged
                                      ? "border-amber-400/50 bg-amber-500/15 text-amber-700 dark:text-amber-200"
                                      : "border-slate-300/70 bg-white/50 text-slate-700 hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                                  }`,
                                  title: p.flagged ? "Unflag" : "Flag"
                                },
                                h(Flag, { className: "h-3.5 w-3.5" })
                              ),
                              p.status !== "active"
                                ? h(
                                    "button",
                                    {
                                      key: "ap",
                                      type: "button",
                                      onClick: () => approveListing(p.id),
                                      className:
                                        "rounded-xl border border-emerald-300/50 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-200",
                                      title: "Approve"
                                    },
                                    "Approve"
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
                                        "rounded-xl border border-rose-300/50 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-500/15 dark:text-rose-200",
                                      title: "Reject"
                                    },
                                    "Reject"
                                  )
                                : null,
                              h(
                                "button",
                                {
                                  key: "dl",
                                  type: "button",
                                  onClick: () => deleteListing(p),
                                  className:
                                    "tap-target rounded-xl border border-rose-300/50 bg-rose-500/10 p-1.5 text-rose-700 hover:bg-rose-500/15 dark:text-rose-200",
                                  title: "Delete"
                                },
                                h(Trash2, { className: "h-3.5 w-3.5" })
                              )
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
            { className: "bg-white/30 text-xs uppercase text-slate-500 dark:bg-white/5 dark:text-slate-400" },
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
            { className: "divide-y divide-white/10" },
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
                        { className: "px-4 py-3 text-slate-500" },
                        o.platformFeeTotal != null ? formatGhc(o.platformFeeTotal) : "—"
                      ),
                      h(
                        "td",
                        { className: "px-4 py-3" },
                        h("div", { className: "flex flex-wrap items-center gap-1" }, [
                          h(Badge, { key: "s", tone: orderStatusTone(o.status) }, humanizeOrderStatus(o.status)),
                          o.disputeOpen ? h(Badge, { key: "d", tone: "warn" }, "Dispute") : null,
                          o.refundStatus && o.refundStatus !== "none"
                            ? h(Badge, { key: "r", tone: o.refundStatus === "refunded" ? "info" : "warn" }, o.refundStatus)
                            : null
                        ].filter(Boolean))
                      ),
                      h("td", { className: "px-4 py-3 text-xs text-slate-500" }, fmtDate(o.createdAt)),
                      h(
                        "td",
                        { className: "px-4 py-3" },
                        h("div", { className: "flex flex-wrap items-center gap-1" }, [
                          h(
                            "button",
                            {
                              key: "mo",
                              type: "button",
                              onClick: () => openOrderModeration(o),
                              className:
                                "rounded-xl border border-slate-300/70 bg-white/50 px-2.5 py-1.5 text-xs font-medium hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                            },
                            "Moderate"
                          ),
                          o.status !== "cancelled" && o.refundStatus !== "refunded"
                            ? h(
                                "button",
                                {
                                  key: "rf",
                                  type: "button",
                                  onClick: () => quickRefund(o),
                                  className:
                                    "rounded-xl border border-sky-300/50 bg-sky-500/10 px-2.5 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-500/15 dark:text-sky-200"
                                },
                                "Refund"
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
    const paidCount = paidOrders.length;
    const refundPending = refundOrders.filter((o) => o.refundStatus === "requested").length;
    return h("div", { className: "space-y-4" }, [
      h("div", { key: "stats", className: "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" }, [
        h(StatCard, {
          key: "rev",
          label: "Total revenue",
          value: formatGhc(revTotal),
          hint: `${revenue?.totals?.commissionPercent ?? 7}% of gross`,
          icon: DollarSign,
          tone: "success"
        }),
        h(StatCard, {
          key: "gross",
          label: "Gross volume",
          value: formatGhc(revGross),
          hint: `Last ${revenue?.days || 30} days`,
          icon: TrendingUp,
          tone: "info"
        }),
        h(StatCard, {
          key: "paid",
          label: "Paid orders",
          value: String(paidCount),
          hint: "Paid + delivered",
          icon: Wallet,
          tone: "info"
        }),
        h(StatCard, {
          key: "rf",
          label: "Pending refunds",
          value: String(refundPending),
          hint: "Awaiting admin action",
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
                { className: "bg-white/30 text-xs uppercase text-slate-500 dark:bg-white/5 dark:text-slate-400" },
                h("tr", null, [
                  h("th", { className: "px-4 py-3" }, "Transaction"),
                  h("th", { className: "px-4 py-3" }, "Type"),
                  h("th", { className: "px-4 py-3" }, "Customer"),
                  h("th", { className: "px-4 py-3" }, "Amount"),
                  h("th", { className: "px-4 py-3" }, "Platform fee"),
                  h("th", { className: "px-4 py-3" }, "Status"),
                  h("th", { className: "px-4 py-3" }, "Date")
                ])
              ),
              h(
                "tbody",
                { className: "divide-y divide-white/10" },
                paidOrders.length === 0
                  ? h("tr", { key: "e" }, h("td", { colSpan: 7, className: "px-4 py-12 text-center text-sm text-slate-500" }, "No transactions yet."))
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
                          h("td", { className: "px-4 py-3" }, h(Badge, { tone: orderStatusTone(o.status) }, humanizeOrderStatus(o.status))),
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
                  { className: "bg-white/30 text-xs uppercase text-slate-500 dark:bg-white/5 dark:text-slate-400" },
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
                  { className: "divide-y divide-white/10" },
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
                  { className: "bg-white/30 text-xs uppercase text-slate-500 dark:bg-white/5 dark:text-slate-400" },
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
                  { className: "divide-y divide-white/10" },
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
                            h("td", { className: "px-4 py-3" }, h(Badge, { tone: o.refundStatus === "refunded" ? "info" : "warn" }, o.refundStatus || "none")),
                            h("td", { className: "px-4 py-3 text-xs text-slate-500" }, fmtDate(o.createdAt)),
                            h("td", { className: "px-4 py-3" }, h("div", { className: "flex items-center gap-1" }, [
                              h(
                                "button",
                                {
                                  key: "mo",
                                  type: "button",
                                  onClick: () => {
                                    setTab("orders");
                                    setOrdersTab("all");
                                    openOrderModeration(o);
                                  },
                                  className:
                                    "rounded-xl border border-slate-300/70 bg-white/50 px-2.5 py-1.5 text-xs font-medium hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                                },
                                "Open"
                              ),
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
                                    "Mark refunded"
                                  )
                                : null
                            ].filter(Boolean)))
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

  const renderReports = () => {
    return h("div", { className: "space-y-4" }, [
      h("div", { key: "bar", className: "flex flex-wrap items-center justify-between gap-3" }, [
        h(TabBar, { key: "t", tabs: REPORT_TABS, value: reportsTab, onChange: setReportsTab }),
        h(
          "form",
          {
            key: "f",
            className: "flex items-center gap-2 sm:w-80",
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
              placeholder: "Search reports…",
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
      ]),
      h(
        GlassCard,
        { key: "tbl", className: "!overflow-x-auto !p-0" },
        h("table", { className: "w-full min-w-[880px] text-left text-sm" }, [
          h(
            "thead",
            { className: "bg-white/30 text-xs uppercase text-slate-500 dark:bg-white/5 dark:text-slate-400" },
            h("tr", null, [
              h("th", { className: "px-4 py-3" }, "Report"),
              h("th", { className: "px-4 py-3" }, "Type"),
              h("th", { className: "px-4 py-3" }, "Reporter"),
              h("th", { className: "px-4 py-3" }, "Target"),
              h("th", { className: "px-4 py-3" }, "Status"),
              h("th", { className: "px-4 py-3" }, "Date"),
              h("th", { className: "px-4 py-3" }, "Actions")
            ])
          ),
          h(
            "tbody",
            { className: "divide-y divide-white/10" },
            reports.length === 0
              ? h("tr", { key: "e" }, h("td", { colSpan: 7, className: "px-4 py-12 text-center text-sm text-slate-500" }, "No reports match."))
              : reports.map((r) =>
                  h(
                    "tr",
                    { key: r.id, className: "hover:bg-white/5" },
                    [
                      h("td", { className: "px-4 py-3 font-mono text-xs" }, shortId(r.id)),
                      h("td", { className: "px-4 py-3" }, REPORT_CATS[r.category] || r.category),
                      h("td", { className: "px-4 py-3 text-slate-700 dark:text-slate-200" }, r.reporterLabel || "—"),
                      h("td", { className: "px-4 py-3 text-slate-500" }, [
                        h("div", { key: "t", className: "capitalize" }, r.targetType),
                        r.targetId ? h("div", { key: "i", className: "font-mono text-[10px]" }, r.targetId.slice(-8)) : null
                      ].filter(Boolean)),
                      h("td", { className: "px-4 py-3" }, h(Badge, { tone: reportStatusTone(r.status) }, r.status)),
                      h("td", { className: "px-4 py-3 text-xs text-slate-500" }, fmtDate(r.createdAt)),
                      h("td", { className: "px-4 py-3" }, h("div", { className: "flex items-center gap-1" }, [
                        h(
                          "button",
                          {
                            key: "v",
                            type: "button",
                            onClick: () => {
                              setViewReport(r);
                              setReportNote(r.adminNote || "");
                            },
                            className:
                              "rounded-xl border border-slate-300/70 bg-white/50 px-2.5 py-1.5 text-xs font-medium hover:bg-white/80 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                          },
                          "Open"
                        ),
                        r.status !== "resolved"
                          ? h(
                              "button",
                              {
                                key: "rs",
                                type: "button",
                                onClick: () => patchReport(r, { status: "resolved" }),
                                className:
                                  "rounded-xl border border-emerald-300/50 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-200"
                              },
                              "Resolve"
                            )
                          : null
                      ].filter(Boolean)))
                    ]
                  )
                )
          )
        ])
      ),
      h(Pager, { key: "p", page: reportsPage, total: reportsTotal, limit: reportsLimit, onPage: setReportsPage })
    ]);
  };

  /* ---------------- Messages ---------------- */

  const renderMessages = () => {
    return h("div", { className: "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]" }, [
      h(
        GlassCard,
        { key: "list", className: "!p-0" },
        [
          h(
            "div",
            { key: "h", className: "border-b border-white/10 px-4 py-3 dark:border-white/5" },
            h("h2", { className: "font-semibold text-slate-900 dark:text-white" }, "Conversations")
          ),
          h(
            "div",
            { key: "b", className: "max-h-[60vh] divide-y divide-white/5 overflow-y-auto" },
            conversations.length === 0
              ? h("p", { className: "p-6 text-center text-sm text-slate-500" }, "No conversations yet.")
              : conversations.map((c) =>
                  h(
                    "button",
                    {
                      key: c.id,
                      type: "button",
                      onClick: () => setSelectedThreadId(c.id),
                      className: `flex w-full flex-col gap-1 px-4 py-3 text-left transition hover:bg-white/10 ${
                        selectedThreadId === c.id ? "bg-sky-500/10" : ""
                      }`
                    },
                    [
                      h(
                        "div",
                        { className: "flex items-center justify-between gap-2" },
                        [
                          h(
                            "span",
                            { className: "truncate font-medium text-slate-900 dark:text-white" },
                            `${c.buyerLabel} ↔ ${c.sellerLabel}`
                          ),
                          h(Badge, { tone: "info" }, String(c.messageCount))
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
          ? h(EmptyState, { title: "Select a conversation", hint: "Pick a thread on the left to review the full chat.", icon: MessageSquare })
          : h("div", { className: "space-y-3" }, [
              h(
                "div",
                { key: "h", className: "flex items-center justify-between gap-2 border-b border-white/10 pb-2 dark:border-white/5" },
                [
                  h(
                    "p",
                    { className: "font-semibold text-slate-900 dark:text-white" },
                    `${threadDetail.buyerLabel} ↔ ${threadDetail.sellerLabel}`
                  )
                ]
              ),
              h(
                "div",
                { key: "m", className: "max-h-[55vh] space-y-2 overflow-y-auto pr-1" },
                (threadDetail.messages || []).map((m, i) =>
                  h(
                    "div",
                    {
                      key: i,
                      className: `rounded-2xl border border-white/10 p-3 text-sm ${
                        m.senderRole === "buyer"
                          ? "ml-0 mr-8 bg-sky-500/10"
                          : m.senderRole === "seller"
                            ? "ml-8 mr-0 bg-fuchsia-500/10"
                            : "bg-white/10"
                      }`
                    },
                    [
                      h(
                        "p",
                        { className: "text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" },
                        `${m.senderRole} · ${fmtDateTime(m.createdAt)}`
                      ),
                      h("p", { className: "mt-1 whitespace-pre-wrap text-slate-800 dark:text-slate-100" }, m.text)
                    ]
                  )
                )
              )
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
                onClick: () => setSettingsTab(t.id),
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
    if (settingsTab === "general") {
      return h("div", { className: "space-y-4" }, [
        h("h3", { key: "t", className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, "General settings"),
        h(Field, { key: "n", label: "Site name" }, h(TextInput, {
          value: settingsForm.siteName,
          onChange: (e) => setSettingsForm((s) => ({ ...s, siteName: e.target.value }))
        })),
        h(Field, { key: "d", label: "Site description" }, h(TextArea, {
          rows: 3,
          value: settingsForm.siteDescription,
          onChange: (e) => setSettingsForm((s) => ({ ...s, siteDescription: e.target.value }))
        })),
        h(Field, { key: "e", label: "Admin email" }, h(TextInput, {
          type: "email",
          value: settingsForm.adminEmail,
          onChange: (e) => setSettingsForm((s) => ({ ...s, adminEmail: e.target.value }))
        })),
        h("p", { key: "note", className: "text-xs text-slate-500 dark:text-slate-400" }, "General fields are stored locally. Commission, payments, and policies below are synced with the backend."),
        h("div", { key: "b", className: "pt-2" }, h(Button, { loading: savingSettings, onClick: saveSettings }, "Save changes"))
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
            { id: "stripeEnabled", label: "Stripe checkout", icon: CreditCard, hint: "Requires Stripe keys in server env" },
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
      return h("div", { className: "space-y-4" }, [
        h("h3", { key: "t", className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, "Email templates"),
        h(InlineNotice, { key: "n", variant: "info" }, "Server transactional emails are configured via environment variables (SMTP host/user/pass). This panel lets you review the templates your server sends."),
        h(
          "ul",
          { key: "l", className: "space-y-2 text-sm" },
          [
            { id: "welcome", label: "Welcome email (new sign-ups)", body: "Delivered when a buyer/seller registers." },
            { id: "verify", label: "Email verification", body: "Sent with a one-time 6-digit code." },
            { id: "reset", label: "Password reset", body: "Sent when the user requests a password reset link." },
            { id: "order", label: "Order confirmation", body: "Sent to the buyer after successful checkout." },
            { id: "seller", label: "New-order vendor alert", body: "Notifies the seller of a new paid line item." },
            { id: "report", label: "Report acknowledgement", body: "Confirms the user's report was received." }
          ].map((t) =>
            h(
              "li",
              {
                key: t.id,
                className:
                  "flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/30 px-4 py-3 dark:bg-white/5"
              },
              [
                h("div", { key: "l" }, [
                  h("p", { className: "font-semibold text-slate-900 dark:text-white" }, t.label),
                  h("p", { className: "text-xs text-slate-500" }, t.body)
                ]),
                h("span", { key: "m", className: "inline-flex items-center gap-1 text-xs text-slate-500" }, [
                  h(Mail, { key: "i", className: "h-3.5 w-3.5" }),
                  "Template"
                ])
              ]
            )
          )
        )
      ]);
    }
    if (settingsTab === "rules") {
      return h("div", { className: "space-y-4" }, [
        h("h3", { key: "t", className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, "Listing rules & policy"),
        h("p", { key: "h", className: "text-sm text-slate-500 dark:text-slate-400" }, "Visible to your moderation team. Use it to capture rejection guidelines, prohibited items, and policy updates."),
        h(Field, { key: "p", label: "Policy note" }, h(TextArea, {
          rows: 10,
          value: settingsForm.listingPolicyNote,
          onChange: (e) => setSettingsForm((s) => ({ ...s, listingPolicyNote: e.target.value }))
        })),
        h("div", { key: "b", className: "pt-2" }, h(Button, { loading: savingSettings, onClick: saveSettings }, "Save policy"))
      ]);
    }
    return h("div", { className: "space-y-3" }, [
      h("h3", { key: "t", className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, "Other settings"),
      h(InlineNotice, { key: "n", variant: "info", title: "Platform snapshot" }, [
        h("ul", { className: "list-inside list-disc" }, [
          h("li", { key: "1" }, `Commission: ${settings?.commissionPercent ?? "—"}%`),
          h("li", { key: "2" }, `MoMo: ${settings?.momoEnabled ? "On" : "Off"}`),
          h("li", { key: "3" }, `Stripe: ${settings?.stripeEnabled ? "On" : "Off"}`),
          h("li", { key: "4" }, `Bank transfer: ${settings?.bankEnabled ? "On" : "Off"}`)
        ])
      ])
    ]);
  };

  /* ---------------- System logs ---------------- */

  const renderLogs = () => {
    const orders = (dashboard?.recent?.orders || []).map((o) => ({
      ts: o.createdAt,
      icon: ShoppingCart,
      tone: "info",
      title: `Order ${shortId(o.id)} — ${humanizeOrderStatus(o.status)}`,
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
    const all = [...orders, ...signups, ...listingsEvents].sort(
      (a, b) => new Date(b.ts || 0) - new Date(a.ts || 0)
    );
    if (all.length === 0) {
      return h(EmptyState, { title: "No activity yet", hint: "Recent orders, signups, and listings appear here.", icon: Activity });
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
                  h(Badge, { key: "r", tone: "neutral" }, viewUser.user.role),
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
                        h("span", { className: "text-xs" }, humanizeOrderStatus(o.status)),
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

  const resetModal = resetUser
    ? h(
        Modal,
        { open: true, onClose: () => setResetUser(null), title: `Reset password for ${resetUser.displayName || resetUser.email || "user"}`, size: "sm" },
        h("div", { className: "space-y-3" }, [
          h(InlineNotice, { key: "n", variant: "warning" }, "The user will lose their current password. Share the new one over a secure channel."),
          h(Field, { key: "f", label: "New password (min 8 chars)" }, h(TextInput, {
            value: resetPwd,
            onChange: (e) => setResetPwd(e.target.value)
          })),
          h("div", { key: "b", className: "flex flex-wrap justify-end gap-2" }, [
            h(Button, { key: "r", variant: "ghost", onClick: () => setResetPwd(generatePassword(12)) }, "Generate"),
            h(Button, { key: "c", variant: "ghost", onClick: () => copyToClipboard(resetPwd) }, "Copy"),
            h(Button, { key: "s", onClick: submitResetPwd }, "Save password")
          ])
        ])
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
            h(Field, { key: "s", label: "Stock" }, h(TextInput, {
              type: "number",
              min: 0,
              value: editForm.stock,
              onChange: (e) => setEditForm((s) => ({ ...s, stock: e.target.value }))
            }))
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
          h("p", { key: "p", className: "text-slate-700 dark:text-slate-200" }, `Price: ${formatGhc(viewProduct.price)} · Stock: ${viewProduct.stock ?? 0}`),
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

  const orderModal = moderateOrder
    ? h(
        Modal,
        { open: true, onClose: () => setModerateOrder(null), title: `Moderate order ${shortId(moderateOrder.id)}`, size: "md" },
        h("div", { className: "space-y-3" }, [
          h("p", { key: "buy", className: "text-sm text-slate-500" }, `Buyer: ${moderateOrder.buyerContact?.displayName || moderateOrder.buyerContact?.email || "—"}`),
          h("p", { key: "tot", className: "text-sm font-semibold" }, `Total ${formatGhc(moderateOrder.total || 0)} · Platform fee ${formatGhc(moderateOrder.platformFeeTotal || 0)}`),
          h("div", { key: "grid", className: "grid grid-cols-1 gap-3 sm:grid-cols-2" }, [
            h(Field, { key: "s", label: "Status" }, h(SelectInput, {
              value: ordStatus,
              onChange: (e) => setOrdStatus(e.target.value)
            }, ORDER_STATUS_OPTS.map((s) => h("option", { key: s, value: s }, humanizeOrderStatus(s))))),
            h(Field, { key: "r", label: "Refund" }, h(SelectInput, {
              value: ordRefund,
              onChange: (e) => setOrdRefund(e.target.value)
            }, REFUND_OPTS.map((s) => h("option", { key: s, value: s }, s))))
          ]),
          h("label", { key: "dis", className: "flex items-center gap-2 text-sm" }, [
            h("input", {
              type: "checkbox",
              checked: ordDispute,
              onChange: (e) => setOrdDispute(e.target.checked)
            }),
            " Mark as disputed / needs attention"
          ]),
          h(Field, { key: "n", label: "Internal note (admin only)" }, h(TextArea, {
            rows: 3,
            value: ordNote,
            onChange: (e) => setOrdNote(e.target.value)
          })),
          Array.isArray(moderateOrder.items) && moderateOrder.items.length > 0
            ? h(
                "div",
                { key: "lines", className: "rounded-2xl border border-white/10 p-2 text-xs" },
                [
                  h("p", { key: "t", className: "mb-1 font-semibold uppercase tracking-wide text-slate-500" }, "Line items"),
                  h(
                    "ul",
                    { className: "space-y-1" },
                    moderateOrder.items.map((it, i) =>
                      h("li", { key: i, className: "flex justify-between gap-2" }, [
                        h("span", { className: "truncate" }, `${it.name} × ${it.quantity}`),
                        h("span", { className: "font-medium" }, formatGhc((it.unitPrice || 0) * (it.quantity || 0)))
                      ])
                    )
                  )
                ]
              )
            : null,
          h("div", { key: "b", className: "flex flex-wrap justify-end gap-2" }, [
            h(Button, { key: "c", variant: "ghost", onClick: () => setModerateOrder(null) }, "Close"),
            h(Button, { key: "s", onClick: saveOrderModeration }, "Save changes")
          ])
        ].filter(Boolean))
      )
    : null;

  const reportModal = viewReport
    ? h(
        Modal,
        { open: true, onClose: () => setViewReport(null), title: `Report ${shortId(viewReport.id)}`, size: "md" },
        h("div", { className: "space-y-3 text-sm" }, [
          h("p", { key: "c", className: "text-slate-500" }, `${REPORT_CATS[viewReport.category] || viewReport.category} · ${viewReport.targetType}${viewReport.targetId ? ` · ${viewReport.targetId}` : ""}`),
          h("p", { key: "r", className: "font-semibold" }, `Reporter: ${viewReport.reporterLabel || "—"}`),
          h("p", { key: "d", className: "whitespace-pre-wrap rounded-2xl border border-white/10 bg-white/5 p-3" }, viewReport.description),
          h(Field, { key: "n", label: "Admin note" }, h(TextArea, {
            rows: 4,
            value: reportNote,
            onChange: (e) => setReportNote(e.target.value)
          })),
          h("div", { key: "b", className: "flex flex-wrap justify-end gap-2" }, [
            h(Button, { key: "ir", variant: "ghost", onClick: () => patchReport(viewReport, { status: "in_review", adminNote: reportNote }) }, "Mark in progress"),
            h(Button, { key: "rs", onClick: () => patchReport(viewReport, { status: "resolved", adminNote: reportNote }) }, "Resolve"),
            h(Button, { key: "dm", variant: "danger", onClick: () => patchReport(viewReport, { status: "dismissed", adminNote: reportNote }) }, "Dismiss")
          ])
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
        h("div", { key: "gutter", className: "w-0 shrink-0 lg:w-72", "aria-hidden": true }),
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
      resetModal,
      rejectModal,
      editModal,
      viewProductModal,
      orderModal,
      reportModal
    ].filter(Boolean)
  );
}
