import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  CloudUpload,
  Lock,
  Mail,
  Phone,
  ShoppingBag,
  Store,
  TrendingUp,
  User,
} from "lucide-react";
import { useAuth, useNotice } from "./contexts";
import { apiFetch, fetchPublicPlatformConfig, getApiBase } from "./api";
import { CATEGORY_LABELS, PRODUCT_CATEGORY_VALUES } from "./catalog";
import { BuyerLayout, CartDrawer } from "./screensBuyer";
import { h, f } from "./h";
import { Button, Field, GlassPanel, InlineNotice, SelectInput, TextArea, TextInput } from "./ui";

function apiErrorMessage(ex, fallback) {
  const m = ex && typeof ex.message === "string" ? ex.message.trim() : "";
  if (m && m !== "Validation error") return m;
  return m || fallback || "Something went wrong.";
}

/** Backend uses `{ error: { message } }`; some paths use `{ message }`. */
function messageFromApiJson(data) {
  if (!data || typeof data !== "object") return "";
  const nested = data.error && typeof data.error.message === "string" ? data.error.message.trim() : "";
  if (nested) return nested;
  return typeof data.message === "string" ? data.message.trim() : "";
}

/** Turn legacy Zod-style phrases into plain language (fallback if API is old). */
function humanizeVendorApplyError(raw) {
  const m = String(raw || "").trim();
  if (!m) return "Could not submit your application. Please try again.";
  if (/Too small:\s*expected string to have >=\s*10/i.test(m)) {
    return "Shop description must be at least 10 characters. Tell buyers what you sell and what they can expect from your shop.";
  }
  if (/Too small:\s*expected string to have >=\s*5/i.test(m)) {
    return "Please enter a complete phone number.";
  }
  if (/Too small:\s*expected string to have >=\s*1/i.test(m)) {
    return "Please fill in all required fields.";
  }
  if (/expected string,\s*received undefined/i.test(m)) {
    return "Something was missing from the form. Refresh the page, fill every required field, and try again.";
  }
  if (/Invalid option:\s*expected one of/i.test(m)) {
    return "Please choose a valid option (for example category or on-campus / off-campus).";
  }
  return m;
}

