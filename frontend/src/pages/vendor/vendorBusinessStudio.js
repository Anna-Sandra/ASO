import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ImageIcon, Store, Trash2 } from "lucide-react";
import { storeStatusLabel } from "utils/storeStatus";
import { apiFetch, apiUploadProductImages } from "services/api";
import { useAuth, useNotice } from "context";
import { h } from "utils/h";
import { Button, Field, GlassPanel, InlineNotice, SelectInput, TextArea, TextInput } from "components/ui";

const QUIET_BRAND_LINK =
  "text-[10px] font-medium text-slate-500 underline-offset-2 hover:text-sky-600 hover:underline disabled:pointer-events-none disabled:opacity-40 dark:text-slate-400 dark:hover:text-sky-400";
const QUIET_BRAND_REMOVE =
  "text-[10px] font-medium text-slate-400 underline-offset-2 hover:text-rose-600 hover:underline disabled:pointer-events-none disabled:opacity-40";

const BUSINESS_TYPES = [
  { value: "food_restaurant", label: "Food / Restaurant" },
  { value: "fashion_store", label: "Fashion store" },
  { value: "electronics_shop", label: "Electronics shop" },
  { value: "beauty_shop", label: "Beauty shop" },
  { value: "baby_infant_store", label: "Baby / infant shop" },
  { value: "grocery_store", label: "Grocery store" },
  { value: "academic_book", label: "Books / Academic" },
  { value: "service_provider", label: "Service provider" }
];

export function VendorStoresPage() {
  const navigate = useNavigate();
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

  useEffect(() => {
    if (rows.length === 1) {
      const slug = String(rows[0]?.slug || "").trim();
      if (slug) navigate(`/vendor/stores/${encodeURIComponent(slug)}`, { replace: true });
    }
  }, [rows, navigate]);

  const removeBrandAsset = async (slug, field) => {
    if (!accessToken || !slug) return;
    setBrandBusy(`${slug}:${field}`);
    setErr("");
    try {
      await apiFetch(`/api/businesses/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: field === "logo" ? { logoUrl: null } : { bannerUrl: null }
      });
      toast(field === "logo" ? "Logo removed." : "Banner removed.", { variant: "success" });
      await load();
    } catch (ex) {
      setErr(ex.message || "Could not remove image.");
    } finally {
      setBrandBusy("");
    }
  };

  const deleteStore = async (slug, name) => {
    if (!accessToken || !slug) return;
    const ok = window.confirm(`Delete "${name || "this store"}" permanently? Listings will be unlinked.`);
    if (!ok) return;
    setErr("");
    try {
      await apiFetch(`/api/businesses/${encodeURIComponent(slug)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      toast("Store deleted.", { variant: "success" });
      await load();
    } catch (ex) {
      setErr(ex.message || "Could not delete store.");
    }
  };

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
      const created = await apiFetch("/api/businesses", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: {
          name: name.trim(),
          businessType,
          description: description.trim(),
          status: "draft",
          pickupAvailable: true,
          deliveryAvailable: false
        }
      });
      const linked = Number(created?.linkedOrphanProducts) || 0;
      toast(
        linked > 0
          ? `Store created. ${linked} existing listing${linked === 1 ? "" : "s"} linked to this store menu.`
          : "Store created as draft. Open it to add branding, then submit for admin approval.",
        { variant: "success" }
      );
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
            "On SHOPIQGH, create your business profile first, then attach listings scoped to this store."
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
            ["Babies", "/babies"],
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
                      `${b.businessType} · ${storeStatusLabel(b.status)}`
                    ),
                    slug &&
                      h(
                        Link,
                        {
                          key: "st",
                          to: `/vendor/stores/${encodeURIComponent(slug)}`,
                          className:
                            "mt-2 inline-flex items-center gap-1 rounded-full bg-sky-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-sky-500"
                        },
                        "Manage storefront →"
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
                  ]),
                  h(
                    "div",
                    { className: "flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5" },
                    [
                      h("label", { key: "lb-lo", htmlFor: logoIn, className: `cursor-pointer ${QUIET_BRAND_LINK}` }, [
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
                        busyLogo ? "Uploading…" : "Change logo"
                      ]),
                      b.logoUrl
                        ? [
                            h("span", { key: "dot-lo", className: "text-[10px] text-slate-300 dark:text-slate-600" }, "·"),
                            h(
                              "button",
                              {
                                key: "rm-lo",
                                type: "button",
                                className: QUIET_BRAND_REMOVE,
                                disabled: !slug || busyLogo || busyBanner,
                                onClick: () => void removeBrandAsset(slug, "logo")
                              },
                              "Remove"
                            )
                          ]
                        : null,
                      h("span", { key: "dot-mid", className: "text-[10px] text-slate-300 dark:text-slate-600" }, "·"),
                      h("label", { key: "lb-ban", htmlFor: bannerIn, className: `cursor-pointer ${QUIET_BRAND_LINK}` }, [
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
                        busyBanner ? "Uploading…" : "Change banner"
                      ]),
                      b.bannerUrl
                        ? [
                            h("span", { key: "dot-ban", className: "text-[10px] text-slate-300 dark:text-slate-600" }, "·"),
                            h(
                              "button",
                              {
                                key: "rm-ban",
                                type: "button",
                                className: QUIET_BRAND_REMOVE,
                                disabled: !slug || busyLogo || busyBanner,
                                onClick: () => void removeBrandAsset(slug, "banner")
                              },
                              "Remove"
                            )
                          ]
                        : null
                    ].filter(Boolean)
                  ),
                  h(
                    "button",
                    {
                      key: "del",
                      type: "button",
                      className: `${QUIET_BRAND_REMOVE} inline-flex items-center gap-0.5`,
                      onClick: () => void deleteStore(slug, b.name)
                    },
                    [h(Trash2, { className: "h-3 w-3" }), "Delete store"]
                  ),
                  h(
                    "p",
                    { className: "max-w-xs text-right text-[10px] text-slate-500 dark:text-slate-400" },
                    "Submit for admin approval from the storefront page before shoppers can see your store."
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
          "Creates a draft storefront. After it appears in the list, open Manage storefront, add logo and banner, then submit for admin approval."
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
            h(Button, { key: "go", type: "submit", loading }, "Create store (draft)")
          ]
        )
      ]
    )
  ]);
}
