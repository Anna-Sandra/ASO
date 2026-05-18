import React, { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import { apiFetch } from "services/api";
import { useAuth, useNotice } from "context";
import { h } from "utils/h";
import { Button, GlassPanel, InlineNotice, Badge } from "components/ui";
import { CATEGORY_LABELS } from "config/catalog";

function inquiryTypeLabel(listingCategory) {
  if (listingCategory === "food_drinks") return "Food order";
  if (listingCategory === "services") return "Service";
  return "Request";
}

export function VendorServiceInquiriesPage() {
  const { accessToken } = useAuth();
  const { toast } = useNotice();
  const [rows, setRows] = useState([]);
  const [eligible, setEligible] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setErr("");
    try {
      const elig = await apiFetch("/api/service-inquiries/seller/eligible", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const ok = !!elig?.eligible;
      setEligible(ok);
      if (!ok) {
        setRows([]);
        return;
      }
      const d = await apiFetch("/api/service-inquiries/seller", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setRows(Array.isArray(d.inquiries) ? d.inquiries : []);
    } catch (e) {
      setErr(e.message || "Could not load requests.");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const mark = async (id, status) => {
    if (!accessToken) return;
    try {
      await apiFetch(`/api/service-inquiries/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: { status }
      });
      toast(status === "read" ? "Marked as read." : "Archived.", { variant: "success" });
      await load();
    } catch (e) {
      toast(e.message || "Update failed", { variant: "error" });
    }
  };

  if (!loading && eligible === false) {
    return h(Navigate, { to: "/vendor/dashboard", replace: true });
  }

  return h("div", { className: "mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-10" }, [
    h("header", { key: "h", className: "flex flex-wrap items-start justify-between gap-3" }, [
      h("div", { key: "hd-inner" }, [
        h("div", { className: "inline-flex items-center gap-2 text-sky-700 dark:text-sky-300" }, [
          h(CalendarClock, { className: "h-6 w-6" }),
          h("span", { className: "text-xs font-bold uppercase tracking-widest" }, "Service requests")
        ]),
        h("h1", { className: "mt-2 font-display text-2xl font-bold text-slate-900 dark:text-white" }, "Food & service requests"),
        h(
          "p",
          { className: "mt-1 max-w-xl text-sm text-slate-600 dark:text-slate-400" },
          "Buyers send these from food (call-to-order) and service listings — items without fixed online checkout. Coordinate pickup, timing, and payment as you agree."
        )
      ])
    ]),
    err ? h(InlineNotice, { key: "e", variant: "error", onDismiss: () => setErr("") }, err) : null,
    loading
      ? h("p", { key: "ld", className: "text-sm text-slate-500" }, "Loading…")
      : h(
          GlassPanel,
          { key: "tbl" },
          rows.length === 0
            ? h(
                "p",
                { className: "py-10 text-center text-sm text-slate-500 dark:text-slate-400" },
                "No requests yet. They appear when buyers submit the form on your food or service listings."
              )
            : h("div", { key: "tbl-wrap", className: "overflow-x-auto" }, [
                h(
                  "table",
                  { className: "w-full min-w-[640px] text-left text-sm" },
                  h("tbody", { className: "divide-y divide-white/10" }, [
                    ...rows.map((r) =>
                      h("tr", { key: r.id, className: "align-top" }, [
                        h("td", { className: "py-3 pr-3" }, [
                          h("p", { className: "font-semibold text-slate-900 dark:text-white" }, r.buyerDisplayName || "Buyer"),
                          h("p", { className: "text-xs text-slate-500" }, new Date(r.createdAt).toLocaleString()),
                          h(
                            Badge,
                            { key: "typ", tone: r.listingCategory === "food_drinks" ? "info" : "neutral", className: "mt-2" },
                            inquiryTypeLabel(r.listingCategory)
                          )
                        ]),
                        h("td", { className: "py-3 pr-3" }, [
                          h(
                            Link,
                            {
                              to: `/products/${encodeURIComponent(r.productId)}`,
                              className: "font-medium text-sky-600 hover:underline dark:text-sky-300"
                            },
                            r.productName || CATEGORY_LABELS[r.listingCategory] || "Listing"
                          ),
                          r.preferredTime
                            ? h("p", { className: "mt-1 text-xs text-slate-500" }, `Preferred: ${r.preferredTime}`)
                            : null
                        ]),
                        h("td", { className: "py-3 pr-3 text-slate-700 dark:text-slate-200" }, [
                          h("p", { className: "line-clamp-4 whitespace-pre-wrap" }, r.message)
                        ]),
                        h("td", { className: "py-3" }, [
                          h("div", { className: "mb-2" }, h(Badge, { tone: r.status === "pending" ? "warn" : "neutral" }, r.status)),
                          r.status === "pending" &&
                            h(Button, {
                              key: "rd",
                              variant: "ghost",
                              className: "!min-h-0 !px-2 !py-1 !text-xs",
                              type: "button",
                              onClick: () => void mark(r.id, "read")
                            }, "Mark read"),
                          r.status !== "archived" &&
                            h(Button, {
                              key: "ar",
                              variant: "ghost",
                              className: "!min-h-0 !px-2 !py-1 !text-xs",
                              type: "button",
                              onClick: () => void mark(r.id, "archived")
                            }, "Archive")
                        ])
                      ])
                    )
                  ])
                )
              ])
        )
  ]);
}
