import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ImageIcon, Store } from "lucide-react";
import { apiFetch, apiUploadProductImages } from "./api";
import { useAuth, useNotice } from "./contexts";
import { h } from "./h";
import { Button, Field, GlassPanel, InlineNotice, SelectInput, TextArea, TextInput } from "./ui";

const BUSINESS_TYPES = [
  { value: "food_restaurant", label: "Food / Restaurant" },
  { value: "fashion_store", label: "Fashion store" },
  { value: "electronics_shop", label: "Electronics shop" },
  { value: "beauty_shop", label: "Beauty shop" },
  { value: "grocery_store", label: "Grocery store" },
  { value: "academic_book", label: "Books / Academic" },
  { value: "service_provider", label: "Service provider" }
];

export function VendorStoresPage() {
  const { accessToken } = useAuth();
  const { toast } = useNotice();
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("fashion_store");
  const [description, setDescription] = useState("");
  /** `"${slug}:logo"` | `"${slug}:banner"` | `""` */
  const [brandBusy, setBrandBusy] = useState("");

  const load = useCallback(async () => {
    if (!accessToken) return;
    setErr("");
    try {
      const d = await apiFetch("/api/businesses/mine", { headers: { Authorization: `Bearer ${accessToken}` } });
      setRows(Array.isArray(d.businesses) ? d.businesses : []);
    } catch (e) {
      setErr(e.message || "Could not load stores.");
    }
  }, [accessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const onBrandFile = async (slug, field, e) => {
    const file = e.target.files?.[0];
    if (!file || !accessToken || !slug) return;
    setBrandBusy(`${slug}:${field}`);
    setErr("");
    try {
      const data = await apiUploadProductImages([file], accessToken);
      const url = data.urls?.[0];
      if (!url || typeof url !== "string") throw new Error("Upload did not return an image URL.");
      await apiFetch(`/api/businesses/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: field === "logo" ? { logoUrl: url } : { bannerUrl: url }
      });
      toast(field === "logo" ? "Store logo updated." : "Store banner updated.", { variant: "success" });
      await load();
    } catch (ex) {
      setErr(ex.message || "Could not update branding.");
    } finally {
      setBrandBusy("");
    }
  };

  const onCreate = async (e) => {
    e.preventDefault();
    if (!accessToken) return;
    setLoading(true);
    setErr("");
    try {
      await apiFetch("/api/businesses", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: {
          name: name.trim(),
          businessType,
          description: description.trim(),
          status: "active",
          pickupAvailable: true,
          deliveryAvailable: false
        }
      });
      toast("Store created. Add listings that match this business type, then share your /store/ link.", { variant: "success" });
      setName("");
      setDescription("");
      await load();
    } catch (e) {
      setErr(e.message || "Could not create store.");
    } finally {
      setLoading(false);
    }
  };

  return h("div", { className: "mx-auto w-full max-w-4xl space-y-8 px-4 py-8 sm:px-6 lg:px-10" }, [
    h(
      "header",
      { key: "h", className: "flex flex-wrap items-start justify-between gap-3" },
      [
        h("div", null, [
          h("div", { className: "inline-flex items-center gap-2 text-sky-700 dark:text-sky-300" }, [
            h(Store, { key: "ic", className: "h-6 w-6" }),
            h("span", { key: "l", className: "text-xs font-bold uppercase tracking-widest" }, "Stores & storefronts")
          ]),
          h(
            "h1",
            { className: "mt-2 font-display text-2xl font-black text-slate-900 dark:text-white" },
            "Your businesses"
          ),
          h(
            "p",
            { className: "mt-1 max-w-xl text-sm text-slate-600 dark:text-slate-400" },
            "Campus Mart is multi-vendor: create your business profile first, then attach listings scoped to this store."
          )
        ]),
        h(
          Link,
          {
            key: "help",
            to: "/vendor/products/new",
            className: "text-sm font-semibold text-sky-600 hover:underline dark:text-sky-300"
          },
          "+ New listing →"
        )
      ]
    ),
    err ? h(InlineNotice, { key: "gn", variant: "error", onDismiss: () => setErr("") }, err) : null,
    h(
      InlineNotice,
      {
        key: "discover",
        variant: "info",
        title: "How shoppers find your store"
      },
      h("div", { className: "space-y-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300" }, [
        h("p", { key: "p1" }, [
          "Your public storefront lives at ",
          h("span", { key: "c", className: "rounded bg-black/10 px-1 font-mono text-xs dark:bg-white/10" }, "/store/your-slug"),
          ". Active listings linked to this business appear there. Shoppers also discover stores from ",
          h("strong", { key: "b" }, "category hubs"),
          " on the marketplace — each hub lists businesses of that type."
        ]),
        h("p", { key: "p2", className: "font-medium text-slate-800 dark:text-slate-200" }, "Category pages (open in a new tab to preview):"),
        h(
          "p",
          { key: "ln", className: "flex flex-wrap gap-x-3 gap-y-1" },
          [
            ["Food", "/food"],
            ["Fashion", "/fashion"],
            ["Electronics", "/electronics"],
            ["Beauty", "/beauty"],
            ["Groceries", "/groceries"],
            ["Books", "/books"],
            ["Services", "/services"]
          ].map(([label, path]) =>
            h(
              Link,
              {
                key: path,
                to: path,
                className: "font-semibold text-sky-700 underline decoration-sky-700/30 underline-offset-2 hover:decoration-sky-700 dark:text-sky-300 dark:decoration-sky-300/30"
              },
              label
            )
          )
        )
      ])
    ),
    h(
      GlassPanel,
      { key: "list" },
      rows.length
        ? h("ul", { className: "divide-y divide-white/10" }, [
            ...rows.map((b) => {
              const slug = String(b.slug || "").trim();
              const idSafe = String(b.id || "x").replace(/[^a-zA-Z0-9]/g, "");
              const logoIn = `store-brand-logo-${idSafe}`;
              const bannerIn = `store-brand-banner-${idSafe}`;
              const busyLogo = brandBusy === `${slug}:logo`;
              const busyBanner = brandBusy === `${slug}:banner`;
              const logoThumb =
                b.logoUrl && String(b.logoUrl).trim()
                  ? h("img", {
                      src: b.logoUrl,
                      alt: "",
                      className: "h-14 w-14 shrink-0 rounded-2xl border border-white/15 object-cover shadow-md dark:border-white/10"
                    })
                  : h(
                      "span",
                      {
                        className:
                          "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-100 text-slate-400 dark:border-white/15 dark:bg-night-950/50 dark:text-slate-500"
                      },
                      h(ImageIcon, { className: "h-6 w-6", strokeWidth: 1.5 })
                    );
              return h("li", { key: b.id || b.slug, className: "flex flex-wrap items-start justify-between gap-4 py-4" }, [
                h("div", { key: "left", className: "flex min-w-0 flex-1 gap-3" }, [
                  logoThumb,
                  h("div", { className: "min-w-0" }, [
                    h("p", { className: "font-semibold text-slate-900 dark:text-white" }, b.name || "Store"),
                    h(
                      "p",
                      { className: "text-xs text-slate-500 dark:text-slate-400" },
                      `${b.businessType} · ${String(b.status || "")}`
                    ),
                    slug &&
                      h(
                        Link,
                        {
                          key: "st",
                          to: `/store/${encodeURIComponent(slug)}`,
                          className: "mt-1 inline-block text-xs font-bold text-emerald-600 hover:underline dark:text-emerald-300"
                        },
                        `/store/${slug}`
                      )
                  ])
                ]),
                h("div", { key: "acts", className: "flex flex-col items-stretch gap-2 sm:items-end" }, [
                  h("div", { className: "flex flex-wrap justify-end gap-2 text-xs font-semibold text-sky-700 dark:text-sky-300" }, [
                    b.businessType === "food_restaurant" &&
                      h(
                        Link,
                        {
                          key: "menu",
                          to: `/vendor/stores/${encodeURIComponent(slug || b.id)}/menu`,
                          className: "rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 dark:bg-night-950/40"
                        },
                        "Menu sections"
                      ),
                    h("label", { key: "lb-lo", htmlFor: logoIn, className: "cursor-pointer" }, [
                      h("input", {
                        type: "file",
                        accept: "image/jpeg,image/png,image/webp",
                        id: logoIn,
                        className: "sr-only",
                        disabled: !slug || busyLogo || busyBanner,
                        onChange: (ev) => {
                          void onBrandFile(slug, "logo", ev);
                          ev.target.value = "";
                        }
                      }),
                      h(
                        "span",
                        {
                          className: `inline-flex rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 dark:bg-night-950/40 ${!slug || busyLogo ? "opacity-50" : ""}`
                        },
                        busyLogo ? "Uploading…" : "Upload logo"
                      )
                    ]),
                    h("label", { key: "lb-ban", htmlFor: bannerIn, className: "cursor-pointer" }, [
                      h("input", {
                        type: "file",
                        accept: "image/jpeg,image/png,image/webp",
                        id: bannerIn,
                        className: "sr-only",
                        disabled: !slug || busyLogo || busyBanner,
                        onChange: (ev) => {
                          void onBrandFile(slug, "banner", ev);
                          ev.target.value = "";
                        }
                      }),
                      h(
                        "span",
                        {
                          className: `inline-flex rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 dark:bg-night-950/40 ${!slug || busyBanner ? "opacity-50" : ""}`
                        },
                        busyBanner ? "Uploading…" : "Upload banner"
                      )
                    ])
                  ]),
                  h(
                    "p",
                    { className: "max-w-xs text-right text-[10px] text-slate-500 dark:text-slate-400" },
                    "Logo and wide banner show on your storefront and on category hub cards."
                  )
                ])
              ]);
            })
          ])
        : h("p", { className: "py-10 text-center text-sm text-slate-500 dark:text-slate-400" }, "No stores yet.")
    ),
    h(
      GlassPanel,
      { key: "form" },
      [
        h("h2", { className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, "Create store"),
        h(
          "p",
          { className: "mt-1 text-sm text-slate-600 dark:text-slate-400" },
          "Creates an active storefront slug you can share. After it appears in the list above, use Upload logo / Upload banner so your store stands out on category pages and on /store/your-slug."
        ),
        h(
          "form",
          { className: "mt-6 space-y-4", onSubmit: onCreate },
          [
            h(Field, { key: "n", label: "Business / brand name" }, h(TextInput, { value: name, onChange: (ev) => setName(ev.target.value), required: true })),
            h(
              Field,
              { key: "bt", label: "Business archetype" },
              h(
                SelectInput,
                { value: businessType, onChange: (ev) => setBusinessType(ev.target.value) },
                BUSINESS_TYPES.map((o) => h("option", { key: o.value, value: o.value }, o.label))
              )
            ),
            h(
              Field,
              { key: "d", label: "Short description (public)" },
              h(TextArea, { value: description, onChange: (ev) => setDescription(ev.target.value), rows: 4 })
            ),
            h(Button, { key: "go", type: "submit", loading }, "Create & publish store")
          ]
        )
      ]
    )
  ]);
}
