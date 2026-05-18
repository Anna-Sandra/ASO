import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { useAuth, useNotifications } from "context";
import { apiFetch } from "services/api";
import { h } from "utils/h";
import { Button, GlassPanel, InlineNotice } from "components/ui";

/** Header bell linking to notifications; hides when logged out.
 * @param {{ to?: string; className?: string; badgeClassName?: string }} [props]
 */
export function NotificationBell({ to = "/notifications", className = "", badgeClassName = "" }) {
  const { accessToken } = useAuth();
  const { unreadCount } = useNotifications();
  if (!accessToken) return null;
  const label =
    unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications";
  const baseLink =
    "relative inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1.5 text-[11px] font-medium transition sm:gap-1.5 sm:px-2.5 sm:text-xs";
  return h(
    Link,
    {
      to,
      className:
        `${baseLink} text-slate-700 hover:bg-violet-50 dark:text-slate-200 dark:hover:bg-white/10 ${className}`.trim(),
      title: label,
      "aria-label": label
    },
    [
      h(Bell, { key: "ic", className: "h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-300 sm:h-4 sm:w-4" }),
      unreadCount > 0
        ? h(
            "span",
            {
              key: "badge",
              className:
                `ml-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-bold text-white sm:h-5 sm:min-w-[1.25rem] sm:text-xs ${badgeClassName}`.trim()
            },
            unreadCount > 99 ? "99+" : String(unreadCount)
          )
        : null
    ].filter(Boolean)
  );
}

/**
 * Notification list — use inside BuyerLayout ({@link BuyerNotificationsPage}) or vendor shell ({@link VendorNotificationsPage}).
 */
export function NotificationsContent({ ordersLink = "/orders", backLink = "/", backLabel = "Shop" }) {
  const { accessToken } = useAuth();
  const { refresh } = useNotifications();
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setErr("");
    try {
      const d = await apiFetch("/api/notifications", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setItems(Array.isArray(d?.notifications) ? d.notifications : []);
    } catch (ex) {
      setErr(ex.message || "Could not load notifications");
      setItems([]);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      setItems([]);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, load]);

  const markRead = async (id) => {
    if (!accessToken || !id) return;
    try {
      await apiFetch(`/api/notifications/${id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: {}
      });
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      await refresh();
    } catch {
      /* ignore */
    }
  };

  const markAll = async () => {
    if (!accessToken || marking) return;
    setMarking(true);
    try {
      await apiFetch("/api/notifications/read-all", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: {}
      });
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      await refresh();
    } catch (ex) {
      setErr(ex.message || "Could not mark all read");
    } finally {
      setMarking(false);
    }
  };

  const orderHref = (oid) =>
    oid && ordersLink ? `${ordersLink}?openOrder=${encodeURIComponent(String(oid))}` : ordersLink;

  const unreadLeft = items.some((n) => !n.read);

  return h("div", { className: "mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 lg:px-8" }, [
    h("div", { key: "head", className: "mb-6 flex flex-wrap items-center justify-between gap-3" }, [
      h(
        Link,
        {
          key: "back",
          to: backLink,
          className: "text-sm font-medium text-sky-600 hover:underline dark:text-sky-300"
        },
        `← ${backLabel}`
      ),
      h(
        Button,
        {
          key: "mall",
          variant: "ghost",
          type: "button",
          disabled: marking || !unreadLeft || items.length === 0 || loading,
          onClick: markAll,
          className: "!text-xs"
        },
        marking ? "…" : "Mark all read"
      )
    ]),
    h(
      "h1",
      { key: "h1", className: "font-display text-2xl font-bold text-slate-900 dark:text-white" },
      "Notifications"
    ),
    err ? h(InlineNotice, { key: "err", variant: "error", className: "mt-4", onDismiss: () => setErr("") }, err) : null,
    loading ? h("p", { key: "ld", className: "mt-6 text-sm text-slate-500 dark:text-slate-400" }, "Loading…") : null,
    !loading &&
      items.length === 0 &&
      h(
        GlassPanel,
        { key: "empty", className: "!mt-6 !p-6" },
        h("p", { className: "text-sm text-slate-600 dark:text-slate-300" }, "No notifications yet.")
      ),
    !loading &&
      items.length > 0 &&
      h(
        "ul",
        { key: "list", className: "mt-6 space-y-3" },
        items.map((n) =>
          h(
            "li",
            { key: n.id },
            h(
              GlassPanel,
              {
                className: `!p-4 ${n.read ? "opacity-75" : "border-l-4 !border-l-sky-500"}`
              },
              h(
                "div",
                { className: "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between" },
                [
                  h("div", { key: "m", className: "min-w-0 flex-1" }, [
                    h("p", { className: "text-sm font-semibold text-slate-900 dark:text-white" }, n.title || "Update"),
                    h("p", { className: "mt-1 text-sm text-slate-600 dark:text-slate-300" }, n.message || ""),
                    n.createdAt
                      ? h(
                          "p",
                          { className: "mt-2 text-xs text-slate-500 dark:text-slate-400" },
                          new Date(n.createdAt).toLocaleString()
                        )
                      : null
                  ]),
                  h("div", { key: "act", className: "flex shrink-0 flex-wrap gap-2" }, [
                    n.orderId
                      ? h(
                          Link,
                          {
                            key: "vo",
                            to: orderHref(n.orderId),
                            className:
                              "inline-flex items-center rounded-xl border border-sky-400/40 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-700 dark:text-sky-200"
                          },
                          "View order"
                        )
                      : null,
                    !n.read
                      ? h(
                          Button,
                          {
                            key: "mr",
                            variant: "ghost",
                            type: "button",
                            className: "!py-1.5 !text-xs",
                            onClick: () => void markRead(n.id)
                          },
                          "Mark read"
                        )
                      : null
                  ].filter(Boolean))
                ].filter(Boolean)
              )
            )
          )
        )
      )
  ]);
}
