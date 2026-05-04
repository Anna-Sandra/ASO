import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Box,
  Camera,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  PlusCircle,
  Send,
  Settings,
  ShoppingCart,
  Star,
  Trash2,
  X
} from "lucide-react";
import { useAuth } from "./AuthContext";
import { useNotice } from "./NoticeContext";
import { useTheme } from "./ThemeContext";
import { apiFetch, apiUploadProductImages, apiUploadProfileImage, deleteAuthenticatedAccount } from "./api";
import { trackVendorAnalyticsEvent, VendorRevenueLineChart } from "./vendorCharts";
import { CATEGORY_LABELS, PRODUCT_CATEGORY_VALUES, refFromId } from "./catalog";
import { formatGhc } from "./money";
import { h, f } from "./h";
import {
  Badge,
  Button,
  Field,
  GlassCard,
  GlassPanel,
  InlineNotice,
  LogoMark,
  RefImage,
  SelectInput,
  TextArea,
  TextInput,
  ThemeToggleButton
} from "./ui";

/** Must match backend `MAX_PRODUCT_GALLERY_IMAGES` in `backend/src/config/productLimits.ts`. */
const MAX_PRODUCT_IMAGES = 500;
/** Must match backend `MAX_PRODUCT_IMAGES_PER_UPLOAD`. */
const UPLOAD_IMAGES_CHUNK = 40;

/**
 * Avatar letter: display name first, else email local-part.
 * @param {{ displayName?: string; email?: string; phone?: string } | null | undefined} u
 */
function vendorAvatarInitial(u) {
  if (!u) return "V";
  const name = String(u.displayName || "").trim();
  if (name.length) {
    const ch = name.charAt(0);
    if (/[a-zA-Z]/i.test(ch)) return ch.toUpperCase();
    if (/[0-9]/.test(ch)) return ch;
  }
  const em = String(u.email || "").trim();
  if (em.length) {
    const local = em.split("@")[0] || em;
    const ch = local.charAt(0);
    if (/[a-zA-Z0-9]/.test(ch)) return ch.toUpperCase();
  }
  return "V";
}

function vendorUserAvatarNode(u, { sizeClass = "h-8 w-8", initialTextClass = "text-sm" } = {}) {
  const src = u?.profileImageUrl && String(u.profileImageUrl).trim();
  if (src) {
    return h("img", { src, alt: "", className: `${sizeClass} shrink-0 rounded-full object-cover` });
  }
  return h(
    "span",
    {
      className: `flex ${sizeClass} shrink-0 items-center justify-center rounded-full bg-sky-600 ${initialTextClass} font-bold text-white`
    },
    vendorAvatarInitial(u)
  );
}

function VendorProductPhotos({ accessToken, imageList, setImageList, setErr }) {
  const fileInputId = useId().replace(/:/g, "");
  const onPick = async (e) => {
    setErr("");
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length || !accessToken) return;
    const room = MAX_PRODUCT_IMAGES - imageList.length;
    if (room <= 0) {
      setErr(`You can add at most ${MAX_PRODUCT_IMAGES} images per product.`);
      return;
    }
    const queue = files.slice(0, room);
    try {
      const allUrls = [];
      for (let i = 0; i < queue.length; i += UPLOAD_IMAGES_CHUNK) {
        const chunk = queue.slice(i, i + UPLOAD_IMAGES_CHUNK);
        const data = await apiUploadProductImages(chunk, accessToken);
        const urls = data.urls || [];
        allUrls.push(...urls);
      }
      setImageList((prev) => [...prev, ...allUrls]);
    } catch (ex) {
      setErr(ex.message || "Upload failed");
    }
  };
  const remove = (idx) => setImageList((prev) => prev.filter((_, i) => i !== idx));

  return h(Field, { label: "Product photos" }, h("div", { className: "space-y-3" }, [
    h(
      "p",
      { key: "ph-hint", className: "text-xs text-slate-500 dark:text-slate-400" },
      `Add many photos (JPEG, PNG, WebP, or GIF — max 5 MB each, up to ${MAX_PRODUCT_IMAGES} per product). Large selections upload in batches. They appear on the buyer storefront.`
    ),
    h("div", { key: "row", className: "flex flex-wrap items-center gap-2" }, [
      h("input", {
        key: "inp",
        id: fileInputId,
        type: "file",
        accept: "image/jpeg,image/png,image/webp,image/gif",
        multiple: true,
        className: "sr-only",
        onChange: onPick
      }),
      h(
        "label",
        {
          key: "lbl",
          htmlFor: fileInputId,
          className:
            "tap-target inline-flex cursor-pointer items-center justify-center rounded-2xl border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-500/20 dark:text-sky-200 dark:hover:bg-sky-500/15"
        },
        "Choose images"
      ),
      h("span", { key: "count", className: "text-xs text-slate-500 dark:text-slate-400" }, `${imageList.length} / ${MAX_PRODUCT_IMAGES}`)
    ]),
    imageList.length > 0
      ? h(
          "ul",
          { key: "previews", className: "grid grid-cols-2 gap-3 sm:grid-cols-3" },
          imageList.map((url, idx) =>
            h("li", { key: `${url}-${idx}`, className: "relative overflow-hidden rounded-2xl border border-white/10" }, [
              h("img", { key: "img", src: url, alt: "", className: "h-28 w-full object-cover" }),
              h(
                "button",
                {
                  key: "rm",
                  type: "button",
                  className:
                    "absolute right-2 top-2 rounded-full bg-night-950/80 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-600",
                  onClick: () => remove(idx)
                },
                "Remove"
              )
            ])
          )
        )
      : null
  ].filter(Boolean)));
}

function NavItem({ to, icon: Icon, children, badge, end }) {
  return h(NavLink, {
    to,
    end: Boolean(end),
    className: ({ isActive }) =>
      `flex items-center justify-between gap-2 rounded-2xl px-3 py-2.5 text-sm font-medium transition sm:px-4 sm:text-base ${
        isActive
          ? "bg-gradient-to-r from-sky-600/90 to-blue-700/90 text-white shadow-lg shadow-sky-900/30"
          : "text-slate-700 hover:bg-white/40 dark:text-slate-200 dark:hover:bg-white/10"
      }`,
    children: ({ isActive }) =>
      h(f, null, [
        h("span", { key: "left", className: "flex items-center gap-2" }, [
          h(Icon, { key: "ic", className: `h-4 w-4 sm:h-5 sm:w-5 ${isActive ? "text-white" : ""}` }),
          h("span", { key: "tx" }, children)
        ]),
        badge != null &&
          badge > 0 &&
          h(
            "span",
            {
              key: "badge",
              className: `rounded-full px-2 py-0.5 text-[10px] font-bold ${
                isActive ? "bg-white/20 text-white" : "bg-amber-400/20 text-amber-800 dark:text-amber-200"
              }`
            },
            String(badge)
          )
      ])
  });
}

