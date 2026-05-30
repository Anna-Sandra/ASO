import React, { useCallback, useEffect, useState } from "react";
import { Percent, Ticket } from "lucide-react";
import { apiFetch , apiErrorMessage} from "services/api";
import { h } from "utils/h";
import { Button, GlassPanel, InlineNotice } from "components/ui";

const STATUS_TABS = [
  { id: "pending", label: "Pending review" },
  { id: "approved", label: "Live / approved" },
  { id: "rejected", label: "Rejected" },
  { id: "draft", label: "Draft" },
  { id: "all", label: "All" }
];

const KIND_LABEL = {
  banner: "Hero banner",
  flash_sale: "Flash sale",
  deal_discount: "Discount deal",
  deal_bundle: "Bundle deal",
  spotlight: "Limited-time card",
  vendor_promo: "Vendor spotlight",
  coupon: "Coupon"
};

function fmtWhen(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

export function AdminPromotionsPanel({ auth, confirm, toast, alert }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("pending");
  const [err, setErr] = useState("");
  const limit = 20;

  const load = useCallback(async () => {
    if (!auth) return;
    setErr("");
    try {
      const qs = new URLSearchParams({
        status,
        page: String(page),
        limit: String(limit)
      });
      const d = await apiFetch(`/api/admin/promotions?${qs.toString()}`, auth);
      setRows(Array.isArray(d.promotions) ? d.promotions : []);
      setTotal(Number(d.total) || 0);
    } catch (ex) {
      setErr(apiErrorMessage(ex, "Could not load promotions."));
    }
  }, [auth, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [status]);

  const onApprove = async (row) => {
    const ok = await confirm(`Approve "${row.title}"? Shoppers will see it once dates are valid.`, {
      title: "Approve promotion?",
      confirmLabel: "Approve"
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/admin/promotions/${row.id}/approve`, { method: "POST", ...auth, json: {} });
      toast("Promotion approved.", { variant: "success" });
      await load();
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Approve failed"), { variant: "error" });
    }
  };

  const onReject = async (row) => {
    const reason = window.prompt("Reason for the vendor (optional):", "") || "";
    const ok = await confirm(`Reject "${row.title}"? The vendor can edit and resubmit.`, {
      title: "Reject promotion?",
      confirmLabel: "Reject"
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/admin/promotions/${row.id}/reject`, {
        method: "POST",
        ...auth,
        json: { reason }
      });
      toast("Promotion rejected.", { variant: "success" });
      await load();
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Reject failed"), { variant: "error" });
    }
  };

  const pages = Math.max(1, Math.ceil(total / limit));

  return h("div", { className: "space-y-6" }, [
    h(InlineNotice, { key: "hint", variant: "info", title: "Deals, flash sales & coupons" }, [
      h(
        "p",
        { className: "text-sm leading-relaxed text-slate-700 dark:text-slate-300" },
        "Vendors submit promotions from Vendor → Deals & offers. Approve here so they appear on the public /deals and /coupons pages (respecting start/end dates)."
      )
    ]),
    err ? h(InlineNotice, { key: "err", variant: "error", onDismiss: () => setErr("") }, err) : null,
    h("div", { key: "tabs", className: "flex flex-wrap gap-2" }, [
      ...STATUS_TABS.map((t) =>
        h(
          "button",
          {
            key: t.id,
            type: "button",
            onClick: () => setStatus(t.id),
            className: `rounded-full px-3 py-1.5 text-xs font-bold transition ${
              status === t.id
                ? "bg-sky-600 text-white"
                : "border border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-night-900 dark:text-slate-300"
            }`
          },
          t.label
        )
      )
    ]),
    h(
      GlassPanel,
      { key: "list" },
      rows.length
        ? h("ul", { className: "divide-y divide-slate-200/80 dark:divide-white/10" }, [
            ...rows.map((p) =>
              h("li", { key: p.id, className: "flex flex-wrap items-start justify-between gap-4 py-4" }, [
                h("div", { className: "flex min-w-0 gap-3" }, [
                  h(
                    "span",
                    {
                      className:
                        "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400"
                    },
                    p.kind === "coupon" ? h(Ticket, { className: "h-5 w-5" }) : h(Percent, { className: "h-5 w-5" })
                  ),
                  h("div", { className: "min-w-0" }, [
                    h("p", { className: "font-semibold text-slate-900 dark:text-white" }, p.title || "—"),
                    h(
                      "p",
                      { className: "text-xs text-slate-500" },
                      [
                        KIND_LABEL[p.kind] || p.kind,
                        p.code ? ` · ${p.code}` : "",
                        p.sellerId ? " · Vendor submission" : " · Platform"
                      ].join("")
                    ),
                    h(
                      "p",
                      { className: "mt-1 text-xs text-slate-500" },
                      `Ends ${fmtWhen(p.endsAt)} · ${p.reviewStatus}`
                    ),
                    p.subtitle
                      ? h("p", { className: "mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-400" }, p.subtitle)
                      : null,
                    p.rejectionReason && p.reviewStatus === "rejected"
                      ? h(
                          "p",
                          { className: "mt-1 text-xs font-medium text-amber-700 dark:text-amber-300" },
                          `Reason: ${p.rejectionReason}`
                        )
                      : null
                  ])
                ]),
                p.reviewStatus === "pending"
                  ? h("div", { className: "flex flex-wrap gap-2" }, [
                      h(Button, { type: "button", onClick: () => void onApprove(p) }, "Approve"),
                      h(Button, { type: "button", variant: "outline", onClick: () => void onReject(p) }, "Reject")
                    ])
                  : h(
                      "span",
                      { className: "rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 dark:bg-night-950 dark:text-slate-400" },
                      p.reviewStatus
                    )
              ])
            )
          ])
        : h("p", { className: "py-10 text-center text-sm text-slate-500" }, "No promotions in this view.")
    ),
    pages > 1
      ? h("div", { key: "pg", className: "flex items-center justify-center gap-3 text-sm" }, [
          h(
            Button,
            { type: "button", variant: "outline", disabled: page <= 1, onClick: () => setPage((x) => Math.max(1, x - 1)) },
            "Previous"
          ),
          h("span", { className: "text-slate-500" }, `Page ${page} of ${pages}`),
          h(
            Button,
            { type: "button", variant: "outline", disabled: page >= pages, onClick: () => setPage((x) => x + 1) },
            "Next"
          )
        ])
      : null
  ]);
}
