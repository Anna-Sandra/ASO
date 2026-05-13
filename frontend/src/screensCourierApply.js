import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, CloudUpload, Lock, Mail, Navigation, Phone, ShieldCheck, Truck, User } from "lucide-react";
import { useAuth, useNotice } from "./contexts";
import { apiFetch, fetchPublicPlatformConfig, getApiBase } from "./api";
import { BuyerLayout, CartDrawer } from "./screensBuyer";
import { h, f } from "./h";
import { Button, Field, GlassPanel, InlineNotice, TextArea, TextInput } from "./ui";

function apiErrorMessage(ex, fallback) {
  const m = ex && typeof ex.message === "string" ? ex.message.trim() : "";
  if (m && m !== "Validation error") return m;
  return m || fallback || "Something went wrong.";
}

function messageFromApiJson(data) {
  if (!data || typeof data !== "object") return "";
  const nested = data.error && typeof data.error.message === "string" ? data.error.message.trim() : "";
  if (nested) return nested;
  return typeof data.message === "string" ? data.message.trim() : "";
}

function humanizeCourierApplyError(raw) {
  const m = String(raw || "").trim();
  if (!m) return "Could not submit your application. Please try again.";
  if (/Too small:\s*expected string to have >=\s*15/i.test(m)) {
    return "Please write at least a short paragraph (15+ characters) in “About your delivery experience” so admins can review your application.";
  }
  if (/Too small:\s*expected string to have >=\s*5/i.test(m)) {
    return "Please enter a complete phone number.";
  }
  if (/Too small:\s*expected string to have >=\s*1/i.test(m)) {
    return "Please fill in all required fields.";
  }
  if (/Invalid option:\s*expected one of/i.test(m)) {
    return "Something in the form did not validate. Refresh and try again.";
  }
  return m;
}