export function VendorApplicationPage() {
  const nav = useNavigate();
  const { accessToken, user, setUser } = useAuth();
  const { toast } = useNotice();
  const fileRef = useRef(null);

  const [fullName, setFullName] = useState(() => String(user?.displayName || "").trim());
  const [email] = useState(() => String(user?.email || "").trim());
  const [shopName, setShopName] = useState("");
  const [category, setCategory] = useState(PRODUCT_CATEGORY_VALUES[0]);
  const [sellsDescription, setSellsDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [altPhone, setAltPhone] = useState("");
  const [shopDescription, setShopDescription] = useState("");
  const [locationBase, setLocationBase] = useState("on_campus");
  const [nearbyArea, setNearbyArea] = useState("");
  const [verificationDocUrl, setVerificationDocUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeVendorRules, setAgreeVendorRules] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [platformCfg, setPlatformCfg] = useState(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const c = await fetchPublicPlatformConfig();
      if (!cancelled) setPlatformCfg(c);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyBlocked =
    platformCfg &&
    (platformCfg.maintenanceMode === true || platformCfg.allowVendorApplications === false);

  const descLen = shopDescription.length;

  useEffect(() => {
    if (!user) return;
    if (user.role === "seller") {
      nav("/vendor/dashboard", { replace: true });
    }
  }, [user, nav]);

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !accessToken) return;
    const okMime = file.type === "image/jpeg" || file.type === "image/png" || file.type === "application/pdf";
    if (!okMime) {
      setErr("Please upload a PNG, JPG, or PDF (max 5 MB).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErr("File must be 5 MB or smaller.");
      return;
    }
    setErr("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${getApiBase()}/api/uploads/vendor-verification`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: fd,
        credentials: "include"
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const serverMsg = messageFromApiJson(data);
        throw new Error(serverMsg || `Upload failed (HTTP ${res.status}). Check that the API is running and up to date.`);
      }
      if (data.url) setVerificationDocUrl(data.url);
    } catch (ex) {
      setErr(apiErrorMessage(ex, "Upload failed."));
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!accessToken) {
      nav("/login", { state: { from: "/apply-vendor" } });
      return;
    }
    if (applyBlocked) {
      setErr(
        platformCfg?.maintenanceMode
          ? platformCfg.maintenanceMessage?.trim() || "Applications are paused during maintenance."
          : "The marketplace is not accepting new vendor applications right now."
      );
      return;
    }
    if (!agreeTerms || !agreeVendorRules) {
      setErr("Please accept the Terms & Conditions and the vendor rules to continue.");
      return;
    }
    if (!String(nearbyArea).trim()) {
      setErr("Please enter your nearby town or area (under Location).");
      return;
    }
    if (String(shopDescription).trim().length < 10) {
      setErr(
        "Shop description must be at least 10 characters. Tell buyers what you offer, your standards, and how you fulfill orders."
      );
      return;
    }
    if (descLen > 300) {
      setErr("Shop description must be 300 characters or less.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/vendor-applications", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: {
          fullName: fullName.trim(),
          shopName: shopName.trim(),
          category,
          sellsDescription: sellsDescription.trim(),
          phone: phone.trim(),
          altPhone: altPhone.trim(),
          shopDescription: shopDescription.trim(),
          verificationDocUrl: verificationDocUrl.trim(),
          locationBase,
          nearbyArea: nearbyArea.trim(),
          agreeToTerms: true,
          agreeToVendorRules: true
        }
      });
      setUser((prev) => (prev ? { ...prev, vendorStatus: "pending" } : prev));
      toast("Application submitted! We will email you after review.", { variant: "success" });
      nav("/", { replace: true });
    } catch (ex) {
      setErr(humanizeVendorApplyError(apiErrorMessage(ex, "Could not submit application.")));
    } finally {
      setLoading(false);
    }
  };

  const onCancel = () => nav(-1);

  if (user?.role === "buyer" && user?.vendorStatus === "pending") {
    return h(f, null, [
      h(
        BuyerLayout,
        {
          key: "layout",
          onOpenCart: () => setCartOpen(true),
          hideSearch: true,
          title: "Vendor application"
        },
        h("div", { className: "w-full px-4 py-16 sm:px-6 lg:px-8" }, h("div", { className: "mx-auto max-w-lg" }, h(GlassPanel, null, [
          h("h1", { className: "font-display text-xl font-bold text-slate-900 dark:text-white" }, "Application pending"),
          h("p", { className: "mt-2 text-sm text-slate-600 dark:text-slate-400" }, "We already have your vendor application. You will get an email when an admin approves or rejects it."),
          h(Link, { to: "/", className: "mt-4 inline-block text-sm font-medium text-sky-600 hover:underline dark:text-sky-300" }, "← Back to home")
        ])))
      ),
      h(CartDrawer, { key: "cart", open: cartOpen, onClose: () => setCartOpen(false) })
    ]);
  }

  const categoryOptions = PRODUCT_CATEGORY_VALUES.map((id) =>
    h("option", { key: id, value: id }, CATEGORY_LABELS[id] || id)
  );

  return h(f, null, [
    h(
      BuyerLayout,
      {
        key: "layout",
        onOpenCart: () => setCartOpen(true),
        hideSearch: true,
        title: "Become a vendor"
      },
      h("div", { key: "grid", className: "mx-auto w-full max-w-6xl gap-8 px-4 py-8 lg:grid lg:grid-cols-[minmax(0,340px)_1fr] lg:items-start lg:gap-10 lg:px-6 lg:px-8" }, [
      h(GlassPanel, { key: "side", className: "mb-8 lg:sticky lg:top-6 lg:mb-0" }, [
        h("div", { className: "flex items-start gap-3" }, [
          h(
            "div",
            { className: "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-900/25" },
            h(Store, { className: "h-6 w-6" })
          ),
          h("div", { className: "min-w-0" }, [
            h("h2", { className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, "Become a Vendor"),
            h("p", { className: "mt-0.5 text-sm text-slate-600 dark:text-slate-400" }, "Start selling on Campus Mart.")
          ])
        ]),
        h("div", { className: "mt-6 space-y-4" }, [
          h("h3", { className: "text-xs font-bold uppercase tracking-wide text-sky-800 dark:text-sky-300" }, "Why become a vendor?"),
          [
            { icon: ShoppingBag, t: "Reach more students", d: "Show your products to students on campus." },
            { icon: TrendingUp, t: "Grow your business", d: "Increase sales and grow your brand with ease." },
            { icon: CheckCircle2, t: "Easy management", d: "Manage products, orders, and earnings in one place." }
          ].map((row) =>
            h("div", { key: row.t, className: "flex gap-3" }, [
              h(row.icon, { className: "mt-0.5 h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" }),
              h("div", null, [
                h("p", { className: "text-sm font-semibold text-slate-900 dark:text-white" }, row.t),
                h("p", { className: "text-xs text-slate-600 dark:text-slate-400" }, row.d)
              ])
            ])
          )
        ]),
        h("div", { className: "mt-6" }, [
          h("h3", { className: "text-xs font-bold uppercase tracking-wide text-sky-800 dark:text-sky-300" }, "What happens next?"),
          h("ol", { className: "vendor-form-step-line" }, [
            h("li", { key: "1", className: "relative" }, [
              h("span", { className: "vendor-form-step-dot" }, "1"),
              h("p", { className: "text-sm font-medium text-slate-900 dark:text-white" }, "Submit your application"),
              h("p", { className: "text-xs text-slate-600 dark:text-slate-400" }, "Fill out the form and submit your vendor application.")
            ]),
            h("li", { key: "2", className: "relative pt-1" }, [
              h("span", { className: "vendor-form-step-dot" }, "2"),
              h("p", { className: "text-sm font-medium text-slate-900 dark:text-white" }, "Admin review"),
              h("p", { className: "text-xs text-slate-600 dark:text-slate-400" }, "Our team will review (typically 1–3 business days).")
            ]),
            h("li", { key: "3", className: "relative pt-1" }, [
              h("span", { className: "vendor-form-step-dot" }, "3"),
              h("p", { className: "text-sm font-medium text-slate-900 dark:text-white" }, "Get approved"),
              h("p", { className: "text-xs text-slate-600 dark:text-slate-400" }, "Then add products and start selling.")
            ])
          ])
        ]),
        h("div", { className: "vendor-form-help" }, [
          h("p", { className: "font-semibold" }, "Need help?"),
          h("p", { className: "mt-1 opacity-90" }, "Contact support through your profile or campus help desk.")
        ])
      ]),
      h("div", { key: "main" }, [
        h(GlassPanel, null, [
          h("h1", { className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, "Vendor Application Form"),
          h("p", { className: "mt-1 text-sm text-slate-600 dark:text-slate-400" }, "Please fill in the details below to apply as a vendor."),
          platformCfg?.maintenanceMode
            ? h(InlineNotice, { key: "maint", variant: "warning", title: "Maintenance" }, platformCfg.maintenanceMessage?.trim() || "Applications may be unavailable during maintenance.")
            : null,
          platformCfg && platformCfg.allowVendorApplications === false
            ? h(InlineNotice, { key: "closed", variant: "warning", title: "Applications closed" }, "The operator has temporarily stopped new vendor applications.")
            : null,
          h(
            "form",
            { className: "mt-6 space-y-5", onSubmit },
            [
              h("div", { key: "r1", className: "grid gap-4 sm:grid-cols-2" }, [
                h(Field, { label: h("span", { className: "inline-flex items-center gap-1" }, [h(User, { className: "h-3.5 w-3.5" }), " Full name"]) }, h(TextInput, { value: fullName, onChange: (e) => setFullName(e.target.value), required: true })),
                h(Field, { label: h("span", { className: "inline-flex items-center gap-1" }, [h(Mail, { className: "h-3.5 w-3.5" }), " Email"]) }, h(TextInput, { type: "email", value: email, readOnly: true, className: "opacity-80" }))
              ]),
              h(Field, { key: "shop", label: "Shop / business name" }, h(TextInput, { value: shopName, onChange: (e) => setShopName(e.target.value), required: true })),
              h("div", { key: "r3", className: "grid gap-4 sm:grid-cols-2" }, [
                h(
                  Field,
                  { label: "Category" },
                  h(
                    SelectInput,
                    { value: category, onChange: (e) => setCategory(e.target.value), required: true },
                    categoryOptions
                  )
                ),
                h(Field, { label: "What do you sell?" }, h(TextInput, { value: sellsDescription, onChange: (e) => setSellsDescription(e.target.value), placeholder: "e.g. Food, clothes, accessories…", required: true }))
              ]),
              h("div", { key: "r4", className: "grid gap-4 sm:grid-cols-2" }, [
                h(Field, { label: h("span", { className: "inline-flex items-center gap-1" }, [h(Phone, { className: "h-3.5 w-3.5" }), " Phone"]) }, h(TextInput, { value: phone, onChange: (e) => setPhone(e.target.value), inputMode: "tel", required: true })),
                h(Field, { label: "Alternative phone (optional)" }, h(TextInput, { value: altPhone, onChange: (e) => setAltPhone(e.target.value), inputMode: "tel" }))
              ]),
              h(Field, { key: "desc", label: "Shop description" }, [
                h(TextArea, {
                  value: shopDescription,
                  onChange: (e) => setShopDescription(e.target.value.slice(0, 300)),
                  rows: 5,
                  required: true,
                  className: "min-h-[120px]"
                }),
                h("div", { key: "desc-meta", className: "mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500" }, [
                  h("span", { key: "hint" }, "Use at least 10 characters so admins and buyers understand your shop."),
                  h("span", { key: "cnt" }, `${descLen}/300`)
                ])
              ]),
              h("div", { key: "up", className: "space-y-2" }, [
                h("span", { className: "text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400" }, "Ghana Card"),
                h(
                  "button",
                  {
                    type: "button",
                    onClick: () => fileRef.current?.click(),
                    disabled: uploading || !!applyBlocked,
                    className: "vendor-form-upload"
                  },
                  [
                    h(CloudUpload, { key: "upl-ic", className: "h-10 w-10 text-sky-600 dark:text-sky-400" }),
                    h("p", { key: "upl-t1", className: "text-sm font-medium text-slate-800 dark:text-slate-100" }, "Click to upload or drag and drop"),
                    h("p", { key: "upl-t2", className: "text-xs text-slate-500" }, "PNG, JPG or PDF (max. 5 MB) — optional but recommended.")
                  ]
                ),
                h("input", { ref: fileRef, type: "file", accept: "image/png,image/jpeg,application/pdf", className: "hidden", onChange: onPickFile }),
                verificationDocUrl
                  ? h("p", { className: "text-xs text-emerald-600 dark:text-emerald-400" }, "File uploaded.")
                  : null
              ]),
              h("div", { key: "loc", className: "space-y-4" }, [
                h("h3", { className: "text-xs font-bold uppercase tracking-wide text-sky-800 dark:text-sky-300" }, "3. Location (VERY IMPORTANT)"),
                h("p", { className: "text-sm font-medium text-slate-900 dark:text-white" }, "Where are you based?"),
                h("div", { className: "flex flex-wrap gap-4" }, [
                  h("label", { key: "on", className: "flex cursor-pointer items-center gap-2 rounded-2xl border border-white/20 bg-white/30 px-4 py-2.5 text-sm text-slate-800 dark:border-white/10 dark:bg-slate-900/30 dark:text-slate-100" }, [
                    h("input", {
                      type: "radio",
                      name: "locationBase",
                      className: "h-4 w-4 border-slate-300 text-sky-600",
                      checked: locationBase === "on_campus",
                      onChange: () => setLocationBase("on_campus")
                    }),
                    "On-campus"
                  ]),
                  h("label", { key: "off", className: "flex cursor-pointer items-center gap-2 rounded-2xl border border-white/20 bg-white/30 px-4 py-2.5 text-sm text-slate-800 dark:border-white/10 dark:bg-slate-900/30 dark:text-slate-100" }, [
                    h("input", {
                      type: "radio",
                      name: "locationBase",
                      className: "h-4 w-4 border-slate-300 text-sky-600",
                      checked: locationBase === "off_campus",
                      onChange: () => setLocationBase("off_campus")
                    }),
                    "Off-campus"
                  ])
                ]),
                h(Field, { key: "near", label: "Nearby town / area" }, h(TextInput, { value: nearbyArea, onChange: (e) => setNearbyArea(e.target.value), placeholder: "e.g. East Legon, Tema Community 4, …", required: true }))
              ]),
              h("div", { key: "agr", className: "space-y-3" }, [
                h("h3", { className: "text-xs font-bold uppercase tracking-wide text-sky-800 dark:text-sky-300" }, "6. Agreement"),
                h("label", { className: "vendor-form-terms" }, [
                  h("input", { type: "checkbox", checked: agreeTerms, onChange: (e) => setAgreeTerms(e.target.checked), className: "mt-1 h-4 w-4 rounded border-slate-300" }),
                  h("span", { className: "text-sm text-slate-700 dark:text-slate-300" }, [
                    h("span", { key: "pre" }, "I have read and accept the "),
                    h(Link, {
                      key: "t",
                      to: "/terms",
                      target: "_blank",
                      rel: "noopener noreferrer",
                      className: "font-medium text-sky-600 hover:underline dark:text-sky-300",
                      onClick: (e) => e.stopPropagation()
                    }, "Terms & Conditions"),
                    h("span", { key: "suf" }, ".")
                  ])
                ]),
                h("label", { className: "vendor-form-terms" }, [
                  h("input", { type: "checkbox", checked: agreeVendorRules, onChange: (e) => setAgreeVendorRules(e.target.checked), className: "mt-1 h-4 w-4 rounded border-slate-300" }),
                  h("span", { className: "text-sm text-slate-700 dark:text-slate-300" }, [
                    h("span", { key: "pre" }, "I have read and accept the "),
                    h(Link, {
                      key: "v",
                      to: "/vendor-rules",
                      target: "_blank",
                      rel: "noopener noreferrer",
                      className: "font-medium text-sky-600 hover:underline dark:text-sky-300",
                      onClick: (e) => e.stopPropagation()
                    }, "vendor rules"),
                    h("span", { key: "suf" }, ".")
                  ])
                ])
              ]),
              err ? h(InlineNotice, { key: "form-err", variant: "error", onDismiss: () => setErr("") }, err) : null,
              h("div", { key: "actions", className: "flex flex-wrap gap-3 pt-2" }, [
                h(Button, { type: "button", variant: "ghost", onClick: onCancel }, "Cancel"),
                h(Button, { type: "submit", loading, disabled: !!applyBlocked }, "Submit application")
              ]),
              h("p", { key: "foot", className: "flex items-center justify-center gap-2 text-center text-xs text-slate-500 dark:text-slate-400" }, [
                h(Lock, { className: "h-3.5 w-3.5 shrink-0" }),
                "Your application will be reviewed by our admin team. You will be notified via email."
              ])
            ].filter(Boolean)
          )
        ])
      ])
    ])
    ),
    h(CartDrawer, { key: "cart", open: cartOpen, onClose: () => setCartOpen(false) })
  ]);
}