function humanizeOrderStatus(s) {
  return String(s || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Match API enums even if a legacy payload used spaces or different casing. */
function normalizeOrderStatus(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function VendorShell() {
  const { dark, toggle } = useTheme();
  const { user, accessToken, logout, setUser } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [orderBadge, setOrderBadge] = useState(0);

  /** Keep payout banner in sync with `/api/auth/me` (login payload used to omit Paystack flags). */
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    apiFetch("/api/auth/me", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => {
        if (!cancelled && d?.user) setUser(d.user);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [accessToken, setUser]);

  const refreshOrderBadge = () => {
    if (!accessToken || user?.role !== "seller") {
      setOrderBadge(0);
      return;
    }
    apiFetch("/api/vendor/orders", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => {
        const list = d.orders || [];
        const n = list.filter((o) =>
          ["pending_payment", "awaiting_vendor_payment", "paid", "processing", "sent_for_delivery"].includes(o.status)
        ).length;
        setOrderBadge(n);
      })
      .catch(() => setOrderBadge(0));
  };

  useEffect(() => {
    refreshOrderBadge();
    const onVis = () => {
      if (document.visibilityState === "visible") refreshOrderBadge();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [accessToken, user?.role]);

  const onLogout = async () => {
    await logout();
    nav("/login", { replace: true });
  };

  const sidebar = h(
    "aside",
    {
      className: `fixed inset-y-0 left-0 z-40 flex h-[100dvh] max-h-[100dvh] w-60 max-w-[85vw] flex-col overflow-y-auto border-r border-white/10 bg-white/35 p-4 shadow-2xl backdrop-blur-2xl transition-transform dark:bg-night-900/50 lg:max-w-none lg:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      }`
    },
    [
      h("div", { key: "mobile-head", className: "mb-6 flex items-center justify-between gap-2 lg:hidden" }, [
        h("span", { key: "label", className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, "Menu"),
        h(
          "button",
          {
            key: "close",
            type: "button",
            className: "tap-target rounded-xl p-2 hover:bg-white/10",
            onClick: () => setOpen(false)
          },
          h(X, { className: "h-5 w-5" })
        )
      ]),
      h("div", { key: "main-title", className: "mb-6 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400" }, "Main"),
      h("nav", { key: "main-nav", className: "space-y-1" }, [
        h(NavItem, { key: "n-dash", to: "/vendor/dashboard", icon: LayoutDashboard }, "Dashboard"),
        h(NavItem, { key: "n-prod", to: "/vendor/products", icon: Box, end: true }, "My products"),
        h(NavItem, { key: "n-add", to: "/vendor/products/new", icon: PlusCircle }, "Add product"),
        h(NavItem, { key: "n-orders", to: "/vendor/orders", icon: ShoppingCart, badge: orderBadge }, "Orders"),
        h(NavItem, { key: "n-msg", to: "/vendor/messages", icon: MessageSquare }, "Messages"),
        h(NavItem, { key: "n-rep", to: "/vendor/reports", icon: AlertTriangle }, "Reports")
      ]),
      h("div", { key: "ins-title", className: "mb-2 mt-6 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400" }, "Insights"),
      h("nav", { key: "ins-nav", className: "space-y-1" }, [
        h(NavItem, { key: "n-reviews", to: "/vendor/reviews", icon: Star }, "Reviews")
      ]),
      h("div", { key: "set-title", className: "mb-2 mt-6 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400" }, "Settings"),
      h("nav", { key: "set-nav", className: "space-y-1" }, [
        h(NavItem, { key: "n-settings", to: "/vendor/settings", icon: Settings }, "Store settings")
      ]),
      h("div", { key: "sidebar-spacer", className: "min-h-0 flex-1" }),
      h(
        GlassCard,
        { key: "hub-card", className: "mt-auto !border-sky-500/20 !bg-gradient-to-br !from-sky-900/80 !to-night-950 !p-4" },
        [
          h("p", { key: "t", className: "text-xs font-bold uppercase tracking-wide text-sky-200" }, "Vendor hub"),
          h("p", { key: "d", className: "mt-1 text-xs text-white/80" }, "Manage listings, orders, and payouts from one place.")
        ]
      )
    ]
  );

  return h("div", { className: "min-h-screen bg-slate-100 dark:bg-night-950 dark:bg-mesh-dark" }, [
    open &&
      h("button", {
        key: "overlay",
        type: "button",
        className: "fixed inset-0 z-30 bg-slate-950/50 backdrop-blur-sm lg:hidden",
        onClick: () => setOpen(false),
        "aria-label": "Close menu"
      }),
    h("div", { key: "layout", className: "flex min-h-screen" }, [
      h("div", { key: "sidebar-gutter", className: "w-0 shrink-0 lg:w-60", "aria-hidden": true }),
      sidebar,
      h("div", { key: "content-wrap", className: "flex min-h-screen min-w-0 flex-1 flex-col" }, [
        h(
          "header",
          {
            key: "header",
            className:
              "sticky top-0 z-20 border-b border-white/10 bg-white/30 px-4 py-3 backdrop-blur-xl dark:bg-night-900/40 sm:px-6"
          },
          h("div", { key: "header-inner", className: "mx-auto flex max-w-7xl items-center justify-between gap-3" }, [
            h(
              "button",
              {
                key: "menu-btn",
                type: "button",
                className: "tap-target rounded-2xl border border-white/15 p-2 lg:hidden",
                onClick: () => setOpen(true)
              },
              h(Menu, { className: "h-5 w-5" })
            ),
            h("div", { key: "brand", className: "flex items-center gap-2" }, [
              h(LogoMark, { key: "logo", className: "h-9 w-9" }),
              h("span", { key: "name", className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, "Campus Mart"),
              h(
                "span",
                {
                  key: "badge",
                  className:
                    "hidden rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900 dark:text-amber-200 sm:inline"
                },
                "Vendor"
              )
            ]),
            h("div", { key: "actions", className: "flex items-center gap-2 sm:gap-3" }, [
              h(ThemeToggleButton, { key: "theme", dark, onToggle: toggle }),
              h(
                "div",
                {
                  key: "user-chip",
                  className:
                    "flex min-w-0 max-w-[min(12rem,38vw)] items-center gap-2 rounded-2xl border border-white/10 bg-white/20 px-2.5 py-1.5 sm:max-w-[14rem] sm:px-3 dark:bg-white/5",
                  title: user?.displayName || user?.email || "Vendor"
                },
                [
                  h("div", { key: "avatar", className: "shrink-0" }, vendorUserAvatarNode(user, { sizeClass: "h-8 w-8" })),
                  h(
                    "span",
                    {
                      key: "display",
                      className: "min-w-0 truncate text-xs font-medium text-slate-800 dark:text-slate-100 sm:text-sm"
                    },
                    user?.displayName || user?.email || "Vendor"
                  )
                ]
              ),
              h(
                "button",
                {
                  key: "hdr-logout",
                  type: "button",
                  onClick: onLogout,
                  className:
                    "tap-target flex shrink-0 items-center gap-1.5 rounded-2xl border border-white/10 bg-white/10 px-2.5 py-2 text-xs font-medium text-slate-700 hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:text-rose-300",
                  title: "Log out",
                  "aria-label": "Log out"
                },
                [
                  h(LogOut, { key: "lo-ic", className: "h-4 w-4 sm:h-5 sm:w-5" }),
                  h("span", { key: "lo-tx", className: "hidden sm:inline" }, "Log out")
                ]
              )
            ])
          ])
        ),
        h("main", { key: "main", className: "mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6" }, [
          user?.role === "seller" && !user?.paystackPayoutRegistered
            ? h(
                InlineNotice,
                {
                  key: "paystack-banner",
                  variant: "warning",
                  title: "Register Paystack payouts",
                  className: "mb-5"
                },
                h("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" }, [
                  h(
                    "p",
                    { key: "blurb", className: "min-w-0" },
                    "You need to link your bank in Store settings so Paystack can pay out your share when buyers use card or MoMo. Do this as soon as you can."
                  ),
                  h(
                    Link,
                    { key: "set", to: "/vendor/settings#vendor-paystack-payouts", className: "shrink-0" },
                    h(Button, { className: "!min-h-10 w-full !px-4 !py-2.5 !text-sm sm:w-auto" }, "Register in Store settings")
                  )
                ])
              )
            : null,
          h(Outlet, { key: "out" })
        ])
      ])
    ])
  ]);
}

function KpiIcon({ name }) {
  const map = {
    wallet: Package,
    package: Box,
    "shopping-bag": ShoppingCart,
    star: Star
  };
  const Icon = map[name] || BarChart3;
  return h(
    "div",
    {
      className:
        "flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-600 dark:text-sky-300"
    },
    h(Icon, { className: "h-5 w-5" })
  );
}

export function VendorDashboardPage() {
  const { accessToken, user } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!accessToken) return;
    trackVendorAnalyticsEvent(accessToken, { type: "dashboard_view" });
    let cancelled = false;
    setErr("");
    Promise.all([
      apiFetch("/api/vendor/analytics?days=30", { headers: { Authorization: `Bearer ${accessToken}` } }),
      apiFetch("/api/vendor/orders", { headers: { Authorization: `Bearer ${accessToken}` } })
    ])
      .then(([a, o]) => {
        if (cancelled) return;
        setErr("");
        setAnalytics(a);
        setRecentOrders((o.orders || []).slice(0, 5));
      })
      .catch((ex) => {
        if (!cancelled) setErr(ex.message || "Failed to load dashboard");
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const kpis = useMemo(() => {
    if (!analytics) return [];
    return [
      { label: "Active listings", value: String(analytics.productCount ?? 0), delta: "Products", icon: "package" },
      { label: "Orders (paid+)", value: String(analytics.orderCount ?? 0), delta: "All time", icon: "shopping-bag" },
      { label: "Revenue", value: formatGhc(analytics.revenue || 0), delta: "All time", icon: "wallet" },
      { label: "Reviews", value: String(analytics.reviewCount ?? 0), delta: "On your products", icon: "star" }
    ];
  }, [analytics]);

  const dailyChart = useMemo(() => analytics?.chart?.daily || [], [analytics]);

  const greet = user?.displayName?.trim() || user?.email?.split("@")[0] || "there";

  return h(f, null, [
    err
      ? h(InlineNotice, { key: "err", variant: "error", className: "mb-4", onDismiss: () => setErr("") }, err)
      : null,
    !analytics && !err && h("p", { key: "loading", className: "mb-4 text-sm text-slate-500 dark:text-slate-400" }, "Loading dashboard…"),
    h("div", { key: "hero", className: "mb-6 flex flex-wrap items-center justify-between gap-3" }, [
      h("div", { key: "hero-copy" }, [
        h("h1", { key: "title", className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, `Good day, ${greet}`),
        h("p", { key: "subtitle", className: "text-sm text-slate-600 dark:text-slate-400" }, "Here is how your store is performing.")
      ]),
      h(
        Link,
        { key: "add-link", to: "/vendor/products/new" },
        h(Button, { className: "!rounded-full" }, [h(PlusCircle, { key: "ic", className: "h-4 w-4" }), h("span", { key: "tx" }, "Add product")])
      )
    ]),
    h("div", { key: "kpis", className: "mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" }, [
      kpis.map((k) =>
        h(GlassCard, { key: k.label }, [
          h("div", { key: "row", className: "flex items-start justify-between gap-3" }, [
            h("div", { key: "copy" }, [
              h("p", { key: "lb", className: "text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, k.label),
              h("p", { key: "val", className: "mt-2 text-2xl font-bold text-slate-900 dark:text-white" }, k.value),
              h("p", { key: "dl", className: "mt-1 text-xs font-medium text-emerald-500 dark:text-emerald-400" }, k.delta)
            ]),
            h(KpiIcon, { key: "ic", name: k.icon })
          ])
        ])
      )
    ]),
    h("div", { key: "charts", className: "grid grid-cols-1 gap-6 lg:grid-cols-3" }, [
      h(GlassPanel, { key: "revenue-panel", className: "lg:col-span-2 !overflow-hidden !p-0" }, [
        h("div", { key: "revenue-head", className: "border-b border-white/10 px-4 py-3 dark:border-white/5 sm:px-5" }, [
          h("h2", { key: "title", className: "text-lg font-semibold text-slate-900 dark:text-white" }, "Revenue snapshot"),
          h(
            "p",
            { key: "note", className: "mt-0.5 text-xs text-slate-500 dark:text-slate-400" },
            "Your proceeds from paid orders, by calendar day (UTC). Same series as Analytics."
          )
        ]),
        dailyChart.length
          ? h("div", { key: "rev-chart", className: "px-2 pb-2 pt-1 sm:px-3" }, h(VendorRevenueLineChart, { daily: dailyChart }))
          : h(
              "p",
              { key: "rev-empty", className: "px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400 sm:px-5" },
              "Chart data will appear after your first paid orders."
            )
      ]),
      h(GlassPanel, { key: "top-products" }, [
        h("h2", { key: "title", className: "text-lg font-semibold text-slate-900 dark:text-white" }, "Top products"),
        h(
          "ul",
          { key: "list", className: "mt-4 space-y-2 text-sm" },
          (analytics?.topProducts || []).slice(0, 5).map((r) =>
            h("li", { key: r.productId, className: "flex items-center justify-between gap-2" }, [
              h("span", { key: "name", className: "truncate text-slate-600 dark:text-slate-300" }, r.name),
              h("span", { key: "rev", className: "shrink-0 font-semibold text-slate-900 dark:text-white" }, formatGhc(r.revenue))
            ])
          )
        ),
        (!analytics?.topProducts || analytics.topProducts.length === 0) &&
          h("p", { key: "empty", className: "mt-2 text-sm text-slate-500 dark:text-slate-400" }, "No sales yet — add products and share your shop.")
      ])
    ]),
    h("div", { key: "recent", className: "mt-8" }, [
      h("div", { key: "head", className: "mb-3 flex items-center justify-between" }, [
        h("h2", { key: "title", className: "text-lg font-semibold text-slate-900 dark:text-white" }, "Recent orders"),
        h(Link, { key: "view-all", to: "/vendor/orders", className: "text-sm font-semibold text-sky-600 hover:underline dark:text-sky-300" }, "View all →")
      ]),
      h(
        GlassCard,
        { key: "card", className: "!overflow-hidden !p-0" },
        h(
          "div",
          { className: "divide-y divide-white/10" },
          recentOrders.length === 0
            ? h("p", { key: "empty", className: "px-4 py-6 text-sm text-slate-500 dark:text-slate-400" }, "No orders yet.")
            : recentOrders.map((o) =>
                h(
                  "div",
                  { key: o.id, className: "flex flex-wrap items-center justify-between gap-2 px-4 py-3" },
                  [
                    h("span", { key: "id", className: "font-mono text-sm text-slate-600 dark:text-slate-300" }, `#${o.id.slice(-8)}`),
                    h("span", { key: "total", className: "text-sm text-slate-900 dark:text-white" }, formatGhc(o.vendorLineGross ?? o.total)),
                    h(Badge, { key: "st", tone: "neutral" }, humanizeOrderStatus(o.status))
                  ]
                )
              )
        )
      )
    ])
  ]);
}

function productStatusTone(st) {
  if (st === "active") return "success";
  if (st === "draft") return "warn";
  if (st === "pending_approval") return "warn";
  if (st === "rejected") return "danger";
  return "neutral";
}

function formatProductStatus(st) {
  if (st === "pending_approval") return "Pending review";
  if (st === "rejected") return "Rejected";
  if (st === "active") return "Live";
  if (st === "draft") return "Draft";
  return st || "—";
}

export function VendorProductsPage() {
  const { accessToken } = useAuth();
  const { alert, confirm } = useNotice();
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!accessToken) return;
    setErr("");
    setLoading(true);
    apiFetch("/api/products/mine", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => setRows(d.products || []))
      .catch((ex) => setErr(ex.message || "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    trackVendorAnalyticsEvent(accessToken, { type: "products_list_view" });
  }, [accessToken]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((p) => p.name?.toLowerCase().includes(t) || p.category?.toLowerCase().includes(t));
  }, [rows, q]);

  const del = async (id) => {
    if (!accessToken) return;
    const ok = await confirm("Delete this product? You can’t undo this.", {
      title: "Remove listing?",
      confirmLabel: "Delete",
      cancelLabel: "Keep"
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/products/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
      load();
    } catch (ex) {
      await alert(ex.message || "Delete failed", { variant: "error", title: "Couldn’t delete" });
    }
  };

  return h(f, null, [
    err ? h(InlineNotice, { key: "err", variant: "error", className: "mb-4", onDismiss: () => setErr("") }, err) : null,
    h("div", { key: "hdr-row", className: "mb-6 flex flex-wrap items-center justify-between gap-3" }, [
      h("h1", { className: "flex items-center gap-2 font-display text-2xl font-bold text-slate-900 dark:text-white" }, [
        h(Box, { className: "h-7 w-7 text-sky-400" }),
        "My products"
      ]),
      h("div", { className: "flex flex-1 flex-wrap items-center gap-2 sm:flex-initial" }, [
        h(TextInput, {
          placeholder: "Search products…",
          className: "!min-w-[200px] flex-1 sm:max-w-xs",
          value: q,
          onChange: (e) => setQ(e.target.value)
        }),
        h(Link, { key: "add-new", to: "/vendor/products/new" }, h(Button, { className: "!rounded-full" }, [h(PlusCircle, { key: "pic", className: "h-4 w-4" }), "Add product"]))
      ])
    ]),
    loading ? h("p", { key: "loading", className: "mb-4 text-sm text-slate-500" }, "Loading…") : null,
    h(GlassCard, { key: "table-wrap", className: "!overflow-x-auto !p-0" }, h("table", { className: "w-full min-w-[640px] text-left text-sm" }, [
      h("thead", { className: "border-b border-white/10 bg-white/20 text-xs uppercase text-slate-500 dark:bg-white/5 dark:text-slate-400" }, h("tr", null, [
        h("th", { key: "h-prod", className: "px-4 py-3" }, "Product"),
        h("th", { key: "h-cat", className: "px-4 py-3" }, "Category"),
        h("th", { key: "h-price", className: "px-4 py-3" }, "Price"),
        h("th", { key: "h-stock", className: "px-4 py-3" }, "Stock"),
        h("th", { key: "h-st", className: "px-4 py-3" }, "Status"),
        h("th", { key: "h-act", className: "px-4 py-3" }, "Actions")
      ])),
      h(
        "tbody",
        { className: "divide-y divide-white/10" },
        filtered.map((row, i) =>
          h("tr", { key: row.id || `product-${i}`, className: "hover:bg-white/10" }, [
            h("td", { key: "c-name", className: "px-4 py-3" }, h("div", { className: "flex items-center gap-3" }, [
              h(RefImage, {
                key: "img",
                src: row.imageUrls?.[0],
                n: refFromId(row.id),
                alt: row.name,
                className: "h-10 w-10 rounded-lg object-cover"
              }),
              h("span", { key: "nm", className: "font-medium text-slate-900 dark:text-white" }, row.name)
            ])),
            h("td", { key: "c-cat", className: "px-4 py-3 text-slate-600 dark:text-slate-300" }, CATEGORY_LABELS[row.category] || row.category),
            h("td", { key: "c-price", className: "px-4 py-3 font-semibold text-slate-900 dark:text-white" }, formatGhc(row.price)),
            h("td", { key: "c-stock", className: "px-4 py-3" }, String(row.stock ?? 0)),
            h("td", { key: "c-st", className: "px-4 py-3" }, h(Badge, { tone: productStatusTone(row.status) }, formatProductStatus(row.status))),
            h("td", { key: "c-act", className: "px-4 py-3" }, h("div", { className: "flex flex-wrap gap-2" }, [
              h(
                Button,
                {
                  key: "edit",
                  variant: "ghost",
                  className: "!min-h-[36px] !px-3 !py-2 !text-xs",
                  type: "button",
                  onClick: () => nav(`/vendor/products/${row.id}`)
                },
                "Edit"
              ),
              h(
                Button,
                {
                  key: "del",
                  variant: "danger",
                  className: "!min-h-[36px] !px-3 !py-2 !text-xs",
                  type: "button",
                  onClick: () => del(row.id)
                },
                "Delete"
              )
            ]))
          ])
        )
      )
    ]))
  ]);
}

export function VendorAddProductPage() {
  const { accessToken } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("food_drinks");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("25");
  const [tags, setTags] = useState("");
  const [imageList, setImageList] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (asDraft) => {
    setErr("");
    if (!accessToken) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErr("Product name is required.");
      return;
    }
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setErr("Enter a valid price greater than zero.");
      return;
    }
    setLoading(true);
    try {
      const tagList = tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10);
      const urls = imageList.slice(0, MAX_PRODUCT_IMAGES);
      const nextStatus = asDraft ? "draft" : "active";
      const body = {
        name: trimmedName,
        description: description.trim(),
        category,
        price: priceNum,
        compareAtPrice: null,
        stock: Math.max(0, Math.floor(Number(stock) || 0)),
        status: nextStatus,
        tags: tagList,
        imageUrls: urls
      };
      if (!asDraft && urls.length === 0) {
        setErr("Add at least one product photo before publishing.");
        setLoading(false);
        return;
      }
      await apiFetch("/api/products", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: body
      });
      nav("/vendor/products");
    } catch (ex) {
      setErr(ex.message || "Could not create product");
    } finally {
      setLoading(false);
    }
  };

  return h(f, null, [
    err ? h(InlineNotice, { key: "err", variant: "error", className: "mb-4", onDismiss: () => setErr("") }, err) : null,
    h("div", { key: "add-hdr", className: "mb-6 flex flex-wrap items-center justify-between gap-3" }, [
      h("h1", { className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, "Add new product"),
      h(Link, { to: "/vendor/products" }, h(Button, { variant: "ghost", className: "!rounded-full" }, "← Back to products"))
    ]),
    h("div", { key: "add-grid", className: "grid grid-cols-1 gap-6 lg:grid-cols-3" }, [
      h("div", { key: "add-main", className: "space-y-6 lg:col-span-2" }, [
        h(GlassPanel, { key: "add-details" }, [
          h("h2", { className: "mb-4 font-semibold text-slate-900 dark:text-white" }, "Product details"),
          h("div", { className: "space-y-4" }, [
            h(Field, { key: "fld-name", label: "Product name" }, h(TextInput, { value: name, onChange: (e) => setName(e.target.value), placeholder: "e.g. Scientific calculator, rice bowl meal kit" })),
            h(Field, { key: "fld-desc", label: "Description" }, h(TextArea, { value: description, onChange: (e) => setDescription(e.target.value), placeholder: "Tell buyers what makes this special…" })),
            h("div", { key: "row-price-stock", className: "grid grid-cols-1 gap-4 sm:grid-cols-2" }, [
              h(Field, { key: "fld-price", label: "Price (Ghc)" }, h(TextInput, { type: "number", step: "0.01", value: price, onChange: (e) => setPrice(e.target.value), placeholder: "18.99" })),
              h(Field, { key: "fld-stock", label: "Stock quantity" }, h(TextInput, { type: "number", value: stock, onChange: (e) => setStock(e.target.value), placeholder: "42" }))
            ]),
            h("div", { key: "row-cat-tags", className: "grid grid-cols-1 gap-4 sm:grid-cols-2" }, [
              h(
                Field,
                { key: "fld-cat", label: "Category" },
                h("div", { className: "space-y-2" }, [
                 
                  h(
                    SelectInput,
                    { key: "cat-sel", value: category, onChange: (e) => setCategory(e.target.value) },
                    PRODUCT_CATEGORY_VALUES.map((c) => h("option", { key: c, value: c }, CATEGORY_LABELS[c] || c))
                  )
                ])
              ),
              h(Field, { key: "fld-tags", label: "Tags (comma-separated)" }, h(TextInput, { value: tags, onChange: (e) => setTags(e.target.value), placeholder: "new, popular" }))
            ]),
            h(VendorProductPhotos, {
              key: "photos",
              accessToken,
              imageList,
              setImageList,
              setErr
            })
          ])
        ])
      ]),
      h("div", { key: "add-side", className: "space-y-6" }, [
        h(GlassPanel, { key: "add-publish" }, [
          h("h2", { className: "mb-2 font-semibold text-slate-900 dark:text-white" }, "Publish"),
          h(
            "p",
            { className: "text-xs text-slate-500 dark:text-slate-400" },
            "Submits your listing for admin review. It only appears in the shop after approval (usually quick)."
          ),
          h(
            Button,
            {
              className: "mt-4 w-full",
              loading,
              type: "button",
              onClick: () => submit(false)
            },
            "Submit for review"
          ),
          h(
            Button,
            { variant: "ghost", className: "mt-2 w-full", type: "button", disabled: loading, onClick: () => submit(true) },
            "Save as draft"
          )
        ])
      ])
    ])
  ]);
}

export function VendorEditProductPage() {
  const { productId } = useParams();
  const { accessToken } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("food_drinks");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("25");
  const [status, setStatus] = useState("draft");
  const [serverStatus, setServerStatus] = useState(null);
  const [rejectionReason, setRejectionReason] = useState(null);
  const [tags, setTags] = useState("");
  const [imageList, setImageList] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accessToken || !productId) return;
    trackVendorAnalyticsEvent(accessToken, { type: "product_edit_view", productId });
  }, [accessToken, productId]);

  useEffect(() => {
    if (!accessToken || !productId) return;
    let cancelled = false;
    apiFetch(`/api/products/${productId}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => {
        if (cancelled || !d.product) return;
        const p = d.product;
        setName(p.name || "");
        setDescription(p.description || "");
        setCategory(p.category || "food_drinks");
        setPrice(String(p.price ?? ""));
        setStock(String(p.stock ?? 0));
        setServerStatus(p.status || "draft");
        setRejectionReason(p.rejectionReason || null);
        if (p.status === "active" || p.status === "pending_approval") {
          setStatus("active");
        } else {
          setStatus("draft");
        }
        setTags((p.tags || []).join(", "));
        setImageList(Array.isArray(p.imageUrls) ? [...p.imageUrls] : []);
      })
      .catch((ex) => {
        if (!cancelled) setErr(ex.message || "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, productId]);

  const save = async () => {
    setErr("");
    if (!accessToken || !productId) return;
    setSaving(true);
    try {
      const tagList = tags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10);
      const urls = imageList.slice(0, MAX_PRODUCT_IMAGES);
      if (status === "active" && urls.length === 0) {
        setErr("Add at least one product photo before setting status to Active.");
        setSaving(false);
        return;
      }
      await apiFetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: {
          name: name.trim(),
          description: description.trim(),
          category,
          price: Number(price),
          compareAtPrice: null,
          stock: Number(stock) || 0,
          status,
          tags: tagList,
          imageUrls: urls
        }
      });
      nav("/vendor/products");
    } catch (ex) {
      setErr(ex.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return h("p", { className: "text-slate-500" }, "Loading product…");

  return h(f, null, [
    err ? h(InlineNotice, { key: "err", variant: "error", className: "mb-4", onDismiss: () => setErr("") }, err) : null,
    h("div", { key: "edit-hdr", className: "mb-6 flex flex-wrap items-center justify-between gap-3" }, [
      h("h1", { className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, "Edit product"),
      h(Link, { to: "/vendor/products" }, h(Button, { variant: "ghost", className: "!rounded-full" }, "← Back"))
    ]),
    h(GlassPanel, { key: "edit-panel" }, [
      h("div", { key: "edit-fields", className: "space-y-4" }, [
        h(Field, { label: "Product name" }, h(TextInput, { value: name, onChange: (e) => setName(e.target.value) })),
        h(Field, { label: "Description" }, h(TextArea, { value: description, onChange: (e) => setDescription(e.target.value) })),
        h("div", { className: "grid grid-cols-1 gap-4 sm:grid-cols-2" }, [
          h(Field, { label: "Price (Ghc)" }, h(TextInput, { type: "number", step: "0.01", value: price, onChange: (e) => setPrice(e.target.value) })),
          h(Field, { label: "Stock" }, h(TextInput, { type: "number", value: stock, onChange: (e) => setStock(e.target.value) }))
        ]),
        h("div", { key: "row-cat-tags", className: "grid grid-cols-1 gap-4 sm:grid-cols-2" }, [
          h(
            Field,
            { key: "fld-cat", label: "Category" },
            h("div", { className: "space-y-2" }, [
              h(
                SelectInput,
                { key: "cat-sel", value: category, onChange: (e) => setCategory(e.target.value) },
                PRODUCT_CATEGORY_VALUES.map((c) => h("option", { key: c, value: c }, CATEGORY_LABELS[c] || c))
              )
            ])
          ),
          h(Field, { key: "fld-tags", label: "Tags (comma-separated)" }, h(TextInput, { value: tags, onChange: (e) => setTags(e.target.value), placeholder: "new, popular" }))
        ]),
        rejectionReason && serverStatus === "rejected"
          ? h(InlineNotice, { key: "rej", variant: "warning", className: "mb-2", size: "sm" }, [
              h("strong", { key: "t" }, "Listing rejected. "),
              h("span", { key: "r" }, String(rejectionReason))
            ])
          : null,
        serverStatus === "pending_approval"
          ? h(
              "p",
              { key: "pend", className: "mb-2 text-sm text-amber-800 dark:text-amber-200" },
              "This listing is waiting for admin approval. You can save as draft to withdraw, or keep it submitted."
            )
          : null,
        h(
          Field,
          { key: "fld-st", label: "Status" },
          h(f, { key: "st" }, [
            h(SelectInput, { value: status, onChange: (e) => setStatus(e.target.value) }, [
              h("option", { value: "draft" }, "Draft (not in shop)"),
              h("option", { value: "active" }, serverStatus === "active" ? "Live in shop" : "Submit / stay submitted for review")
            ]),
            h(
              "p",
              { key: "h", className: "mt-2 text-xs text-slate-500 dark:text-slate-400" },
              serverStatus === "active"
                ? "While live, changing the title, description, price, images, category, or tags will remove the item from the shop until an admin re-approves. Stock-only changes stay live."
                : "“Submit for review” means the listing must be approved before buyers see it in the shop."
            )
          ])
        ),
        h(VendorProductPhotos, { key: "photos", accessToken, imageList, setImageList, setErr }),
        h(Button, { type: "button", onClick: save, loading: saving }, "Save changes")
      ])
    ])
  ]);
}

export function VendorOrdersPage() {
  const { accessToken, user } = useAuth();
  const nav = useNavigate();
  const { alert, confirm } = useNotice();
  const [orders, setOrders] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!accessToken) return;
    apiFetch("/api/vendor/orders", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => setOrders(d.orders || []))
      .catch((ex) => setErr(ex.message || "Failed to load"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    trackVendorAnalyticsEvent(accessToken, { type: "orders_view" });
  }, [accessToken]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [accessToken]);

  const updateStatus = async (orderId, status) => {
    if (!accessToken) return;
    try {
      await apiFetch(`/api/vendor/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: { status }
      });
      load();
    } catch (ex) {
      await alert(ex.message || "Update failed", { variant: "error", title: "Status update" });
    }
  };

  const confirmPayment = async (orderId) => {
    if (!accessToken) return;
    try {
      await apiFetch(`/api/vendor/orders/${orderId}/confirm-payment-received`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      load();
    } catch (ex) {
      await alert(ex.message || "Could not confirm", { variant: "error", title: "Payment confirmation" });
    }
  };

  const deleteOrder = async (orderId) => {
    if (!accessToken) return;
    const agreed = await confirm(
      "This permanently removes the order for you and the buyer. For unpaid checkouts, use this instead of a separate cancel step.",
      { title: "Delete this order?", confirmLabel: "Delete", cancelLabel: "Keep" }
    );
    if (!agreed) return;
    try {
      await apiFetch(`/api/orders/${orderId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      load();
    } catch (ex) {
      await alert(ex.message || "Could not delete", { variant: "error", title: "Delete order" });
    }
  };

  return h(f, null, [
    err
      ? h(InlineNotice, { key: "err", variant: "error", className: "mb-4", onDismiss: () => setErr("") }, err)
      : null,
    h("div", { key: "head", className: "mb-6 flex flex-wrap items-center justify-between gap-3" }, [
      h("h1", { className: "flex items-center gap-2 font-display text-2xl font-bold text-slate-900 dark:text-white" }, [
        h(ShoppingCart, { className: "h-7 w-7 text-sky-400" }),
        "Order management"
      ])
    ]),
    h(
      "p",
      {
        key: "vendor-orders-hint",
        className: "mb-4 text-xs text-slate-500 dark:text-slate-400"
      },
      "For off-platform (MoMo/bank) payments, confirm when money hits your account — stock only releases after every seller on that order has confirmed. Message buyers from Messages in the sidebar."
    ),
    loading && h("p", { className: "mb-4 text-sm text-slate-600 dark:text-slate-400" }, "Loading…"),
    h(GlassCard, { key: "table-card", className: "!overflow-x-auto !p-0" }, h("table", { className: "table-fixed w-full min-w-[920px] text-left text-sm" }, [
      h(
        "colgroup",
        { key: "cols" },
        [0, 1, 2, 3, 4, 5].map((i) => h("col", { key: i, style: { width: `${100 / 6}%` } }))
      ),
      h(
        "thead",
        { className: "border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400" },
        h("tr", null, ["Order", "Buyer line", "Your total", "Status", "Next step", "Actions"].map((c, i, arr) =>
          h(
            "th",
            {
              key: c,
              className: [
                "px-3 py-3.5 font-semibold tracking-wide",
                i === arr.length - 1
                  ? "sticky right-0 z-30 min-w-[10.5rem] border-l border-slate-200 bg-slate-50 shadow-[-10px_0_18px_-10px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-night-900 dark:shadow-[-10px_0_24px_-10px_rgba(0,0,0,0.55)]"
                  : ""
              ]
                .filter(Boolean)
                .join(" ")
            },
            c
          )
        ))
      ),
      h(
        "tbody",
        { className: "divide-y divide-slate-100 dark:divide-white/10" },
        orders.map((o) => {
          const status = normalizeOrderStatus(o.status);
          const lines = o.items || [];
          const line = lines[0];
          const lineLabel =
            lines.length === 0
              ? "—"
              : lines.length === 1
                ? `${line.name} ×${line.quantity}`
                : `${lines.length} line items`;
          const myEarn =
            o.vendorSellerProceeds != null && Number.isFinite(o.vendorSellerProceeds)
              ? o.vendorSellerProceeds
              : lines.reduce((s, it) => s + (Number(it.sellerProceeds) || 0), 0);
          return h("tr", { key: o.id, className: "group hover:bg-slate-50/90 dark:hover:bg-white/5" }, [
            h(
              "td",
              { className: "min-w-0 px-3 py-3.5 align-top whitespace-nowrap font-mono text-xs text-slate-700 dark:text-slate-300" },
              `#${o.id.slice(-8)}`
            ),
            h(
              "td",
              { className: "min-w-0 px-3 py-3.5 align-top break-words leading-relaxed text-slate-800 dark:text-slate-100" },
              lineLabel
            ),
            h("td", { className: "min-w-0 whitespace-nowrap px-3 py-3.5 align-top font-semibold text-emerald-600 dark:text-emerald-400" }, formatGhc(myEarn)),
            h("td", { className: "min-w-0 px-3 py-3.5 align-top" }, h(Badge, { tone: "neutral" }, humanizeOrderStatus(o.status))),
            h(
              "td",
              { className: "min-w-0 px-3 py-3.5 align-top" },
              h("div", { className: "flex flex-col gap-2" }, [
                h(
                  "div",
                  { className: "flex flex-wrap gap-1.5" },
                  [
                    status === "awaiting_vendor_payment" &&
                      !(o.confirmedSellerIds || []).includes(user?.id) &&
                      h(
                        Button,
                        {
                          key: "pay-ok",
                          variant: "primary",
                          className: "!min-h-[34px] !px-2.5 !py-1.5 !text-xs",
                          type: "button",
                          onClick: () => confirmPayment(o.id)
                        },
                        "Confirm received payment"
                      ),
                    status === "awaiting_vendor_payment" &&
                      (o.confirmedSellerIds || []).includes(user?.id) &&
                      h(
                        "span",
                        {
                          key: "pay-wait",
                          className: "block max-w-[14rem] text-[11px] leading-snug text-emerald-700 dark:text-emerald-400"
                        },
                        "You confirmed · waiting others"
                      ),
                    status === "paid" &&
                      !o.adminPaymentConfirmedAt &&
                      h(
                        "span",
                        {
                          key: "await-confirm",
                          className: "block max-w-[14rem] text-[11px] leading-snug text-amber-700 dark:text-amber-400"
                        },
                        "⏳ Waiting for admin to confirm payment…"
                      ),
                    status === "paid" &&
                      !o.adminPaymentConfirmedAt &&
                      o.paystackSettlementStatus === "pending" &&
                      h(
                        "span",
                        {
                          key: "settle-pending",
                          className: "block max-w-[14rem] text-[11px] leading-snug text-slate-700 dark:text-slate-300"
                        },
                        `Paystack settlement pending${o.paystackSettlementDate ? ` until ${new Date(o.paystackSettlementDate).toLocaleDateString()}` : ""}`
                      ),
                    status === "paid" &&
                      !o.adminPaymentConfirmedAt &&
                      o.paystackSettlementStatus === "failed" &&
                      h(
                        "span",
                        {
                          key: "settle-failed",
                          className: "block max-w-[14rem] text-[11px] leading-snug text-rose-700 dark:text-rose-400"
                        },
                        "Paystack settlement failed — check payment details"
                      ),
                    status === "paid" &&
                      o.adminPaymentConfirmedAt &&
                      h(
                        "span",
                        {
                          key: "confirmed",
                          className: "block max-w-[14rem] text-[11px] leading-snug text-emerald-700 dark:text-emerald-400"
                        },
                        "✓ Admin confirmed payment · Ready to ship"
                      ),
                    status === "paid" &&
                      o.adminPaymentConfirmedAt &&
                      h(
                        Button,
                        {
                          key: "proc",
                          variant: "ghost",
                          className:
                            "!min-h-[34px] !px-2.5 !py-1.5 !text-xs border border-slate-200/90 bg-white/80 text-slate-800 hover:bg-slate-50 dark:border-transparent dark:bg-transparent dark:text-slate-100 dark:hover:bg-white/10",
                          type: "button",
                          onClick: () => updateStatus(o.id, "processing")
                        },
                        "Paid"
                      ),
                    status === "processing" &&
                      h(
                        Button,
                        {
                          key: "sent_for_delivery",
                          variant: "ghost",
                          className:
                            "!min-h-[34px] !px-2.5 !py-1.5 !text-xs border border-slate-200/90 bg-white/80 text-slate-800 hover:bg-slate-50 dark:border-transparent dark:bg-transparent dark:text-slate-100 dark:hover:bg-white/10",
                          type: "button",
                          onClick: () => updateStatus(o.id, "sent_for_delivery")
                        },
                        "Sent for delivery"
                      ),
                    status === "sent_for_delivery" &&
                      h(
                        Button,
                        {
                          key: "del",
                          variant: "ghost",
                          className:
                            "!min-h-[34px] !px-2.5 !py-1.5 !text-xs border border-slate-200/90 bg-white/80 text-slate-800 hover:bg-slate-50 dark:border-transparent dark:bg-transparent dark:text-slate-100 dark:hover:bg-white/10",
                          type: "button",
                          onClick: () => updateStatus(o.id, "delivered")
                        },
                        "Delivered"
                      )
                  ].filter(Boolean)
                ),
                h(Button, {
                  key: "to-msg",
                  variant: "ghost",
                  className:
                    "!min-h-[34px] w-full !px-2.5 !py-1.5 !text-xs !text-sky-700 hover:!bg-sky-50 hover:!text-sky-800 sm:w-fit dark:!text-sky-400 dark:hover:!bg-white/10 dark:hover:!text-sky-300",
                  type: "button",
                  onClick: () =>
                    nav(
                      o.buyerContact?.id
                        ? `/vendor/messages?peer=${encodeURIComponent(String(o.buyerContact.id))}`
                        : "/vendor/messages"
                    )
                }, [
                  h(MessageSquare, { key: "ic-m", className: "h-3.5 w-3.5 shrink-0" }),
                  h("span", { key: "l-m", className: "ml-1" }, "Message")
                ])
              ])
            ),
            h(
              "td",
              {
                className:
                  "min-w-0 px-3 py-3.5 align-top sticky right-0 z-20 min-w-[10.5rem] border-l border-slate-200 bg-white shadow-[-10px_0_18px_-10px_rgba(15,23,42,0.14)] group-hover:bg-slate-50 dark:border-white/10 dark:bg-night-950 dark:shadow-[-10px_0_24px_-10px_rgba(0,0,0,0.45)] dark:group-hover:bg-night-900/95"
              },
              (() => {
                const actionEls = [
                  ["paid", "processing", "awaiting_vendor_payment"].includes(status) &&
                    h(Button, {
                      key: "cxl",
                      variant: "danger",
                      className: "!min-h-[34px] w-full !px-2.5 !py-1.5 !text-xs sm:w-auto",
                      type: "button",
                      onClick: () => updateStatus(o.id, "cancelled")
                    }, "Cancel order"),
                  h(Button, {
                    key: "row-del",
                    variant: "ghost",
                    className:
                      "!min-h-[36px] w-full !px-3 !py-2 !text-xs !font-semibold !text-rose-800 !ring-2 !ring-rose-400/55 !bg-rose-50 hover:!bg-rose-100 hover:!ring-rose-500/70 sm:w-auto dark:!text-rose-200 dark:!ring-rose-500/50 dark:!bg-rose-950/50 dark:hover:!bg-rose-950/70",
                    type: "button",
                    onClick: () => deleteOrder(o.id)
                  }, [h(Trash2, { className: "h-3.5 w-3.5 shrink-0" }), h("span", { className: "ml-1" }, "Delete")])
                ].filter(Boolean);
                return actionEls.length
                  ? h("div", { className: "flex flex-col items-stretch gap-2 sm:items-start" }, actionEls)
                  : h(
                      "span",
                      { className: "block text-xs leading-snug text-slate-500 dark:text-slate-400" },
                      "No actions for this status."
                    );
              })()
            )
          ]);
        })
      )
    ]))
  ]);
}

