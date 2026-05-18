import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LogOut, Package } from "lucide-react";
import { useAuth, useTheme } from "context";
import { apiFetch } from "services/api";
import { DeliveryLive } from "components/features/DeliveryLive";
import { ThemeToggleButton } from "components/ui";
import { h } from "utils/h";

export default function RiderDashboard() {
  const { accessToken, user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const [assignments, setAssignments] = useState([]);
  const [err, setErr] = useState("");
  const [selOrderId, setSelOrderId] = useState("");

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;
    setErr("");
    apiFetch("/api/deliveries/rider/assignments", {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
      .then((d) => {
        if (cancelled) return;
        const list = Array.isArray(d.assignments) ? d.assignments : [];
        setAssignments(list);
        setSelOrderId((prev) => {
          if (prev && list.some((x) => x.orderId === prev)) return prev;
          return list[0]?.orderId || "";
        });
      })
      .catch((ex) => {
        if (!cancelled) setErr(ex?.message || "Could not load assignments");
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const onLogout = async () => {
    try {
      await logout();
    } catch {
      /* ignore */
    }
  };

  const display =
    String(user?.displayName || "").trim() || (user?.email && user.email.split("@")[0]) || "Courier";

  return h(
    "div",
    { className: "min-h-screen bg-night-950 px-4 py-8 pb-24 text-slate-200" },
    h(
      "div",
      { className: "mx-auto flex max-w-4xl flex-col gap-8" },
      h(
        "header",
        { className: "flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6" },
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
                { key: "lab", className: "text-[10px] font-bold uppercase tracking-wider text-slate-500" },
                "SHOPIQGH"
              ),
              h("h1", { key: "nm", className: "text-xl font-semibold text-white" }, display),
              h(
                "p",
                { key: "sub", className: "text-xs text-slate-400" },
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
                  "inline-flex rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-sky-300 transition hover:bg-white/10",
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
                  "inline-flex items-center gap-1 rounded-lg border border-white/15 bg-night-900 px-4 py-2 text-sm font-semibold text-slate-300 hover:bg-night-900/80",
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
              className: "rounded-lg border border-amber-500/35 bg-amber-500/15 px-4 py-3 text-sm text-amber-100"
            },
            err
          )
        : null,
      !err && assignments.length === 0
        ? h(
            "p",
            { key: "empty", className: "text-sm text-slate-400" },
            "No active courier assignments yet. Sellers or admins attach you to orders from their dashboards using your user ID — then reload this page."
          )
        : null,
      assignments.length > 0
        ? h("div", { key: "work", className: "space-y-4" }, [
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
                    className: [
                      "rounded-full px-4 py-1.5 text-xs font-semibold transition",
                      selOrderId === a.orderId
                        ? "bg-sky-600 text-white"
                        : "border border-white/15 bg-night-900 text-slate-300 hover:bg-night-900/80"
                    ].join(" ")
                  },
                  `#${String(a.orderId).slice(-8)} · ${(a.orderStatus || "").replace(/_/g, " ")}`
                )
              )
            ),
            selOrderId
              ? h(
                  "div",
                  {
                    key: "panel",
                    className: "rounded-2xl border border-white/10 bg-white/5 p-4 dark:bg-night-900/50"
                  },
                  h(DeliveryLive, { mode: "rider", accessToken, orderId: selOrderId, variant: "embedded" })
                )
              : null
          ].filter(Boolean))
        : null
    )
  );
}
