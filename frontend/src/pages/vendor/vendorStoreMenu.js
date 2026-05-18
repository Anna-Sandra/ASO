import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "services/api";
import { useAuth, useNotice } from "context";
import { h } from "utils/h";
import { Button, Field, GlassPanel, InlineNotice, TextInput } from "components/ui";

export function VendorStoreMenuPage() {
  const { storeKey } = useParams();
  const { accessToken } = useAuth();
  const { toast } = useNotice();
  const [sections, setSections] = useState([]);
  const [title, setTitle] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const key = encodeURIComponent(storeKey || "");

  const reload = useCallback(async () => {
    if (!accessToken || !storeKey) return;
    const d = await apiFetch(`/api/businesses/${key}/menu-sections`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    setSections(Array.isArray(d.menuSections) ? d.menuSections : []);
  }, [accessToken, storeKey, key]);

  useEffect(() => {
    void reload().catch(() => setSections([]));
  }, [reload]);

  const add = async (e) => {
    e.preventDefault();
    if (!accessToken || !title.trim()) return;
    setBusy(true);
    setErr("");
    try {
      await apiFetch(`/api/businesses/${key}/menu-sections`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: { title: title.trim(), sortOrder: sections.length }
      });
      setTitle("");
      toast("Section added.", { variant: "success" });
      await reload();
    } catch (ex) {
      setErr(ex.message || "Could not create section.");
    } finally {
      setBusy(false);
    }
  };

  const del = async (id) => {
    if (!accessToken || !id) return;
    if (!window.confirm("Remove this menu section from the store (items keep selling; they lose this grouping)?")) return;
    try {
      await apiFetch(`/api/businesses/${key}/menu-sections/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      toast("Removed.", { variant: "success" });
      await reload();
    } catch (ex) {
      setErr(ex.message || "Delete failed.");
    }
  };

  return h("div", { className: "mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-8" }, [
    h("div", { key: "top", className: "flex flex-wrap items-center justify-between gap-2" }, [
      h("h1", { className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, "Menu sections"),
      h(
        Link,
        { to: "/vendor/stores", className: "text-sm font-semibold text-sky-600 hover:underline dark:text-sky-300" },
        "← Stores"
      )
    ]),
    err ? h(InlineNotice, { key: "er", variant: "error", onDismiss: () => setErr("") }, err) : null,
    h(
      GlassPanel,
      { key: "list" },
      sections.length
        ? h("ul", { className: "divide-y divide-white/10 text-sm text-slate-800 dark:text-slate-100" }, [
            ...sections.map((s) =>
              h("li", { key: s.id, className: "flex flex-wrap items-center justify-between gap-3 py-3" }, [
                h("span", { className: "font-semibold" }, s.title),
                h("div", { className: "flex gap-2" }, [
                  h(
                    Button,
                    {
                      type: "button",
                      variant: "ghost",
                      className: "!min-h-[36px] !px-3 !py-1.5 !text-xs",
                      onClick: () => del(s.id)
                    },
                    "Remove"
                  )
                ])
              ])
            )
          ])
        : h("p", { className: "py-10 text-center text-slate-500 dark:text-slate-400" }, "No sections yet.")
    ),
    h(
      GlassPanel,
      { key: "add" },
      [
        h("h2", { className: "font-semibold text-slate-900 dark:text-white" }, "New section"),
        h("form", { className: "mt-4 flex flex-wrap items-end gap-3", onSubmit: add }, [
          h(Field, { label: "Title (e.g. Mains)" }, h(TextInput, { value: title, onChange: (e) => setTitle(e.target.value), required: true })),
          h(Button, { type: "submit", loading: busy }, "Add")
        ]),
        h(
          "p",
          { className: "mt-4 text-xs text-slate-500 dark:text-slate-400" },
          "Restaurant listings can choose a menu section when editing a product."
        )
      ]
    )
  ]);
}
