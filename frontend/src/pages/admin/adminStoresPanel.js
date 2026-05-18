import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Store } from "lucide-react";
import { apiFetch } from "services/api";
import { h } from "utils/h";
import { storeStatusLabel } from "utils/storeStatus";
import { Button, GlassPanel, InlineNotice } from "components/ui";

const STATUS_TABS = [
  { id: "pending_approval", label: "Pending" },
  { id: "active", label: "Live" },
  { id: "draft", label: "Draft" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" }
];

export function AdminStoresPanel({ auth, confirm, toast, alert }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("pending_approval");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [err, setErr] = useState("");
  const limit = 20;

  const load = useCallback(async () => {
    if (!auth) return;
    setErr("");
    try {
      const qs = new URLSearchParams({
        status,
        page: String(page),
        limit: String(limit),
        search
      });
      const d = await apiFetch(`/api/admin/businesses?${qs.toString()}`, auth);
      setRows(Array.isArray(d.businesses) ? d.businesses : []);
      setTotal(Number(d.total) || 0);
    } catch (ex) {
      setErr(ex.message || "Could not load stores.");
    }
  }, [auth, status, page, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [status, search]);

  const onDecision = async (row, action) => {
    if (action === "approve") {
      const ok = await confirm(`Approve "${row.name}" and make this storefront public?`, {
        title: "Approve store?",
        confirmLabel: "Approve"
      });
      if (!ok) return;
    } else {
      const reason = window.prompt("Optional reason for the vendor (shown in their dashboard):", "") || "";
      const ok = await confirm(`Reject "${row.name}"? The vendor can edit and resubmit.`, {
        title: "Reject store?",
        confirmLabel: "Reject"
      });
      if (!ok) return;
      try {
        await apiFetch(`/api/admin/businesses/${row.id}/reject`, {
          method: "POST",
          ...auth,
          json: { reason }
        });
        toast("Store rejected.", { variant: "success" });
        await load();
      } catch (ex) {
        await alert(ex.message || "Reject failed", { variant: "error" });
      }
      return;
    }
    try {
      await apiFetch(`/api/admin/businesses/${row.id}/approve`, { method: "POST", ...auth });
      toast("Store approved and is now live.", { variant: "success" });
      await load();
    } catch (ex) {
      await alert(ex.message || "Approve failed", { variant: "error" });
    }
  };

  const pages = Math.max(1, Math.ceil(total / limit));

  return h("div", { className: "space-y-6" }, [
    h(InlineNotice, { key: "hint", variant: "info", title: "Store approvals" }, [
      h(
        "p",
        { className: "text-sm leading-relaxed text-slate-700 dark:text-slate-300" },
        "Vendors create storefronts as drafts, then submit for approval. Only approved (live) stores appear on category hubs and /store/ links for shoppers."
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
    h("form", { key: "srch", className: "flex flex-wrap gap-2", onSubmit: (e) => { e.preventDefault(); setSearch(searchInput.trim()); } }, [
      h("input", {
        type: "search",
        value: searchInput,
        onChange: (e) => setSearchInput(e.target.value),
        placeholder: "Search by name or slug…",
        className:
          "min-w-[12rem] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-night-900"
      }),
      h(Button, { type: "submit", variant: "outline" }, "Search")
    ]),
    h(
      GlassPanel,
      { key: "list" },
      rows.length
        ? h("ul", { className: "divide-y divide-slate-200/80 dark:divide-white/10" }, [
            ...rows.map((b) => {
              const slug = String(b.slug || "").trim();
              const preview = slug ? `/store/${encodeURIComponent(slug)}` : null;
              return h("li", { key: b.id, className: "flex flex-wrap items-start justify-between gap-4 py-4" }, [
                h("div", { className: "flex min-w-0 gap-3" }, [
                  b.logoUrl
                    ? h("img", {
                        src: b.logoUrl,
                        alt: "",
                        className: "h-12 w-12 shrink-0 rounded-xl object-cover"
                      })
                    : h(
                        "span",
                        {
                          className:
                            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-night-950"
                        },
                        h(Store, { className: "h-5 w-5" })
                      ),
                  h("div", { className: "min-w-0" }, [
                    h("p", { className: "font-semibold text-slate-900 dark:text-white" }, b.name || "Store"),
                    h(
                      "p",
                      { className: "text-xs text-slate-500" },
                      `${b.businessType || "—"} · ${storeStatusLabel(b.status)} · /store/${slug || "—"}`
                    ),
                    preview
                      ? h(
                          "a",
                          {
                            href: preview,
                            target: "_blank",
                            rel: "noopener noreferrer",
                            className: "mt-1 inline-flex items-center gap-1 text-xs font-semibold text-sky-600"
                          },
                          [h(ExternalLink, { className: "h-3 w-3" }), "Preview storefront"]
                        )
                      : null
                  ])
                ]),
                b.status === "pending_approval"
                  ? h("div", { className: "flex flex-wrap gap-2" }, [
                      h(Button, { type: "button", onClick: () => void onDecision(b, "approve") }, "Approve"),
                      h(Button, { type: "button", variant: "outline", onClick: () => void onDecision(b, "reject") }, "Reject")
                    ])
                  : h("span", { className: "text-xs font-medium text-slate-500" }, storeStatusLabel(b.status))
              ]);
            })
          ])
        : h("p", { className: "py-10 text-center text-sm text-slate-500" }, "No stores in this view.")
    ),
    pages > 1
      ? h("div", { key: "pg", className: "flex items-center justify-center gap-3 text-sm" }, [
          h(
            Button,
            { type: "button", variant: "outline", disabled: page <= 1, onClick: () => setPage((p) => Math.max(1, p - 1)) },
            "Previous"
          ),
          h("span", { className: "text-slate-500" }, `Page ${page} of ${pages}`),
          h(
            Button,
            { type: "button", variant: "outline", disabled: page >= pages, onClick: () => setPage((p) => p + 1) },
            "Next"
          )
        ])
      : null
  ]);
}
