import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Bike,
  Camera,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  History,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  Navigation2,
  Package,
  Phone,
  RefreshCw,
  Star,
  User,
  X
} from "lucide-react";
import { useAuth, useTheme } from "context";
import { apiFetch, apiErrorMessage, apiUploadProfileImage } from "services/api";
import { DeliveryLive } from "components/features/DeliveryLive";
import { ThemeToggleButton, Button, TextInput, Field } from "components/ui";
import { containsContactSharing, CONTACT_SHARING_BLOCKED_MESSAGE } from "utils/contactSharingGuard";
import { h } from "utils/h";

/**
 * Backend contract:
 * GET  /api/deliveries/rider/assignments
 * GET  /api/deliveries/rider/assignments?includeCompleted=1
 * PATCH /api/deliveries/order/:orderId/stage  (via DeliveryLive)
 * POST /api/deliveries/order/:orderId/rider-location
 * GET/POST /api/conversations (help & delivery chats)
 * PATCH /api/auth/profile + POST /api/uploads/profile-image
 */

const NAV = [
  { id: "active", label: "Active Delivery", icon: Navigation2 },
  { id: "assigned", label: "Assigned Orders", icon: Package },
  { id: "history", label: "Delivery History", icon: History },
  { id: "profile", label: "Profile", icon: User },
  { id: "help", label: "Help & Support", icon: CircleHelp }
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
  const { accessToken, user, logout, setUser } = useAuth();
  const { dark, toggle } = useTheme();

  const [tab, setTab] = useState("active");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [assignments, setAssignments] = useState([]);
  const [history, setHistory] = useState([]);
  const [err, setErr] = useState("");
  const [selOrderId, setSelOrderId] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState(() => readOnlinePref());
  const [helpPeerId, setHelpPeerId] = useState(null);

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
          const badge = item.id === "assigned" ? assignments.length : null;
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
              },
              onMessagePeer: (peerId) => {
                if (!peerId) return;
                setHelpPeerId(String(peerId));
                goTab("help");
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
    mainBody = h(RiderProfilePanel, {
      user,
      accessToken,
      setUser,
      display,
      riderId,
      rating,
      photo,
      online,
      setOnline,
      dark,
      toggle,
      onLogout
    });
  } else if (tab === "help") {
    mainBody = h(RiderMessagesInbox, {
      accessToken,
      initialPeerId: helpPeerId,
      onPeerConsumed: () => setHelpPeerId(null)
    });
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

function ActiveDeliveryView({
  assignment: a,
  assignments,
  selOrderId,
  setSelOrderId,
  accessToken,
  onDeliveryUpdate,
  onMessagePeer
}) {
  const address = getAddress(a);
  const stage = getStage(a);
  const dropNav = navigateUrl(a, false);
  const pickNav = navigateUrl(a, true);
  const phone = String(a.buyerPhone || "").replace(/[^\d+]/g, "");
  const telHref = phone ? `tel:${phone}` : null;
  const [busyStage, setBusyStage] = useState("");
  const [stageErr, setStageErr] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [otp, setOtp] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [note, setNote] = useState("");
  const [resending, setResending] = useState(false);

  const progress = [
    {
      key: "confirmed",
      label: "Order Confirmed",
      done: !!stage && stage !== "cancelled"
    },
    { key: "picked_up", label: "Picked Up", done: ["picked_up", "on_the_way", "delivered"].includes(stage) },
    { key: "on_the_way", label: "Out for Delivery", done: ["on_the_way", "delivered"].includes(stage) },
    { key: "delivered", label: "Delivered", done: stage === "delivered" }
  ];

  const nextAction =
    stage === "delivered" || stage === "cancelled"
      ? null
      : stage === "on_the_way"
        ? { stage: "delivered", label: "Confirm Delivery" }
        : stage === "picked_up"
          ? { stage: "on_the_way", label: "On the way" }
          : { stage: "picked_up", label: "Mark picked up" };

  const patchStage = async (next, proof) => {
    setBusyStage(next);
    setStageErr("");
    try {
      const body = { stage: next };
      if (proof) {
        if (proof.deliveryOtp) body.deliveryOtp = proof.deliveryOtp;
        if (proof.receivedByName) body.receivedByName = proof.receivedByName;
        if (proof.deliveryNote) body.deliveryNote = proof.deliveryNote;
      }
      await apiFetch(`/api/deliveries/order/${encodeURIComponent(a.orderId)}/stage`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: body
      });
      setShowConfirm(false);
      setShowOtp(false);
      setOtp("");
      setReceivedBy("");
      setNote("");
      onDeliveryUpdate?.();
    } catch (ex) {
      setStageErr(apiErrorMessage(ex, "Could not update delivery status."));
    } finally {
      setBusyStage("");
    }
  };

  const onPrimaryClick = () => {
    if (!nextAction) return;
    if (nextAction.stage === "delivered") {
      setShowConfirm(true);
      setShowOtp(false);
      return;
    }
    void patchStage(nextAction.stage);
  };

  const submitOtp = async () => {
    const code = otp.replace(/\D/g, "");
    if (code.length !== 6) {
      setStageErr("Enter the 6-digit code from the customer.");
      return;
    }
    await patchStage("delivered", {
      deliveryOtp: code,
      receivedByName: receivedBy.trim(),
      deliveryNote: note.trim()
    });
  };

  const resendOtp = async () => {
    setResending(true);
    setStageErr("");
    try {
      await apiFetch(`/api/deliveries/order/${encodeURIComponent(a.orderId)}/resend-delivery-otp`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: {}
      });
      setStageErr("");
    } catch (ex) {
      setStageErr(apiErrorMessage(ex, "Could not resend the code."));
    } finally {
      setResending(false);
    }
  };

  const msgBtns = h(
    "div",
    { key: "msg", className: "flex flex-wrap gap-2" },
    [
      a.buyerId
        ? h(
            "button",
            {
              key: "mb",
              type: "button",
              onClick: () => onMessagePeer?.(a.buyerId),
              className:
                "inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-night-900 dark:text-slate-200"
            },
            [h(MessageSquare, { className: "h-3.5 w-3.5 text-orange-500" }), "Message customer"]
          )
        : null,
      a.vendorId
        ? h(
            "button",
            {
              key: "mv",
              type: "button",
              onClick: () => onMessagePeer?.(a.vendorId),
              className:
                "inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-night-900 dark:text-slate-200"
            },
            [h(MessageSquare, { className: "h-3.5 w-3.5 text-sky-500" }), "Message vendor"]
          )
        : null
    ].filter(Boolean)
  );

  const actionCard = nextAction
    ? h(
        "div",
        {
          key: "cta",
          className: "rounded-2xl border border-orange-200/80 bg-orange-50/90 p-3 dark:border-orange-900/40 dark:bg-orange-950/25"
        },
        [
          !showConfirm && !showOtp
            ? h("div", { key: "main" }, [
                h(
                  "p",
                  { className: "text-[10px] font-bold uppercase tracking-wider text-orange-800/80 dark:text-orange-200/80" },
                  "Next step"
                ),
                h(
                  "button",
                  {
                    type: "button",
                    disabled: Boolean(busyStage),
                    onClick: onPrimaryClick,
                    className:
                      "mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-900/25 hover:brightness-105 disabled:opacity-60"
                  },
                  [
                    busyStage === nextAction.stage ? "Saving…" : nextAction.label,
                    h(ChevronRight, { className: "h-4 w-4" })
                  ]
                ),
                h(
                  "p",
                  { className: "mt-2 text-[11px] leading-relaxed text-orange-950/80 dark:text-orange-100/80" },
                  nextAction.stage === "picked_up"
                    ? "Tap when you have collected the order from the vendor."
                    : nextAction.stage === "on_the_way"
                      ? "Tap when you leave for the customer — they get a 6-digit delivery code."
                      : "Tap when the customer has the order. You’ll enter their 6-digit code next."
                )
              ])
            : showConfirm
              ? h("div", { key: "confirm", className: "space-y-2" }, [
                  h("p", { className: "text-sm font-semibold text-orange-950 dark:text-orange-50" }, "Confirm this order was delivered?"),
                  h(
                    "p",
                    { className: "text-[11px] text-orange-900/90 dark:text-orange-100/80" },
                    "Next you’ll enter the 6-digit code we sent to the customer."
                  ),
                  h("div", { className: "flex gap-2" }, [
                    h(
                      "button",
                      {
                        type: "button",
                        className: "flex-1 rounded-xl bg-orange-500 px-3 py-2.5 text-sm font-bold text-white",
                        onClick: () => {
                          setShowConfirm(false);
                          setShowOtp(true);
                        }
                      },
                      "Yes, continue"
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        className:
                          "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold dark:border-white/15 dark:bg-night-950",
                        onClick: () => setShowConfirm(false)
                      },
                      "Cancel"
                    )
                  ])
                ])
              : h("div", { key: "otp", className: "space-y-2" }, [
                  h(
                    "p",
                    { className: "text-[11px] leading-relaxed text-orange-950 dark:text-orange-50" },
                    "Ask the customer for the 6-digit code (SMS/email). They should only share it when they have the order."
                  ),
                  h("input", {
                    type: "text",
                    inputMode: "numeric",
                    maxLength: 6,
                    value: otp,
                    onChange: (e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)),
                    placeholder: "6-digit code",
                    className:
                      "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-center text-lg font-bold tracking-[0.35em] dark:border-white/15 dark:bg-night-950 dark:text-white"
                  }),
                  h(
                    "button",
                    {
                      type: "button",
                      disabled: resending,
                      className: "text-[11px] font-semibold text-sky-700 underline dark:text-sky-300",
                      onClick: () => void resendOtp()
                    },
                    resending ? "Resending…" : "Resend code to customer"
                  ),
                  h("input", {
                    type: "text",
                    value: receivedBy,
                    onChange: (e) => setReceivedBy(e.target.value),
                    placeholder: "Received by (optional)",
                    className:
                      "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-night-950 dark:text-white"
                  }),
                  h("div", { className: "flex gap-2" }, [
                    h(
                      "button",
                      {
                        type: "button",
                        disabled: Boolean(busyStage),
                        className:
                          "flex-1 rounded-xl bg-orange-500 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-60",
                        onClick: () => void submitOtp()
                      },
                      busyStage === "delivered" ? "Submitting…" : "Confirm with code"
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        className:
                          "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold dark:border-white/15 dark:bg-night-950",
                        onClick: () => {
                          setShowOtp(false);
                          setOtp("");
                        }
                      },
                      "Cancel"
                    )
                  ])
                ]),
          stageErr
            ? h("p", { key: "err", className: "mt-2 text-xs font-medium text-rose-600 dark:text-rose-300" }, stageErr)
            : null
        ].filter(Boolean)
      )
    : stage === "delivered"
      ? h(
          "p",
          {
            key: "done",
            className:
              "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200"
          },
          "Delivery confirmed."
        )
      : null;

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

      msgBtns,

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
                  !step.done && nextAction?.stage === step.key
                    ? h("p", { className: "text-[11px] font-semibold text-orange-600" }, "Your next step →")
                    : !step.done
                      ? h("p", { className: "text-[11px] text-slate-400" }, "Pending")
                      : null
                ].filter(Boolean))
              ]
            )
          )
        ]
      ),

      actionCard,

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
        "div",
        {
          key: "howto",
          className:
            "rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-[11px] leading-relaxed text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300"
        },
        [
          h("p", { className: "font-bold text-slate-800 dark:text-slate-100" }, "How confirmation works"),
          h("ol", { className: "mt-1.5 list-decimal space-y-1 pl-4" }, [
            h("li", null, "Use the orange Next step button above (or Rider controls under the map)."),
            h("li", null, "On the way sends the buyer a 6-digit code."),
            h("li", null, "Confirm Delivery → enter that code. The buyer does not tap confirm in the app.")
          ])
        ]
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

