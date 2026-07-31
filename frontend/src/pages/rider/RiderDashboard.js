import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Clock,
  LogOut,
  Navigation2,
  Package,
  RefreshCw,
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
 * PATCH /api/deliveries/:orderId/accept          -> { assignment } (rider accepts a new assignment)
 * PATCH /api/deliveries/:orderId/decline         -> { ok: true }   (rider declines a new assignment)
 * PATCH /api/deliveries/:orderId/status  {status}-> { assignment } (status: "picked_up" | "delivered")
 *
 * If your routes/field names differ, the small getters below (getAddress,
 * getFee, getAcceptance) are the only places you should need to edit —
 * everything else reads through them.
 * ─────────────────────────────────────────────────────────────────────── */

const STATUS_FLOW = ["assigned", "picked_up", "delivered"];

function getAddress(a) {
  return a.deliveryAddress || a.address || a.customerAddress || a.dropoffAddress || "";
}

function getFee(a) {
  const v = a.deliveryFee ?? a.riderFee ?? a.fee ?? null;
  return typeof v === "number" ? v : null;
}

function getAcceptance(a) {
  // "pending" -> rider hasn't accepted/declined yet; anything else counts as accepted.
  return a.riderAcceptance || (a.orderStatus === "assigned" ? "pending" : "accepted");
}

function formatMoney(n, currency = "GHS") {
  if (typeof n !== "number") return "—";
  try {
    return new Intl.NumberFormat("en-GH", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function navigateUrl(address) {
  if (!address) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

export default function RiderDashboard() {
  const { accessToken, user, logout } = useAuth();
  const { dark, toggle } = useTheme();

  const [assignments, setAssignments] = useState([]);
  const [err, setErr] = useState("");
  const [selOrderId, setSelOrderId] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // Per-order action state, e.g. { [orderId]: { loading: true, error: "" } }
  const [actionState, setActionState] = useState({});

  const setOrderAction = (orderId, patch) => {
    setActionState((prev) => ({ ...prev, [orderId]: { ...prev[orderId], ...patch } }));
  };

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
    return () => {
      cancelled = true;
    };
  }, [accessToken, loadAssignments]);

  const onLogout = async () => {
    try {
      await logout();
    } catch {
      /* ignore */
    }
  };

  const runOrderAction = async (orderId, { url, method = "PATCH", body, onDone }) => {
    setOrderAction(orderId, { loading: true, error: "" });
    try {
      const d = await apiFetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(body ? { "Content-Type": "application/json" } : {})
        },
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
      onDone: () => {
        setAssignments((prev) =>
          prev.map((a) => (a.orderId === orderId ? { ...a, riderAcceptance: "accepted" } : a))
        );
      }
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
      onDone: () => {
        setAssignments((prev) =>
          prev.map((a) => (a.orderId === orderId ? { ...a, orderStatus: nextStatus } : a))
        );
      }
    });

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

      // ── Header ──────────────────────────────────────────────
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
                "Courier workspace · Live map & handoff controls"
              )
            ])
          ]),
          h("div", { key: "actions", className: "flex flex-wrap items-center gap-2" }, [
            h(ThemeToggleButton, { key: "th", dark, onToggle: toggle }),
            h(
              Link,
              {
                key: "shop",
                className:
                  "inline-flex rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-sky-600 transition hover:bg-slate-50 dark:border-white/15 dark:bg-white/5 dark:text-sky-300 dark:hover:bg-white/10",
                to: "/"
              },
              "Shop"
            ),
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

      // ── Error / empty states ────────────────────────────────
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
            "No active courier assignments yet. Sellers or admins attach you to orders from their dashboards using your user ID — then reload this page."
          )
        : null,

      // ── Assignment tabs + panel ─────────────────────────────
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
                    const pending = getAcceptance(a) === "pending";
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
                            : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/15 dark:bg-night-900 dark:text-slate-300 dark:hover:bg-night-900/80",
                          pending && selOrderId !== a.orderId ? "ring-1 ring-amber-400/70" : ""
                        ]
                          .filter(Boolean)
                          .join(" ")
                      },
                      `#${String(a.orderId).slice(-8)} · ${(a.orderStatus || "").replace(/_/g, " ")}`
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

              selected ? h(AssignmentPanel, {
                key: "panel",
                assignment: selected,
                accessToken,
                actionState: actionState[selected.orderId] || {},
                onAccept: () => handleAccept(selected.orderId),
                onDecline: () => handleDecline(selected.orderId),
                onAdvanceStatus: (next) => handleAdvanceStatus(selected.orderId, next)
              }) : null
            ].filter(Boolean)
          )
        : null
    )
  );
}

