import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2, CheckCircle2, ChevronRight, Sparkles } from "lucide-react";
import { apiFetch, apiUploadProductImages , apiErrorMessage} from "services/api";
import { useAuth, useNotice } from "context";
import { h } from "utils/h";
import { Button, Field, GlassPanel, InlineNotice, SelectInput, TextArea, TextInput } from "components/ui";

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

export function VendorOnboardingPage() {
  const { accessToken } = useAuth();
  const { toast } = useNotice();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("fashion_store");
  const [description, setDescription] = useState("");
  const [createdSlug, setCreatedSlug] = useState("");
  const [brandBusy, setBrandBusy] = useState("");

  const onCreateBusiness = async (e) => {
    e.preventDefault();
    if (!accessToken) return;
    setLoading(true);
    setErr("");
    try {
      const d = await apiFetch("/api/businesses", {
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
      const slug = d.business?.slug || "";
      if (!slug) throw new Error("Store created but slug missing — refresh Stores.");
      setCreatedSlug(slug);
      toast("Business created!", { variant: "success" });
      setStep(3);
    } catch (ex) {
      setErr(apiErrorMessage(ex, "Could not create business."));
    } finally {
      setLoading(false);
    }
  };

  const onBrandFile = async (field, e) => {
    const file = e.target.files?.[0];
    if (!file || !accessToken || !createdSlug) return;
    setBrandBusy(field);
    setErr("");
    try {
      const data = await apiUploadProductImages([file], accessToken);
      const url = data.urls?.[0];
      if (!url) throw new Error("Upload did not return a URL.");
      await apiFetch(`/api/businesses/${encodeURIComponent(createdSlug)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: field === "logo" ? { logoUrl: url } : { bannerUrl: url }
      });
      toast(field === "logo" ? "Logo saved." : "Banner saved.", { variant: "success" });
    } catch (ex) {
      setErr(apiErrorMessage(ex, "Upload failed."));
    } finally {
      setBrandBusy("");
      e.target.value = "";
    }
  };

  const stepDots = h(
    "div",
    { key: "dots", className: "mb-6 flex items-center justify-center gap-2" },
    [1, 2, 3, 4].map((n) =>
      h("span", {
        key: n,
        className: `h-2 rounded-full transition-all ${step === n ? "w-8 bg-sky-500" : "w-2 bg-slate-300 dark:bg-slate-600"}`
      })
    )
  );

  const s1 = h(GlassPanel, { key: "s1" }, [
    h("div", { className: "mb-4 inline-flex items-center gap-2 text-sky-600 dark:text-sky-400" }, [
      h(Sparkles, { className: "h-6 w-6" }),
      h("span", { className: "text-xs font-bold uppercase tracking-widest" }, "Welcome")
    ]),
    h("h1", { className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, "Set up your storefront"),
    h(
      "p",
      { className: "mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400" },
      "On SHOPIQGH, create your business profile first, then add listings scoped to that store. Shoppers find you on category pages (/food, /fashion, …) and on your public /store/ link."
    ),
    h(
      "ul",
      { className: "mt-4 list-inside list-disc space-y-1 text-sm text-slate-600 dark:text-slate-400" },
      [
        h("li", { key: "a" }, "Choose your business type — this drives the right listing form and discovery hub."),
        h("li", { key: "b" }, "Add logo & banner so your card stands out."),
        h("li", { key: "c" }, "Publish listings — admins review before they go live.")
      ]
    ),
    h(Button, { className: "mt-6", type: "button", onClick: () => setStep(2) }, ["Continue", h(ChevronRight, { className: "ml-1 inline h-4 w-4" })])
  ]);

  const s2 = h(GlassPanel, { key: "s2" }, [
    h("h2", { className: "font-display text-xl font-bold text-slate-900 dark:text-white" }, "Create your business"),
    h("p", { className: "mt-1 text-sm text-slate-600 dark:text-slate-400" }, "You can add more stores later under Stores."),
    err ? h(InlineNotice, { key: "e", variant: "error", className: "mt-4", onDismiss: () => setErr("") }, err) : null,
    h(
      "form",
      { className: "mt-6 space-y-4", onSubmit: onCreateBusiness },
      [
        h(Field, { key: "n", label: "Business / brand name" }, h(TextInput, { value: name, onChange: (ev) => setName(ev.target.value), required: true })),
        h(
          Field,
          { key: "bt", label: "Business type" },
          h(
            SelectInput,
            { value: businessType, onChange: (ev) => setBusinessType(ev.target.value) },
            BUSINESS_TYPES.map((o) => h("option", { key: o.value, value: o.value }, o.label))
          )
        ),
        h(Field, { key: "d", label: "Short description (public)" }, h(TextArea, { value: description, onChange: (ev) => setDescription(ev.target.value), rows: 4 })),
        h("div", { key: "row", className: "flex flex-wrap gap-2" }, [
          h(Button, { key: "bk", type: "button", variant: "ghost", onClick: () => setStep(1) }, "Back"),
          h(Button, { key: "go", type: "submit", loading }, "Create business")
        ])
      ]
    )
  ]);

  const s3 = h(GlassPanel, { key: "s3" }, [
    h("h2", { className: "font-display text-xl font-bold text-slate-900 dark:text-white" }, "Branding (optional)"),
    h("p", { className: "mt-1 text-sm text-slate-600 dark:text-slate-400" }, [
      "Your storefront: ",
      h(
        Link,
        {
          key: "lk",
          to: `/store/${encodeURIComponent(createdSlug)}`,
          className: "font-semibold text-emerald-600 underline dark:text-emerald-400"
        },
        `/store/${createdSlug}`
      )
    ]),
    err ? h(InlineNotice, { key: "e", variant: "error", className: "mt-4", onDismiss: () => setErr("") }, err) : null,
    h("div", { className: "mt-6 flex flex-wrap gap-3" }, [
      h("label", { key: "lo", className: "cursor-pointer" }, [
        h("input", {
          type: "file",
          accept: "image/jpeg,image/png,image/webp",
          className: "sr-only",
          disabled: !!brandBusy,
          onChange: (ev) => void onBrandFile("logo", ev)
        }),
        h("span", { className: "inline-flex rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold dark:bg-night-950/40" }, brandBusy === "logo" ? "Uploading…" : "Upload logo")
      ]),
      h("label", { key: "bn", className: "cursor-pointer" }, [
        h("input", {
          type: "file",
          accept: "image/jpeg,image/png,image/webp",
          className: "sr-only",
          disabled: !!brandBusy,
          onChange: (ev) => void onBrandFile("banner", ev)
        }),
        h("span", { className: "inline-flex rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-semibold dark:bg-night-950/40" }, brandBusy === "banner" ? "Uploading…" : "Upload banner")
      ])
    ]),
    h("div", { className: "mt-6 flex flex-wrap gap-2" }, [
      h(Button, { key: "bk", type: "button", variant: "ghost", onClick: () => setStep(2) }, "Back"),
      h(Button, { key: "nx", type: "button", onClick: () => setStep(4) }, "Skip / continue")
    ])
  ]);

  const s4 = h(GlassPanel, { key: "s4" }, [
    h("div", { className: "mb-4 flex items-center gap-2 text-emerald-600 dark:text-emerald-400" }, [
      h(CheckCircle2, { className: "h-8 w-8" }),
      h("span", { className: "font-display text-xl font-bold text-slate-900 dark:text-white" }, "You're ready to list")
    ]),
    h(
      "p",
      { className: "text-sm text-slate-600 dark:text-slate-400" },
      "Add listings that match your business type. Food businesses can organize Menu sections under Stores."
    ),
    h("div", { className: "mt-6 flex flex-col gap-3 sm:flex-row" }, [
      h(
        Link,
        { key: "add", to: "/vendor/products/new" },
        h(Button, { className: "w-full sm:w-auto" }, "Add your first listing")
      ),
      h(
        Link,
        { key: "st", to: "/vendor/stores" },
        h(Button, { variant: "ghost", className: "w-full sm:w-auto" }, "Manage stores")
      ),
      h(
        Button,
        {
          key: "dash",
          variant: "ghost",
          className: "w-full sm:w-auto",
          type: "button",
          onClick: () => nav("/vendor/dashboard")
        },
        "Go to dashboard"
      )
    ])
  ]);

  const body = step === 1 ? s1 : step === 2 ? s2 : step === 3 ? s3 : s4;

  return h("div", { className: "mx-auto w-full max-w-2xl space-y-6 px-4 py-8 sm:px-6 lg:px-10" }, [
    h("div", { key: "hdr", className: "flex items-center gap-2 text-sky-700 dark:text-sky-300" }, [
      h(Building2, { className: "h-6 w-6" }),
      h("span", { className: "text-xs font-bold uppercase tracking-widest" }, "Vendor onboarding")
    ]),
    stepDots,
    body
  ]);
}