export function VendorMessagesPage() {
  const { accessToken } = useAuth();
  const [searchParams] = useSearchParams();
  const peerFromQuery = searchParams.get("peer");
  const [threads, setThreads] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [replyByPeer, setReplyByPeer] = useState({});
  const [sending, setSending] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const selectPeerOnLoadRef = useRef(true);

  useEffect(() => {
    selectPeerOnLoadRef.current = true;
  }, [peerFromQuery]);

  const loadThreads = useCallback(() => {
    if (!accessToken) return Promise.resolve();
    return apiFetch("/api/conversations?as=seller", {
      headers: { Authorization: `Bearer ${accessToken}` }
    }).then((d) => setThreads(Array.isArray(d?.threads) ? d.threads : []));
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr("");
    loadThreads()
      .catch((ex) => {
        if (!cancelled) setErr(ex.message || "Could not load messages");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, loadThreads]);

  useEffect(() => {
    if (!threads.length) {
      setActiveId(null);
      return;
    }
    const ids = threads.map((t) => String(t.peerUserId));
    if (selectPeerOnLoadRef.current && peerFromQuery && ids.includes(String(peerFromQuery))) {
      setActiveId(String(peerFromQuery));
      setMobileShowChat(true);
      selectPeerOnLoadRef.current = false;
      return;
    }
    selectPeerOnLoadRef.current = false;
    setActiveId((cur) => (cur && ids.includes(String(cur)) ? cur : String(threads[0].peerUserId)));
  }, [threads, peerFromQuery]);

  const activeThread = useMemo(
    () => threads.find((t) => String(t.peerUserId) === String(activeId)) || null,
    [threads, activeId]
  );

  const threadPreview = useCallback((t) => {
    const msgs = t.messages || [];
    if (!msgs.length) return "No messages yet — you can write first.";
    const last = msgs[msgs.length - 1];
    const s = String(last.text || "").replace(/\s+/g, " ").trim();
    return s.length > 80 ? `${s.slice(0, 80)}…` : s || "…";
  }, []);

  const threadLastTime = useCallback((t) => {
    const msgs = t.messages || [];
    if (!msgs.length) return null;
    const ts = msgs.map((m) => new Date(m.createdAt).getTime());
    return new Date(Math.max(...ts));
  }, []);

  const sendReply = async (peerUserId) => {
    const pid = String(peerUserId || "");
    const text = String(replyByPeer[pid] || "").trim();
    if (!text || !accessToken) return;
    setErr("");
    setSending(pid);
    try {
      await apiFetch(`/api/conversations/by-peer/${encodeURIComponent(pid)}/messages?as=seller`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: { text }
      });
      setReplyByPeer((prev) => ({ ...prev, [pid]: "" }));
      await loadThreads();
    } catch (ex) {
      setErr(ex.message || "Could not send reply");
    } finally {
      setSending(null);
    }
  };

  const renderBubble = (m, idx) => {
    const mine = m.senderLabel === "You";
    return h(
      "div",
      {
        key: `b-${idx}`,
        className: `flex w-full ${mine ? "justify-end" : "justify-start"}`
      },
      h(
        "div",
        {
          className: `max-w-[min(100%,22rem)] rounded-2xl px-3.5 py-2.5 shadow-sm ${
            mine
              ? "rounded-br-md bg-sky-600 text-white dark:bg-sky-600"
              : "rounded-bl-md border border-white/15 bg-white/50 text-slate-900 dark:border-white/10 dark:bg-night-900/70 dark:text-slate-100"
          }`
        },
        [
          h("p", { className: "text-[11px] font-semibold uppercase tracking-wide opacity-80" }, m.senderLabel || (mine ? "You" : "Buyer")),
          h("p", { className: "mt-1 whitespace-pre-wrap text-sm leading-relaxed" }, m.text),
          m.createdAt
            ? h("p", { className: `mt-1.5 text-[10px] ${mine ? "text-white/75" : "text-slate-500 dark:text-slate-400"}` }, new Date(m.createdAt).toLocaleString())
            : null
        ].filter(Boolean)
      )
    );
  };

  const chatShell =
    !loading &&
    !err &&
    threads.length > 0 &&
    h(
      "div",
      {
        key: "chat-shell",
        className:
          "flex min-h-[min(28rem,calc(100dvh-13rem))] flex-col overflow-hidden rounded-2xl border border-white/15 bg-white/25 shadow-xl backdrop-blur-xl dark:bg-night-900/45 md:min-h-[calc(100dvh-10rem)] md:flex-row md:rounded-3xl"
      },
      [
        h(
          "aside",
          {
            key: "conv-list",
            className: `flex max-h-[40vh] shrink-0 flex-col border-white/10 md:max-h-none md:h-auto md:w-[min(100%,17rem)] md:max-w-[40%] md:border-r ${
              mobileShowChat ? "max-md:hidden" : "max-md:flex min-h-0"
            }`
          },
          [
            h("div", { key: "conv-h", className: "shrink-0 border-b border-white/10 px-4 py-3" }, [
              h("h2", { className: "text-base font-semibold text-slate-900 dark:text-white" }, "Chats"),
              h(
                "p",
                { className: "mt-0.5 text-xs text-slate-500 dark:text-slate-400" },
                "Buyers you’ve sold to — plus Campus Mart Support for payouts and policy help."
              )
            ]),
            h(
              "div",
              { key: "conv-scroll", className: "min-h-0 flex-1 overflow-y-auto" },
              threads.map((t) => {
                const selected = String(t.peerUserId) === String(activeId);
                const lt = threadLastTime(t);
                return h(
                  "button",
                  {
                    key: t.peerUserId,
                    type: "button",
                    onClick: () => {
                      setActiveId(String(t.peerUserId));
                      setMobileShowChat(true);
                    },
                    className: `flex w-full flex-col gap-1 border-b border-white/5 px-4 py-3.5 text-left transition hover:bg-white/25 dark:hover:bg-white/5 ${
                      selected ? "bg-sky-500/15 dark:bg-sky-500/10" : ""
                    }`
                  },
                  [
                    h("div", { className: "flex items-baseline justify-between gap-2" }, [
                      h(
                        "span",
                        { className: "min-w-0 truncate text-sm font-semibold text-slate-800 dark:text-slate-100" },
                        t.peerDisplayName || "Buyer"
                      ),
                      lt
                        ? h("span", { className: "shrink-0 text-[10px] text-slate-400" }, lt.toLocaleDateString())
                        : null
                    ]),
                    t.itemSummary
                      ? h("p", { className: "truncate text-[11px] text-slate-500 dark:text-slate-400" }, t.itemSummary)
                      : null,
                    h("p", { className: "line-clamp-2 text-xs text-slate-600 dark:text-slate-300" }, threadPreview(t))
                  ].filter(Boolean)
                );
              })
            )
          ]
        ),
        h(
          "section",
          {
            key: "thread",
            className: `flex min-h-0 flex-1 flex-col overflow-hidden bg-white/15 dark:bg-night-950/25 max-md:min-h-[52vh] ${
              mobileShowChat ? "max-md:flex" : "max-md:hidden md:flex"
            }`
          },
          activeThread
            ? [
                h("header", { key: "th", className: "flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-3 md:px-4" }, [
                  h(
                    "button",
                    {
                      key: "back",
                      type: "button",
                      className: "tap-target rounded-xl p-2 hover:bg-white/15 md:hidden",
                      onClick: () => setMobileShowChat(false),
                      "aria-label": "Back to conversations"
                    },
                    h(ArrowLeft, { className: "h-5 w-5 text-slate-700 dark:text-slate-200" })
                  ),
                  h("div", { key: "tit", className: "min-w-0 flex-1" }, [
                    h("p", { className: "truncate font-semibold text-slate-900 dark:text-white" }, activeThread.peerDisplayName || "Buyer"),
                    h(
                      "p",
                      { className: "truncate text-xs text-slate-500 dark:text-slate-400" },
                      activeThread.itemSummary || "One thread for all your orders with this buyer."
                    )
                  ]),
                  h(
                    Link,
                    {
                      key: "ord",
                      to: "/vendor/orders",
                      className: "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-sky-600 hover:bg-sky-500/10 dark:text-sky-300"
                    },
                    "Orders"
                  )
                ]),
                h(
                  "div",
                  { key: "scroll", className: "min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 md:px-5" },
                  (activeThread.messages || []).map((m, i) => renderBubble(m, i))
                ),
                h("footer", { key: "ft", className: "shrink-0 border-t border-white/10 bg-white/20 p-3 dark:bg-night-950/40 md:p-4" }, [
                  h("div", { className: "flex items-end gap-2" }, [
                    h("textarea", {
                      key: `reply-${activeThread.peerUserId}`,
                      className:
                        "min-h-[44px] flex-1 resize-none rounded-2xl border border-white/20 bg-white/60 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-white/10 dark:bg-night-900/60 dark:text-slate-100 dark:placeholder:text-slate-500",
                      rows: 2,
                      maxLength: 1000,
                      placeholder: "Write a message…",
                      value: replyByPeer[String(activeThread.peerUserId)] || "",
                      onChange: (e) =>
                        setReplyByPeer((prev) => ({
                          ...prev,
                          [String(activeThread.peerUserId)]: e.target.value
                        })),
                      onKeyDown: (e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendReply(activeThread.peerUserId);
                        }
                      }
                    }),
                    h(
                      Button,
                      {
                        type: "button",
                        variant: "primary",
                        className: "!h-11 !min-w-[2.75rem] !rounded-2xl !px-3",
                        disabled: sending === String(activeThread.peerUserId) || !String(replyByPeer[String(activeThread.peerUserId)] || "").trim(),
                        onClick: () => sendReply(activeThread.peerUserId),
                        title: "Send"
                      },
                      sending === String(activeThread.peerUserId)
                        ? "…"
                        : h(Send, { className: "h-5 w-5", "aria-hidden": true })
                    )
                  ]),
                  h("p", { className: "mt-2 text-center text-[10px] text-slate-500 dark:text-slate-400" }, "Enter to send · Shift+Enter for new line")
                ])
              ]
            : h("div", { key: "ph", className: "hidden flex-1 items-center justify-center p-8 text-sm text-slate-500 md:flex" }, "Select a conversation")
        )
      ]
    );

  return h(f, null, [
    err
      ? h(InlineNotice, { key: "err", variant: "error", className: "mb-4", onDismiss: () => setErr("") }, err)
      : null,
    h("div", { key: "wrap", className: "mx-auto flex w-full max-w-5xl flex-col px-4 py-6 pb-24 sm:px-6" }, [
      h("h1", { key: "h1", className: "sr-only" }, "Messages to buyers"),
      h(
        "div",
        { key: "head", className: "mb-4 flex flex-wrap items-center justify-between gap-3" },
        h("h2", { className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, "Messages")
      ),
      loading ? h("p", { key: "ld", className: "text-sm text-slate-500 dark:text-slate-400" }, "Loading…") : null,
      !loading &&
        !err &&
        threads.length === 0 &&
        h(GlassPanel, { key: "empty" }, [
          h("p", { className: "text-sm text-slate-600 dark:text-slate-300" }, "No buyer chats yet."),
          h(
            "p",
            { className: "mt-2 text-xs text-slate-500 dark:text-slate-400" },
            "Buyer chats appear when you have active orders. Campus Mart Support is always listed first once your admin inbox is set up."
          )
        ]),
      chatShell
    ])
  ]);
}

export function VendorAnalyticsPage() {
  const { accessToken } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!accessToken) return;
    trackVendorAnalyticsEvent(accessToken, { type: "analytics_view" });
    apiFetch("/api/vendor/analytics?days=30", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(setAnalytics)
      .catch((ex) => setErr(ex.message || "Failed"));
  }, [accessToken]);

  const daily = analytics?.chart?.daily || [];

  return h(f, null, [
    err
      ? h(InlineNotice, { key: "err", variant: "error", className: "mb-4", onDismiss: () => setErr("") }, err)
      : null,
    h("div", { className: "mb-6 flex flex-wrap items-center justify-between gap-3" }, [
      h("h1", { className: "flex items-center gap-2 font-display text-2xl font-bold text-slate-900 dark:text-white" }, [
        h(LineChart, { className: "h-7 w-7 text-sky-400" }),
        "Analytics overview"
      ])
    ]),
    h(
      "div",
      { className: "mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4" },
      [
        { label: "Revenue", value: formatGhc(analytics?.revenue || 0) },
        { label: "Orders", value: String(analytics?.orderCount ?? "—") },
        { label: "Products", value: String(analytics?.productCount ?? "—") },
        { label: "Reviews", value: String(analytics?.reviewCount ?? "—") }
      ].map((x) =>
        h(GlassCard, { key: x.label, className: "!p-3" }, [
          h("p", { className: "text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, x.label),
          h("p", { className: "mt-1 text-base font-bold text-slate-900 dark:text-white sm:text-lg" }, x.value)
        ])
      )
    ),
    h("div", { key: "charts-grid", className: "mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 md:items-stretch" }, [
      h(GlassPanel, { key: "rev-chart", className: "!overflow-hidden !p-0" }, [
        h("div", { className: "border-b border-white/10 px-4 py-3 dark:border-white/5" }, [
          h("h2", { className: "text-base font-semibold text-slate-900 dark:text-white" }, "Aurora ribbon"),
          h("p", { className: "mt-0.5 text-[11px] text-slate-500 dark:text-slate-400" }, "Smoothed daily proceeds — glow, reflection, hex markers.")
        ]),
        daily.length
          ? h("div", { className: "px-2 pb-1 pt-2" }, h(VendorRevenueLineChart, { daily }))
          : h("p", { className: "px-4 py-8 text-center text-sm text-slate-500" }, "No chart data yet.")
      ]),
      h(GlassPanel, { key: "top-products", className: "!overflow-hidden !p-0" }, [
        h("div", { className: "border-b border-white/10 px-4 py-3 dark:border-white/5" }, [
          h("h2", { className: "text-base font-semibold text-slate-900 dark:text-white" }, "Top products"),
          h("p", { className: "mt-0.5 text-[11px] text-slate-500 dark:text-slate-400" }, "Best performing products by proceeds.")
        ]),
        h(
          "ul",
          { className: "space-y-2 px-4 py-3 text-sm" },
          (analytics?.topProducts || []).slice(0, 6).map((r) =>
            h("li", { key: r.productId, className: "flex items-center justify-between gap-2" }, [
              h("span", { className: "truncate text-slate-600 dark:text-slate-300" }, r.name),
              h("span", { className: "shrink-0 font-semibold text-slate-900 dark:text-white" }, formatGhc(r.revenue))
            ])
          )
        ),
        (!analytics?.topProducts || analytics.topProducts.length === 0) &&
          h("p", { className: "px-4 py-8 text-center text-sm text-slate-500" }, "No top products yet.")
      ])
    ])
  ]);
}

export function VendorReviewsPage() {
  const { accessToken } = useAuth();
  const location = useLocation();
  const [reviews, setReviews] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr("");
    apiFetch("/api/vendor/reviews", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => {
        if (cancelled) return;
        setReviews(Array.isArray(d?.reviews) ? d.reviews : []);
      })
      .catch((ex) => {
        if (cancelled) return;
        setErr(ex.message || "Failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, location.pathname]);

  return h(GlassPanel, {}, [
    h("h1", { key: "h1", className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, "Reviews"),
    err
      ? h(InlineNotice, { key: "err", variant: "error", className: "mt-2", onDismiss: () => setErr("") }, err)
      : null,
    loading
      ? h("p", { key: "load", className: "mt-4 text-sm text-slate-600 dark:text-slate-400" }, "Loading…")
      : h("div", { key: "list", className: "mt-4 space-y-4" }, [
      reviews.length === 0 && h("p", { key: "empty", className: "text-sm text-slate-600 dark:text-slate-400" }, "No reviews yet."),
      ...reviews.map((r, idx) =>
        h(GlassCard, { key: r.id || `rv-${idx}`, className: "!p-4" }, [
          h("div", { className: "flex flex-wrap items-center justify-between gap-2" }, [
            h("span", { className: "font-semibold text-sky-600 dark:text-sky-300" }, `${r.rating} ★`),
            h("span", { className: "text-xs text-slate-500" }, new Date(r.createdAt).toLocaleString())
          ]),
          h("p", { className: "mt-1 text-xs font-medium text-slate-600 dark:text-slate-300" }, r.productName || "Product"),
          h("p", { className: "mt-0.5 text-xs text-slate-500" }, `From ${r.buyerDisplayName || "Buyer"}`),
          h("p", { className: "mt-2 text-sm text-slate-800 dark:text-slate-200" }, r.comment || "(No comment)")
        ])
      )
    ])
  ]);
}

export function VendorSettingsPage() {
  const nav = useNavigate();
  const { confirm, alert } = useNotice();
  const { accessToken, user, setUser, logout } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const photoFileRef = useRef(null);
  const [ghanaBanks, setGhanaBanks] = useState([]);
  /** Format: `ghipss|CODE` or `mobile_money|CODE` (from Paystack list). */
  const [payoutBankKey, setPayoutBankKey] = useState("");
  const [banksLoading, setBanksLoading] = useState(false);
  const [banksLoadErr, setBanksLoadErr] = useState("");
  const [registeringPayout, setRegisteringPayout] = useState(false);
  const [payoutErr, setPayoutErr] = useState("");
  const [payoutOk, setPayoutOk] = useState("");

  useEffect(() => {
    if (!accessToken) return;
    apiFetch("/api/auth/me", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => {
        if (!d.user) return;
        setUser(d.user);
        setDisplayName(d.user.displayName || "");
        setPhone(d.user.phone || "");
        setEmail(d.user.email || "");
        setBankName(d.user.bankName || "");
        setBankAccountNumber(d.user.bankAccountNumber || "");
        setBankAccountName(d.user.bankAccountName || "");
      })
      .catch(() => {});
  }, [accessToken, setUser]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setBanksLoading(true);
    setBanksLoadErr("");
    apiFetch("/api/vendor/paystack/ghana-banks", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => {
        if (cancelled) return;
        setGhanaBanks(Array.isArray(d.banks) ? d.banks : []);
      })
      .catch((ex) => {
        if (!cancelled) {
          setGhanaBanks([]);
          setBanksLoadErr(ex.message || "Could not load Paystack bank list. Check the API and Paystack keys.");
        }
      })
      .finally(() => {
        if (!cancelled) setBanksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    const ch = user?.ghanaPayoutChannel;
    const code = (user && user.ghanaBankCode && String(user.ghanaBankCode).trim()) || "";
    if (ch && code && (ch === "ghipss" || ch === "mobile_money")) {
      setPayoutBankKey(`${ch}|${code}`);
    }
  }, [user?.ghanaPayoutChannel, user?.ghanaBankCode]);

  const onPickProfilePhoto = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !accessToken) return;
    if (!/^image\/(jpeg|png|gif|webp)$/i.test(f.type) || f.size > 5 * 1024 * 1024) {
      setErr("Use a JPEG, PNG, WebP, or GIF under 5 MB.");
      return;
    }
    setErr("");
    setOk("");
    setPhotoLoading(true);
    try {
      const data = await apiUploadProfileImage(f, accessToken);
      if (data.user) setUser(data.user);
      setOk("Profile photo updated.");
    } catch (ex) {
      setErr(ex.message || "Upload failed");
    } finally {
      setPhotoLoading(false);
    }
  };

  const clearProfilePhoto = async () => {
    if (!accessToken) return;
    setErr("");
    setOk("");
    setPhotoLoading(true);
    try {
      const data = await apiFetch("/api/auth/profile", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: { clearProfileImage: true }
      });
      if (data.user) setUser(data.user);
      setOk("Profile photo removed.");
    } catch (ex) {
      setErr(ex.message || "Could not remove photo");
    } finally {
      setPhotoLoading(false);
    }
  };

  const save = async () => {
    setErr("");
    setOk("");
    if (!accessToken) return;
    setSaving(true);
    try {
      const data = await apiFetch("/api/auth/profile", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: {
          displayName: displayName.trim(),
          phone: phone.trim(),
          bankName: bankName.trim(),
          bankAccountNumber: bankAccountNumber.trim(),
          bankAccountName: bankAccountName.trim()
        }
      });
      if (data.user) setUser(data.user);
      setOk("Saved.");
    } catch (ex) {
      setErr(ex.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const registerPaystackPayout = async () => {
    setPayoutErr("");
    setPayoutOk("");
    if (!accessToken) return;
    const p = payoutBankKey.indexOf("|");
    if (p < 1) {
      setPayoutErr("Select a bank or mobile money provider from the list.");
      return;
    }
    const recipientType = payoutBankKey.slice(0, p);
    const bankCode = payoutBankKey.slice(p + 1).trim();
    if (!bankCode || (recipientType !== "ghipss" && recipientType !== "mobile_money")) {
      setPayoutErr("Select a valid payout method from the list.");
      return;
    }
    /* Same rules as server: MoMo wallet can live in “Mobile money number” or “Account number”; name can fall back to display name. */
    const accountNum =
      bankAccountNumber.trim() ||
      (recipientType === "mobile_money" ? phone.trim() : "");
    const accountHolder =
      bankAccountName.trim() ||
      displayName.trim();
    if (!accountNum.trim()) {
      setPayoutErr(
        recipientType === "mobile_money"
          ? "Add your wallet number under “Mobile money number” or “Account number”, then try again."
          : "Fill in account number under “Account & store contact”, then try again."
      );
      return;
    }
    if (!accountHolder.trim()) {
      setPayoutErr("Fill in account name (or set display name), then try again.");
      return;
    }
    setRegisteringPayout(true);
    try {
      const data = await apiFetch("/api/vendor/paystack/payout-account", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: {
          bankCode,
          recipientType,
          accountNumber: accountNum
        }
      });
      if (data?.ok) {
        setPayoutOk(
          recipientType === "mobile_money"
            ? "Your mobile money is linked. When buyers pay with Paystack, your share can be sent here automatically (if the platform has this enabled)."
            : "Your bank is linked. When buyers pay with Paystack, your share can be sent here automatically (if the platform has this enabled)."
        );
        const me = await apiFetch("/api/auth/me", { headers: { Authorization: `Bearer ${accessToken}` } });
        if (me.user) setUser(me.user);
      }
    } catch (ex) {
      setPayoutErr(ex.message || "Could not link bank. Check details with your bank and try again.");
    } finally {
      setRegisteringPayout(false);
    }
  };

  const removeAccount = async () => {
    if (!accessToken) return;
    const proceed = await confirm("This permanently deletes your seller account and removes access to the vendor dashboard.", {
      title: "Delete seller account?",
      confirmLabel: "Delete account",
      cancelLabel: "Keep account"
    });
    if (!proceed) return;
    setErr("");
    setOk("");
    setDeleting(true);
    try {
      await deleteAuthenticatedAccount(accessToken, {
        password: deletePassword,
        confirm: deleteConfirm.trim()
      });
      await logout();
      await alert("Your seller account was deleted.", { variant: "success", title: "Done" });
      nav("/register", { replace: true });
    } catch (ex) {
      setErr(ex.message || "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  return h("div", { className: "grid grid-cols-1 gap-6 xl:grid-cols-3" }, [
    h("div", { className: "space-y-6 xl:col-span-2" }, [
      h(GlassPanel, {}, [
        h("h2", { className: "mb-2 text-lg font-semibold text-slate-900 dark:text-white" }, "Profile photo"),
        h("p", { className: "mb-4 text-sm text-slate-600 dark:text-slate-400" }, "Shown in the vendor bar and on your public profile. JPEG, PNG, WebP, or GIF, up to 5 MB."),
        h("div", { className: "flex flex-col items-start gap-4 sm:flex-row sm:items-center" }, [
          h(
            "div",
            { key: "av", className: "ring-4 ring-sky-500/25 rounded-full" },
            vendorUserAvatarNode(user, { sizeClass: "h-20 w-20", initialTextClass: "text-xl" })
          ),
          h("div", { className: "flex flex-wrap gap-2" }, [
            h("input", {
              key: "file",
              ref: photoFileRef,
              type: "file",
              accept: "image/jpeg,image/png,image/webp,image/gif",
              className: "sr-only",
              onChange: onPickProfilePhoto
            }),
            h(
              Button,
              {
                key: "upl",
                variant: "ghost",
                type: "button",
                disabled: photoLoading,
                loading: photoLoading,
                onClick: () => photoFileRef.current?.click()
              },
              [h(Camera, { key: "i", className: "h-4 w-4" }), h("span", { key: "t" }, "Upload photo")]
            ),
            (user?.profileImageUrl &&
              String(user.profileImageUrl).trim() &&
              h(Button, { key: "rm", variant: "subtle", type: "button", disabled: photoLoading, onClick: clearProfilePhoto }, "Remove")) ||
              null
          ])
        ])
      ]),
      h(GlassPanel, {}, [
        h("h2", { className: "mb-4 flex items-center gap-2 font-semibold text-slate-900 dark:text-white" }, [
          h(Settings, { className: "h-5 w-5 text-sky-400" }),
          "Account & store contact"
        ]),
        h(
          "p",
          { className: "mb-4 text-sm text-slate-600 dark:text-slate-400" },
          "Your MoMo number and bank details can be shown to buyers on your listings so they can pay you directly."
        ),
        h(Field, { label: "Display name" }, h(TextInput, { value: displayName, onChange: (e) => setDisplayName(e.target.value) })),
        h(Field, { label: "Contact email" }, h(TextInput, { type: "email", value: email, disabled: true })),
        h(Field, { label: "Mobile money number (for buyer payments)" }, h(TextInput, { value: phone, onChange: (e) => setPhone(e.target.value) })),
        h(Field, { label: "Bank name" }, h(TextInput, { value: bankName, onChange: (e) => setBankName(e.target.value) })),
        h(Field, { label: "Account name" }, h(TextInput, { value: bankAccountName, onChange: (e) => setBankAccountName(e.target.value) })),
        h(Field, { label: "Account number" }, h(TextInput, { value: bankAccountNumber, onChange: (e) => setBankAccountNumber(e.target.value) })),
        err
          ? h(InlineNotice, { key: "err", variant: "error", className: "mt-2", onDismiss: () => setErr("") }, err)
          : null,
        ok
          ? h(InlineNotice, { key: "ok", variant: "success", className: "mt-2", onDismiss: () => setOk("") }, ok)
          : null,
        h(Button, { className: "mt-4 w-full sm:w-auto", type: "button", onClick: save, loading: saving }, "Save")
      ]),
      h(GlassPanel, { id: "vendor-paystack-payouts", className: "!scroll-mt-28" }, [
        h("h2", { className: "mb-2 text-lg font-semibold text-slate-900 dark:text-white" }, "Paystack — automatic payouts (bank or MoMo)"),
        h(
          "p",
          { className: "mb-3 text-sm text-slate-600 dark:text-slate-400" },
          "When a buyer pays with Paystack, the platform can send your share to a Ghanaian bank or mobile money wallet (per Paystack’s Ghana transfer rules). You set this up once. Auto-payouts also require the server option and a valid Paystack key."
        ),
        user?.paystackPayoutRegistered
          ? h(
              InlineNotice,
              { key: "pout-ok", variant: "success", className: "mb-3" },
              "This account is registered for automatic Paystack payouts. Paystack uses the account number and institution you select below."
            )
          : h(
              "p",
              { className: "mb-3 text-sm font-medium text-amber-800 dark:text-amber-200" },
              "Not registered yet — for MoMo, your wallet can be under “Mobile money number” or “Account number”; for banks, use account name and number. Then pick the bank or MoMo network and link."
            ),
        banksLoadErr
          ? h(InlineNotice, { key: "banks-err", variant: "error", className: "mb-3", onDismiss: () => setBanksLoadErr("") }, banksLoadErr)
          : null,
        !banksLoading && !banksLoadErr && ghanaBanks.length === 0
          ? h(
              InlineNotice,
              { key: "banks-empty", variant: "warning", className: "mb-3" },
              "No banks or mobile money networks were returned from Paystack. Check that PAYSTACK_SECRET_KEY is set on the server and that your Paystack business supports Ghana transfers, then refresh this page."
            )
          : null,
        h(Field, { label: "Payout destination (Ghana — Paystack list)" }, [
          banksLoading
            ? h("p", { className: "text-sm text-slate-500" }, "Loading banks and mobile money networks…")
            : h(
                "select",
                {
                  className:
                    "w-full rounded-xl border border-slate-300/70 bg-white/80 px-3 py-2.5 text-sm text-slate-900 dark:border-white/10 dark:bg-night-900/80 dark:text-slate-100",
                  value: payoutBankKey,
                  onChange: (e) => setPayoutBankKey(e.target.value)
                },
                [
                  h("option", { value: "" }, "Select bank or mobile money…"),
                  ghanaBanks.filter((b) => b.channel === "ghipss").length
                    ? h("optgroup", { key: "og-b", label: "Banks" }, [
                        ...ghanaBanks
                          .filter((b) => b.channel === "ghipss")
                          .map((b) =>
                            h("option", { key: `g-${b.code}`, value: `ghipss|${b.code}` }, b.name || b.code)
                          )
                      ])
                    : null,
                  ghanaBanks.filter((b) => b.channel === "mobile_money").length
                    ? h("optgroup", { key: "og-m", label: "Mobile money" }, [
                        ...ghanaBanks
                          .filter((b) => b.channel === "mobile_money")
                          .map((b) =>
                            h("option", { key: `m-${b.code}`, value: `mobile_money|${b.code}` }, b.name || b.code)
                          )
                      ])
                    : null
                ].filter(Boolean)
              )
        ]),
        payoutBankKey.startsWith("mobile_money|")
          ? h(
              "p",
              { key: "momo-hint", className: "mt-2 text-xs text-slate-500 dark:text-slate-400" },
              "For mobile money, use the wallet number as “Account number” and the name registered on that MoMo line as “Account name” above."
            )
          : null,
        payoutErr
          ? h(InlineNotice, { key: "pout-err", variant: "error", className: "mt-2", onDismiss: () => setPayoutErr("") }, payoutErr)
          : null,
        payoutOk
          ? h(InlineNotice, { key: "pout-done", variant: "success", className: "mt-2", onDismiss: () => setPayoutOk("") }, payoutOk)
          : null,
        h(Button, {
          className: "mt-3 w-full sm:w-auto",
          type: "button",
          loading: registeringPayout,
          onClick: registerPaystackPayout
        }, user?.paystackPayoutRegistered ? "Update bank for Paystack payouts" : "Link bank for Paystack payouts")
      ]),
      h(GlassPanel, { className: "!border-rose-500/30 !bg-rose-500/[0.05]" }, [
        h("h2", { className: "mb-2 flex items-center gap-2 font-semibold text-rose-700 dark:text-rose-300" }, [
          h(Trash2, { className: "h-4 w-4" }),
          "Delete account"
        ]),
        h(
          "p",
          { className: "text-sm text-slate-600 dark:text-slate-300" },
          "This is permanent. Account deletion is blocked if you still have active sales orders."
        ),
        h("div", { className: "mt-4 space-y-3" }, [
          h(Field, { label: "Current password" }, h(TextInput, {
            type: "password",
            value: deletePassword,
            onChange: (e) => setDeletePassword(e.target.value),
            placeholder: "Your password"
          })),
          h(Field, { label: 'Type DELETE to confirm' }, h(TextInput, {
            value: deleteConfirm,
            onChange: (e) => setDeleteConfirm(e.target.value),
            placeholder: "DELETE"
          })),
          h(Button, {
            type: "button",
            variant: "ghost",
            className: "!border-rose-500/30 !text-rose-700 dark:!text-rose-300",
            onClick: removeAccount,
            loading: deleting,
            disabled: !deletePassword.trim() || deleteConfirm.trim().toUpperCase() !== "DELETE"
          }, "Delete seller account")
        ])
      ])
    ]),
    h("div", { className: "space-y-6" }, [
      h(GlassCard, {}, [
        h("div", { className: "mx-auto" }, vendorUserAvatarNode(user, { sizeClass: "h-24 w-24", initialTextClass: "text-2xl" })),
        h("p", { className: "mt-3 text-center font-semibold text-slate-900 dark:text-white" }, user?.displayName || "Vendor"),
        h("p", { className: "text-center text-sm text-slate-500 dark:text-slate-400" }, user?.email || "")
      ])
    ])
  ]);
}

export function VendorProfilePage() {
  const { accessToken, user, setUser } = useAuth();
  const [me, setMe] = useState(null);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch("/api/auth/me", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => {
        if (d.user) {
          setMe(d.user);
          setUser(d.user);
        }
      })
      .catch(() => {});
  }, [accessToken, setUser]);

  const u = me || user;

  return h(GlassPanel, {}, [
    h("h1", { className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, "Vendor profile"),
    h("div", { className: "mb-4 mt-4 flex flex-col items-center sm:flex-row sm:items-start sm:gap-6" }, [
      h("div", { className: "shrink-0" }, vendorUserAvatarNode(u, { sizeClass: "h-28 w-28", initialTextClass: "text-3xl" })),
      h("div", { className: "min-w-0 text-center sm:mt-2 sm:text-left" }, [
        h("p", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, u?.displayName || "Vendor"),
        h("p", { className: "mt-1 text-sm text-slate-500 dark:text-slate-400" }, u?.email || "")
      ])
    ]),
    h("p", { className: "mb-4 text-sm text-slate-600 dark:text-slate-400" }, "Details below are synced from your account. Change your photo in Vendor settings."),
    h("dl", { className: "mt-6 space-y-3 text-sm" }, [
      h("div", {}, [h("dt", { className: "text-slate-500 dark:text-slate-400" }, "Email"), h("dd", { className: "font-medium text-slate-900 dark:text-white" }, u?.email || "—")]),
      h("div", {}, [h("dt", { className: "text-slate-500 dark:text-slate-400" }, "Display name"), h("dd", { className: "font-medium" }, u?.displayName || "—")]),
      h("div", {}, [h("dt", { className: "text-slate-500 dark:text-slate-400" }, "MoMo (payments)"), h("dd", { className: "font-mono font-medium" }, u?.phone || "—")]),
      h("div", {}, [h("dt", { className: "text-slate-500 dark:text-slate-400" }, "Bank"), h("dd", { className: "font-medium" }, u?.bankName || "—")]),
      h("div", {}, [h("dt", { className: "text-slate-500 dark:text-slate-400" }, "Account name"), h("dd", { className: "font-medium" }, u?.bankAccountName || "—")]),
      h("div", {}, [h("dt", { className: "text-slate-500 dark:text-slate-400" }, "Account no."), h("dd", { className: "font-medium" }, u?.bankAccountNumber || "—")]),
      h("div", {}, [h("dt", { className: "text-slate-500 dark:text-slate-400" }, "Role"), h("dd", { className: "font-medium" }, u?.role || "—")])
    ]),
    h(Link, { to: "/vendor/settings" }, h(Button, { variant: "ghost", className: "mt-6" }, "Edit in settings"))
  ]);
}