export function CourierApplicationPage() {
  const nav = useNavigate();
  const { accessToken, user, setUser } = useAuth();
  const { toast } = useNotice();
  const fileRef = useRef(null);

  const [fullName, setFullName] = useState(() => String(user?.displayName || "").trim());
  const [email] = useState(() => String(user?.email || "").trim());
  const [phone, setPhone] = useState("");
  const [vehicleType, setVehicleType] = useState("bicycle");
  const [notes, setNotes] = useState("");
  const [idDocUrl, setIdDocUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeCourierRules, setAgreeCourierRules] = useState(false);
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
    (platformCfg.maintenanceMode === true || platformCfg.allowCourierApplications === false);

  const notesLen = notes.length;

  useEffect(() => {
    if (!user) return;
    if (user.role === "rider") {
      nav("/rider", { replace: true });
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
      if (data.url) setIdDocUrl(data.url);
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
      nav("/login", { state: { from: "/apply-courier" } });
      return;
    }
    if (applyBlocked) {
      setErr(
        platformCfg?.maintenanceMode
          ? platformCfg.maintenanceMessage?.trim() || "Applications are paused during maintenance."
          : "The marketplace is not accepting new courier applications right now."
      );
      return;
    }
    if (!agreeTerms || !agreeCourierRules) {
      setErr("Please accept the Terms & Conditions and the courier requirements.");
      return;
    }
    if (String(notes).trim().length < 15) {
      setErr("Please add a bit more detail in “About your delivery experience” (at least 15 characters).");
      return;
    }
    if (notesLen > 800) {
      setErr("That section must be 800 characters or less.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/courier-applications", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: {
          fullName: fullName.trim(),
          phone: phone.trim(),
          vehicleType: vehicleType.trim(),
          notes: notes.trim(),
          idDocUrl: idDocUrl.trim(),
          agreeToTerms: true,
          agreeCourierRules: true
        }
      });
      setUser((prev) => (prev ? { ...prev, riderApplicationStatus: "pending" } : prev));
      toast("Application submitted! We’ll notify you after review.", { variant: "success" });
      nav("/", { replace: true });
    } catch (ex) {
      setErr(humanizeCourierApplyError(apiErrorMessage(ex, "Could not submit application.")));
    } finally {
      setLoading(false);
    }
  };

  const onCancel = () => nav(-1);

  if (user?.role === "buyer" && user?.riderApplicationStatus === "pending") {
    return h(f, null, [
      h(
        BuyerLayout,
        {
          key: "layout",
          onOpenCart: () => setCartOpen(true),
          hideSearch: true,
          title: "Courier application"
        },
        h("div", { className: "w-full px-4 py-16 sm:px-6 lg:px-8" }, h("div", { className: "mx-auto max-w-lg" }, h(GlassPanel, null, [
          h("h1", { className: "font-display text-xl font-bold text-slate-900 dark:text-white" }, "Application pending"),
          h("p", { className: "mt-2 text-sm text-slate-600 dark:text-slate-400" }, "We already have your courier application. An admin will approve or reject it — check your email or sign in later for updates."),
          h(Link, { to: "/", className: "mt-4 inline-block text-sm font-medium text-sky-600 hover:underline dark:text-sky-300" }, "← Back to home")
        ])))
      ),
      h(CartDrawer, { key: "cart", open: cartOpen, onClose: () => setCartOpen(false) })
    ]);
  }

  const vehicleChoices = ["bicycle", "motorcycle", "car", "on foot"];

  return h(f, null, [
    h(
      BuyerLayout,
      {
        key: "layout",
        onOpenCart: () => setCartOpen(true),
        hideSearch: true,
        title: "Become a courier"
      },
      h("div", { key: "grid", className: "mx-auto w-full max-w-6xl gap-8 px-4 py-8 lg:grid lg:grid-cols-[minmax(0,340px)_1fr] lg:items-start lg:gap-10 lg:px-6 lg:px-8" }, [
        h(GlassPanel, { key: "side", className: "mb-8 lg:sticky lg:top-6 lg:mb-0" }, [
          h("div", { className: "flex items-start gap-3" }, [
            h(
              "div",
              {
                className:
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-900/25"
              },
              h(Truck, { className: "h-6 w-6" })
            ),
            h("div", { className: "min-w-0" }, [
              h("h2", { className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, "Campus courier"),
              h("p", { className: "mt-0.5 text-sm text-slate-600 dark:text-slate-400" }, "Deliver orders assigned by sellers or admins.")
            ])
          ]),
          h("div", { className: "mt-6 space-y-4" }, [
            h("h3", { className: "text-xs font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300" }, "Why apply"),
            [
              { icon: Navigation, t: "Flexible work", d: "Pick up nearby handoffs and earn per delivery." },
              { icon: ShieldCheck, t: "Trusted role", d: "Admins approve every courier before assigning routes." },
              { icon: CheckCircle2, t: "Campus-focused", d: "Built for on-campus pickups and tracked handoffs." }
            ].map((row) =>
              h("div", { key: row.t, className: "flex gap-3" }, [
                h(row.icon, { className: "mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" }),
                h("div", null, [
                  h("p", { className: "text-sm font-semibold text-slate-900 dark:text-white" }, row.t),
                  h("p", { className: "text-xs text-slate-600 dark:text-slate-400" }, row.d)
                ])
              ])
            )
          ]),
          h("div", { className: "vendor-form-help mt-6" }, [
            h("p", { className: "font-semibold" }, "Approved couriers"),
            h("p", { className: "mt-1 opacity-90" }, "Switch to courier mode at /rider after approval. Sellers attach you using your rider account.")
          ])
        ]),
        h("div", { key: "main" }, [
          h(GlassPanel, null, [
            h("h1", { className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, "Courier application"),
            h("p", { className: "mt-1 text-sm text-slate-600 dark:text-slate-400" }, "Shoppers apply here; admins review before you appear as an assignable rider."),
            platformCfg?.maintenanceMode
              ? h(InlineNotice, { key: "maint", variant: "warning", title: "Maintenance" }, platformCfg.maintenanceMessage?.trim() || "Applications may be unavailable during maintenance.")
              : null,
            platformCfg && platformCfg.allowCourierApplications === false
              ? h(InlineNotice, { key: "closed", variant: "warning", title: "Applications closed" }, "The operator has temporarily stopped new courier applications.")
              : null,
            h(
              "form",
              { className: "mt-6 space-y-5", onSubmit },
              [
                h("div", { key: "r1", className: "grid gap-4 sm:grid-cols-2" }, [
                  h(
                    Field,
                    { label: h("span", { className: "inline-flex items-center gap-1" }, [h(User, { className: "h-3.5 w-3.5" }), " Full name"]) },
                    h(TextInput, { value: fullName, onChange: (e) => setFullName(e.target.value), required: true })
                  ),
                  h(
                    Field,
                    { label: h("span", { className: "inline-flex items-center gap-1" }, [h(Mail, { className: "h-3.5 w-3.5" }), " Email"]) },
                    h(TextInput, { type: "email", value: email, readOnly: true, className: "opacity-80" })
                  )
                ]),
                h(
                  Field,
                  { key: "ph", label: h("span", { className: "inline-flex items-center gap-1" }, [h(Phone, { className: "h-3.5 w-3.5" }), " Phone"]) },
                  h(TextInput, { value: phone, onChange: (e) => setPhone(e.target.value), inputMode: "tel", required: true })
                ),
                h(
                  Field,
                  { key: "vt", label: "Vehicle / mode" },
                  h(TextInput, {
                    value: vehicleType,
                    onChange: (e) => setVehicleType(e.target.value),
                    placeholder: vehicleChoices.join(", ") + ", …",
                    required: true
                  })
                ),
                h(Field, { key: "notes", label: "About your delivery experience & availability" }, [
                  h(TextArea, {
                    value: notes,
                    onChange: (e) => setNotes(e.target.value.slice(0, 800)),
                    rows: 5,
                    required: true,
                    className: "min-h-[120px]",
                    placeholder: "Where you operate, usual hours, any ID you already carry, campus access, …"
                  }),
                  h("div", { key: "n-meta", className: "mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500" }, [
                    h("span", { key: "hint" }, "At least 15 characters."),
                    h("span", { key: "cnt" }, `${notesLen}/800`)
                  ])
                ]),
                h("div", { key: "up", className: "space-y-2" }, [
                  h("span", { className: "text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400" }, "ID (optional)"),
                  h(
                    "button",
                    {
                      type: "button",
                      onClick: () => fileRef.current?.click(),
                      disabled: uploading || !!applyBlocked,
                      className: "vendor-form-upload"
                    },
                    [
                      h(CloudUpload, { key: "upl-ic", className: "h-10 w-10 text-emerald-600 dark:text-emerald-400" }),
                      h("p", { key: "upl-t1", className: "text-sm font-medium text-slate-800 dark:text-slate-100" }, "Click to upload PNG, JPG, or PDF"),
                      h("p", { key: "upl-t2", className: "text-xs text-slate-500" }, "Max 5 MB — helps admins verify you faster.")
                    ]
                  ),
                  h("input", { ref: fileRef, type: "file", accept: "image/png,image/jpeg,application/pdf", className: "hidden", onChange: onPickFile }),
                  idDocUrl ? h("p", { className: "text-xs text-emerald-600 dark:text-emerald-400" }, "File uploaded.") : null
                ]),
                h("div", { key: "agr", className: "space-y-3" }, [
                  h("h3", { className: "text-xs font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300" }, "Agreement"),
                  h("label", { className: "vendor-form-terms" }, [
                    h("input", {
                      type: "checkbox",
                      checked: agreeTerms,
                      onChange: (e) => setAgreeTerms(e.target.checked),
                      className: "mt-1 h-4 w-4 rounded border-slate-300"
                    }),
                    h("span", { className: "text-sm text-slate-700 dark:text-slate-300" }, [
                      "I accept the ",
                      h(
                        Link,
                        {
                          key: "t",
                          to: "/terms",
                          target: "_blank",
                          rel: "noopener noreferrer",
                          className: "font-medium text-sky-600 hover:underline dark:text-sky-300",
                          onClick: (e) => e.stopPropagation()
                        },
                        "Terms & Conditions"
                      ),
                      "."
                    ])
                  ]),
                  h("label", { className: "vendor-form-terms" }, [
                    h("input", {
                      type: "checkbox",
                      checked: agreeCourierRules,
                      onChange: (e) => setAgreeCourierRules(e.target.checked),
                      className: "mt-1 h-4 w-4 rounded border-slate-300"
                    }),
                    h("span", { className: "text-sm text-slate-700 dark:text-slate-300" }, [
                      "I will follow lawful, safe delivery practices; provide accurate contact details; honor assigned handoffs and platform decisions; and understand misuse can lead to loss of courier access."
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
                  "Approved applicants become riders after admin review — there is no public “register as courier” shortcut."
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