function AssignmentPanel({ assignment: a, accessToken, actionState, onAccept, onDecline, onAdvanceStatus }) {
  const pending = getAcceptance(a) === "pending";
  const address = getAddress(a);
  const fee = getFee(a);
  const mapsUrl = navigateUrl(address);
  const busy = Boolean(actionState.loading);

  const currentIdx = STATUS_FLOW.indexOf(a.orderStatus);
  const nextStatus = currentIdx >= 0 && currentIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIdx + 1] : null;
  const nextLabel =
    nextStatus === "picked_up" ? "Mark picked up" : nextStatus === "delivered" ? "Mark delivered" : null;

  return h(
    "div",
    {
      className:
        "space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-night-900/50"
    },
    [
      // Info row: address / fee / navigate
      h(
        "div",
        { key: "info", className: "flex flex-wrap items-start justify-between gap-3" },
        [
          h("div", { key: "addr", className: "min-w-0" }, [
            h(
              "p",
              { key: "lab", className: "text-[10px] font-bold uppercase tracking-wide text-slate-500" },
              "Delivery address"
            ),
            h(
              "p",
              { key: "val", className: "text-sm font-medium text-slate-800 dark:text-slate-100" },
              address || "Not provided"
            )
          ]),
          h("div", { key: "right", className: "flex items-center gap-2" }, [
            fee != null
              ? h(
                  "span",
                  {
                    key: "fee",
                    className:
                      "rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
                  },
                  formatMoney(fee)
                )
              : null,
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

      actionState.error
        ? h(
            "p",
            {
              key: "aerr",
              className:
                "rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
            },
            actionState.error
          )
        : null,

      // Accept / decline OR status advance controls
      pending
        ? h("div", { key: "accept-row", className: "flex flex-wrap gap-2" }, [
            h(
              "button",
              {
                key: "accept",
                type: "button",
                disabled: busy,
                onClick: onAccept,
                className:
                  "inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              },
              [
                h(CheckCircle2, { key: "ic", className: "h-4 w-4" }),
                h("span", { key: "tx" }, busy ? "Working…" : "Accept")
              ]
            ),
            h(
              "button",
              {
                key: "decline",
                type: "button",
                disabled: busy,
                onClick: onDecline,
                className:
                  "inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
              },
              [
                h(XCircle, { key: "ic", className: "h-4 w-4" }),
                h("span", { key: "tx" }, "Decline")
              ]
            )
          ])
        : h("div", { key: "status-row", className: "flex flex-wrap items-center gap-3" }, [
            h(
              "span",
              {
                key: "cur",
                className:
                  "inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300"
              },
              [
                h(Clock, { key: "ic", className: "h-3.5 w-3.5" }),
                h("span", { key: "tx" }, (a.orderStatus || "").replace(/_/g, " ") || "assigned")
              ]
            ),
            nextLabel
              ? h(
                  "button",
                  {
                    key: "advance",
                    type: "button",
                    disabled: busy,
                    onClick: () => onAdvanceStatus(nextStatus),
                    className:
                      "inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                  },
                  busy ? "Working…" : nextLabel
                )
              : h(
                  "span",
                  { key: "done", className: "text-xs font-medium text-emerald-600 dark:text-emerald-400" },
                  "Delivered — nice work"
                )
          ]),

      // Live map / handoff
      h(
        "div",
        { key: "live", className: "rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5" },
        h(DeliveryLive, { mode: "rider", accessToken, orderId: a.orderId, variant: "embedded" })
      )
    ].filter(Boolean)
  );
}