function RiderProfilePanel({
  user,
  accessToken,
  setUser,
  display,
  riderId,
  rating,
  photo,
  online,
  setOnline,
  dark,
  toggle,
  onLogout
}) {
  const [displayName, setDisplayName] = useState(String(user?.displayName || display || ""));
  const [phone, setPhone] = useState(String(user?.phone || ""));
  const [saving, setSaving] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    setDisplayName(String(user?.displayName || display || ""));
    setPhone(String(user?.phone || ""));
  }, [user?.displayName, user?.phone, display]);

  const onPickPhoto = async (e) => {
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
      setErr(apiErrorMessage(ex, "Upload failed"));
    } finally {
      setPhotoLoading(false);
    }
  };

  const clearPhoto = async () => {
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
      setErr(apiErrorMessage(ex, "Could not remove photo"));
    } finally {
      setPhotoLoading(false);
    }
  };

  const save = async () => {
    if (!accessToken) return;
    setErr("");
    setOk("");
    setSaving(true);
    try {
      const data = await apiFetch("/api/auth/profile", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: { displayName: displayName.trim(), phone: phone.trim() }
      });
      if (data.user) setUser(data.user);
      setOk("Profile saved.");
    } catch (ex) {
      setErr(apiErrorMessage(ex, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  return h(
    "div",
    {
      className:
        "space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-night-900/60 sm:p-6"
    },
    [
      h("div", { key: "hd", className: "flex flex-wrap items-start justify-between gap-3" }, [
        h("div", {}, [
          h("h2", { className: "text-lg font-bold text-slate-900 dark:text-white" }, "Profile"),
          h("p", { className: "mt-1 text-xs text-slate-500" }, `${riderId} · ${rating} rating`)
        ]),
        h(
          "span",
          {
            className: `inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
              online
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-slate-200 text-slate-600 dark:bg-white/10 dark:text-slate-400"
            }`
          },
          online ? "Online" : "Offline"
        )
      ]),

      h("div", { key: "photo", className: "flex flex-wrap items-center gap-4" }, [
        photo
          ? h("img", {
              src: photo,
              alt: "",
              className: "h-20 w-20 rounded-full object-cover ring-2 ring-orange-500/40"
            })
          : h(
              "div",
              {
                className:
                  "flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-2xl font-bold text-white"
              },
              String(displayName || display || "R").slice(0, 1).toUpperCase()
            ),
        h("div", { className: "flex flex-wrap gap-2" }, [
          h("input", {
            ref: fileRef,
            type: "file",
            accept: "image/jpeg,image/png,image/webp,image/gif",
            className: "hidden",
            onChange: onPickPhoto
          }),
          h(
            Button,
            {
              type: "button",
              className: "!rounded-xl",
              loading: photoLoading,
              onClick: () => fileRef.current?.click()
            },
            [h(Camera, { className: "mr-1.5 h-4 w-4" }), "Change photo"]
          ),
          photo
            ? h(
                Button,
                { type: "button", variant: "ghost", className: "!rounded-xl", loading: photoLoading, onClick: clearPhoto },
                "Remove"
              )
            : null
        ].filter(Boolean))
      ]),

      h(Field, { key: "dn", label: "Display name" }, h(TextInput, { value: displayName, onChange: (e) => setDisplayName(e.target.value), maxLength: 80 })),
      h(Field, { key: "ph", label: "Phone number" }, h(TextInput, { value: phone, onChange: (e) => setPhone(e.target.value), placeholder: "e.g. 024XXXXXXX", maxLength: 30 })),
      user?.email
        ? h("p", { key: "em", className: "text-xs text-slate-500" }, `Signed in as ${user.email}`)
        : null,

      err ? h("p", { key: "err", className: "text-sm font-medium text-rose-600 dark:text-rose-300" }, err) : null,
      ok ? h("p", { key: "ok", className: "text-sm font-medium text-emerald-600 dark:text-emerald-300" }, ok) : null,

      h(
        Button,
        { key: "save", type: "button", className: "!rounded-xl !bg-orange-500 hover:!bg-orange-600", loading: saving, onClick: save },
        "Save profile"
      ),

      h("div", { key: "prefs", className: "grid gap-3 border-t border-slate-100 pt-4 dark:border-white/10 sm:grid-cols-2" }, [
        h("div", { className: "flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 dark:border-white/10" }, [
          h("div", {}, [
            h("p", { className: "text-sm font-semibold text-slate-800 dark:text-slate-100" }, "Appearance"),
            h("p", { className: "text-xs text-slate-500" }, "Light / dark")
          ]),
          h(ThemeToggleButton, { dark, onToggle: toggle })
        ]),
        h("div", { className: "flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 dark:border-white/10" }, [
          h("div", {}, [
            h("p", { className: "text-sm font-semibold text-slate-800 dark:text-slate-100" }, "Availability"),
            h("p", { className: "text-xs text-slate-500" }, online ? "You are online" : "You are offline")
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
        ])
      ]),

      h(
        "button",
        {
          key: "out",
          type: "button",
          onClick: () => onLogout(),
          className:
            "inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-300 dark:hover:bg-rose-950/40"
        },
        [h(LogOut, { className: "h-4 w-4" }), "Sign out"]
      )
    ].filter(Boolean)
  );
}

function RiderMessagesInbox({ accessToken, initialPeerId, onPeerConsumed }) {
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
  }, [initialPeerId]);

  const loadThreads = useCallback(() => {
    if (!accessToken) return Promise.resolve();
    return apiFetch("/api/conversations", {
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
        if (!cancelled) setErr(apiErrorMessage(ex, "Could not load messages"));
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
    if (selectPeerOnLoadRef.current && initialPeerId && ids.includes(String(initialPeerId))) {
      setActiveId(String(initialPeerId));
      setMobileShowChat(true);
      selectPeerOnLoadRef.current = false;
      onPeerConsumed?.();
      return;
    }
    selectPeerOnLoadRef.current = false;
    setActiveId((cur) => (cur && ids.includes(String(cur)) ? cur : String(threads[0].peerUserId)));
  }, [threads, initialPeerId, onPeerConsumed]);

  const activeThread = useMemo(
    () => threads.find((t) => String(t.peerUserId) === String(activeId)) || null,
    [threads, activeId]
  );

  const threadPreview = useCallback((t) => {
    const msgs = t.messages || [];
    if (!msgs.length) return "No messages yet — say hello.";
    const last = msgs[msgs.length - 1];
    const s = String(last.text || "").replace(/\s+/g, " ").trim();
    return s.length > 80 ? `${s.slice(0, 80)}…` : s || "…";
  }, []);

  const sendReply = async (peerUserId) => {
    const pid = String(peerUserId || "");
    const text = String(replyByPeer[pid] || "").trim();
    if (!text || !accessToken) return;
    if (containsContactSharing(text)) {
      setErr(CONTACT_SHARING_BLOCKED_MESSAGE);
      return;
    }
    setErr("");
    setSending(pid);
    try {
      await apiFetch(`/api/conversations/by-peer/${encodeURIComponent(pid)}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: { text }
      });
      setReplyByPeer((prev) => ({ ...prev, [pid]: "" }));
      await loadThreads();
    } catch (ex) {
      setErr(apiErrorMessage(ex, "Could not send reply"));
    } finally {
      setSending(null);
    }
  };

  const peerBadge = (t) => {
    if (t?.isSupport) return "Support";
    if (t?.peerRole === "buyer") return "Customer";
    if (t?.peerRole === "seller") return "Vendor";
    return "Chat";
  };

  if (loading) {
    return h("p", { className: "text-sm text-slate-500" }, "Loading messages…");
  }

  return h("div", { className: "space-y-3" }, [
    h("div", { key: "intro" }, [
      h("h2", { className: "text-lg font-bold text-slate-900 dark:text-white" }, "Help & Support"),
      h(
        "p",
        { className: "mt-1 text-sm text-slate-500 dark:text-slate-400" },
        "Message SHOPIQGH Support, your delivery customer, or the vendor — same in-app chat as buyers use."
      )
    ]),
    err
      ? h(
          "p",
          {
            key: "err",
            className:
              "rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-400/35 dark:bg-rose-950/40 dark:text-rose-200"
          },
          err
        )
      : null,
    !threads.length
      ? h(EmptyState, {
          key: "empty",
          title: "No conversations yet",
          body: "SHOPIQGH Support appears when an admin is configured. Customer and vendor chats show for your assigned deliveries."
        })
      : h(
          "div",
          {
            key: "shell",
            className:
              "flex min-h-[min(28rem,calc(100dvh-14rem))] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-night-900/50 md:flex-row"
          },
          [
            h(
              "aside",
              {
                key: "list",
                className: `flex max-h-[40vh] shrink-0 flex-col border-slate-100 dark:border-white/10 md:max-h-none md:w-[min(100%,17rem)] md:border-r ${
                  mobileShowChat ? "max-md:hidden" : "max-md:flex"
                }`
              },
              [
                h("div", { className: "border-b border-slate-100 px-4 py-3 dark:border-white/10" }, [
                  h("p", { className: "text-sm font-semibold text-slate-900 dark:text-white" }, "Chats")
                ]),
                h(
                  "div",
                  { className: "min-h-0 flex-1 overflow-y-auto" },
                  threads.map((t) => {
                    const selected = String(t.peerUserId) === String(activeId);
                    return h(
                      "button",
                      {
                        key: t.peerUserId,
                        type: "button",
                        onClick: () => {
                          setActiveId(String(t.peerUserId));
                          setMobileShowChat(true);
                        },
                        className: `flex w-full flex-col gap-1 border-b border-slate-50 px-4 py-3 text-left transition dark:border-white/5 ${
                          selected ? "bg-orange-500/10" : "hover:bg-slate-50 dark:hover:bg-white/5"
                        }`
                      },
                      [
                        h("div", { className: "flex items-center justify-between gap-2" }, [
                          h("span", { className: "truncate text-sm font-semibold text-slate-800 dark:text-slate-100" }, t.peerDisplayName || "Chat"),
                          h(
                            "span",
                            {
                              className:
                                "shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:bg-white/10 dark:text-slate-300"
                            },
                            peerBadge(t)
                          )
                        ]),
                        h("p", { className: "line-clamp-2 text-xs text-slate-500" }, threadPreview(t))
                      ]
                    );
                  })
                )
              ]
            ),
            activeThread
              ? h(
                  "section",
                  {
                    key: "chat",
                    className: `flex min-w-0 flex-1 flex-col ${mobileShowChat ? "max-md:flex" : "max-md:hidden"}`
                  },
                  [
                    h("div", { className: "flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/10" }, [
                      h(
                        "button",
                        {
                          type: "button",
                          className: "rounded-lg p-1.5 text-slate-500 md:hidden",
                          onClick: () => setMobileShowChat(false)
                        },
                        h(X, { className: "h-4 w-4" })
                      ),
                      h("div", { className: "min-w-0" }, [
                        h("p", { className: "truncate font-semibold text-slate-900 dark:text-white" }, activeThread.peerDisplayName),
                        h("p", { className: "text-[11px] text-slate-500" }, activeThread.itemSummary || peerBadge(activeThread))
                      ])
                    ]),
                    h(
                      "div",
                      { className: "min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3" },
                      (activeThread.messages || []).length
                        ? activeThread.messages.map((m, idx) => {
                            const mine = m.senderLabel === "You";
                            return h(
                              "div",
                              { key: `m-${idx}`, className: `flex ${mine ? "justify-end" : "justify-start"}` },
                              h(
                                "div",
                                {
                                  className: `max-w-[min(100%,22rem)] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                                    mine
                                      ? "rounded-br-md bg-orange-500 text-white"
                                      : "rounded-bl-md border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-night-950 dark:text-slate-100"
                                  }`
                                },
                                [
                                  h("p", { className: "text-[10px] font-bold uppercase opacity-80" }, m.senderLabel),
                                  h("p", { className: "mt-1 whitespace-pre-wrap" }, m.text)
                                ]
                              )
                            );
                          })
                        : h("p", { className: "text-sm text-slate-500" }, "No messages yet. Write the first one.")
                    ),
                    h("div", { className: "border-t border-slate-100 p-3 dark:border-white/10" }, [
                      h("textarea", {
                        rows: 2,
                        value: replyByPeer[String(activeThread.peerUserId)] || "",
                        onChange: (e) =>
                          setReplyByPeer((prev) => ({ ...prev, [String(activeThread.peerUserId)]: e.target.value })),
                        placeholder: "Type a message…",
                        className:
                          "w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-night-950 dark:text-white"
                      }),
                      h(
                        Button,
                        {
                          type: "button",
                          className: "mt-2 !rounded-xl !bg-orange-500 hover:!bg-orange-600",
                          loading: sending === String(activeThread.peerUserId),
                          onClick: () => void sendReply(activeThread.peerUserId)
                        },
                        "Send"
                      )
                    ])
                  ]
                )
              : h("div", { key: "ph", className: "hidden flex-1 items-center justify-center p-8 text-sm text-slate-500 md:flex" }, "Select a conversation")
          ]
        )
  ].filter(Boolean));
}
