import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Box,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Headphones,
  Info,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UploadCloud,
  UserX
} from "lucide-react";
import { useAuth, useNotice } from "./contexts";
import { apiFetch, getApiBase } from "./api";
import { h, f } from "./h";
import { Badge, GlassCard, InlineNotice } from "./ui";
import { BuyerLayout, CartDrawer } from "./screensBuyer";

const DESCRIPTION_MAX = 500;

/** Buyer-facing issue types (matches backend category enum). */
const BUYER_PROBLEMS = [
  { value: "item_not_delivered", label: "Item not delivered", icon: Box },
  { value: "wrong_item_received", label: "Wrong item received", icon: RefreshCw },
  { value: "fake_misleading_product", label: "Fake / misleading product", icon: AlertTriangle },
  { value: "seller_not_responding", label: "Seller not responding", icon: MessageSquare },
  { value: "other", label: "Other", icon: MoreHorizontal }
];

/** Vendor-facing issue types. */
const VENDOR_PROBLEMS = [
  { value: "buyer_no_show", label: "Buyer didn't show up / not available", icon: UserX },
  { value: "payment_not_confirmed", label: "Payment not confirmed / wants to pay outside the app", icon: CreditCard },
  { value: "fraudulent_activity", label: "Fraudulent activity", icon: ShieldAlert },
  { value: "abuse_misconduct", label: "Abusive or inappropriate behavior", icon: AlertCircle },
  { value: "other", label: "Other issue", icon: MoreHorizontal }
];

/** Labels for table + admin alignment (includes legacy keys). */
const CATEGORY_LABELS = {
  item_not_delivered: "Item not delivered",
  wrong_item_received: "Wrong item received",
  fake_misleading_product: "Fake / misleading product",
  seller_not_responding: "Seller not responding",
  buyer_no_show: "Buyer didn't show up",
  payment_not_confirmed: "Payment not confirmed",
  fraudulent_activity: "Fraudulent activity",
  abuse_misconduct: "Abuse / misconduct",
  fake_seller: "Fake / misleading seller",
  scam: "Scam",
  bad_product: "Bad product / listing",
  chat_abuse: "Abuse in messages",
  other: "Other"
};

function reportStatusTone(s) {
  if (s === "open") return "warn";
  if (s === "in_review") return "info";
  if (s === "resolved") return "success";
  if (s === "dismissed") return "neutral";
  return "neutral";
}

function fmtDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

function shortId(id) {
  if (!id) return "—";
  return `#${String(id).slice(-8).toUpperCase()}`;
}

function categoryLabel(v) {
  return CATEGORY_LABELS[v] || v;
}

function ReportsPager({ page, total, limit, onPage }) {
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)));
  const start = total === 0 ? 0 : (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);
  return h("div", { className: "flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400" }, [
    h("span", { key: "t" }, `Showing ${start}-${end} of ${total} · page ${page}/${pages}`),
    h("div", { key: "b", className: "flex items-center gap-1" }, [
      h(
        "button",
        {
          key: "p",
          type: "button",
          disabled: page <= 1,
          onClick: () => onPage(Math.max(1, page - 1)),
          className:
            "flex items-center gap-1 rounded-xl border border-purple-200/80 bg-white/60 px-2.5 py-1.5 text-xs font-medium text-purple-800 hover:bg-purple-50 disabled:opacity-40 dark:border-purple-500/20 dark:bg-white/5 dark:text-purple-200 dark:hover:bg-purple-950/40"
        },
        [h(ChevronLeft, { key: "i", className: "h-3.5 w-3.5" }), "Prev"]
      ),
      h(
        "button",
        {
          key: "n",
          type: "button",
          disabled: page >= pages,
          onClick: () => onPage(Math.min(pages, page + 1)),
          className:
            "flex items-center gap-1 rounded-xl border border-purple-200/80 bg-white/60 px-2.5 py-1.5 text-xs font-medium text-purple-800 hover:bg-purple-50 disabled:opacity-40 dark:border-purple-500/20 dark:bg-white/5 dark:text-purple-200 dark:hover:bg-purple-950/40"
        },
        ["Next", h(ChevronRight, { key: "i", className: "h-3.5 w-3.5" })]
      )
    ])
  ]);
}

function StepCard({ step, title, children, actions }) {
  return h(
    "section",
    {
      className:
        "rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-sm shadow-slate-200/40 dark:border-white/10 dark:bg-night-900/70 dark:shadow-none"
    },
    [
      h("div", { key: "h", className: "mb-3 flex items-center justify-between gap-3" }, [
        h("h3", { key: "t", className: "flex items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-white" }, [
          h("span", { key: "n", className: "tabular-nums" }, `${step}.`),
          title
        ]),
        actions || null
      ]),
      children
    ]
  );
}

/**
 * Issue type picker styled to match the reference: button shows selected option (with icon),
 * expanding to a list of options with icons.
 */
function IssueTypePicker({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) || null;
  return h("div", { className: "relative" }, [
    h(
      "button",
      {
        key: "btn",
        type: "button",
        onClick: () => setOpen((v) => !v),
        "aria-haspopup": "listbox",
        "aria-expanded": open,
        className:
          "flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-800 shadow-sm transition hover:border-purple-300 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200/60 dark:border-white/10 dark:bg-night-900/60 dark:text-slate-100 dark:hover:border-purple-500/40"
      },
      [
        selected
          ? h("span", { key: "s", className: "inline-flex items-center gap-2.5 text-slate-800 dark:text-slate-100" }, [
              h(selected.icon, { key: "i", className: "h-4.5 w-4.5 text-slate-500 dark:text-slate-300" }),
              h("span", { key: "l" }, selected.label)
            ])
          : h("span", { key: "p", className: "text-slate-400 dark:text-slate-500" }, "Select issue type"),
        h(ChevronDown, {
          key: "c",
          className: `h-4.5 w-4.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`
        })
      ]
    ),
    open
      ? h(
          "ul",
          {
            key: "list",
            role: "listbox",
            className:
              "mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md dark:border-white/10 dark:bg-night-900"
          },
          options.map((o) =>
            h(
              "li",
              {
                key: o.value,
                role: "option",
                "aria-selected": value === o.value,
                tabIndex: 0,
                onClick: () => {
                  onChange(o.value);
                  setOpen(false);
                },
                onKeyDown: (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onChange(o.value);
                    setOpen(false);
                  }
                },
                className:
                  "flex cursor-pointer items-center justify-between gap-2 px-4 py-3 text-sm text-slate-800 transition hover:bg-purple-50/70 focus:outline-none focus-visible:bg-purple-50/70 dark:text-slate-100 dark:hover:bg-purple-950/30"
              },
              [
                h("span", { key: "l", className: "inline-flex items-center gap-2.5" }, [
                  h(o.icon, { key: "i", className: "h-4.5 w-4.5 text-slate-500 dark:text-slate-300" }),
                  h("span", { key: "t" }, o.label)
                ]),
                value === o.value
                  ? h(Check, { key: "ok", className: "h-4 w-4 text-purple-600 dark:text-purple-300" })
                  : null
              ]
            )
          )
        )
      : null
  ]);
}

/**
 * @param {{ variant: "buyer" | "vendor" }} props
 */
function ReportPanelInner({ variant }) {
  const { accessToken } = useAuth();
  const { toast } = useNotice();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const problemOptions = variant === "vendor" ? VENDOR_PROBLEMS : BUYER_PROBLEMS;
  const defaultCat = problemOptions[0].value;

  const [category, setCategory] = useState(defaultCat);
  const [description, setDescription] = useState("");
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [targetType, setTargetType] = useState("other");
  const [targetId, setTargetId] = useState("");
  const [evidenceUrls, setEvidenceUrls] = useState([]);
  const [evidenceUploading, setEvidenceUploading] = useState(false);
  const [submitErr, setSubmitErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [contextOrder, setContextOrder] = useState(null);
  const [contextProduct, setContextProduct] = useState(null);
  const [contextErr, setContextErr] = useState("");

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [listNonce, setListNonce] = useState(0);
  const [listErr, setListErr] = useState("");
  const limit = 15;

  const backHref = variant === "vendor" ? "/vendor/dashboard" : "/";

  useEffect(() => {
    const p = searchParams.get("product");
    const o = searchParams.get("order");
    const u = searchParams.get("user");
    if (p) {
      setTargetType("product");
      setTargetId(p);
    } else if (o) {
      setTargetType("order");
      setTargetId(o);
    } else if (u) {
      setTargetType("user");
      setTargetId(u);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!accessToken || targetType !== "order" || !targetId) {
      setContextOrder(null);
      return;
    }
    let cancelled = false;
    setContextErr("");
    (async () => {
      try {
        const d = await apiFetch(`/api/orders/${targetId}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!cancelled && d.order) setContextOrder(d.order);
      } catch (ex) {
        if (!cancelled) {
          setContextOrder(null);
          setContextErr(ex.message || "Could not load order details for this report.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, targetType, targetId]);

  useEffect(() => {
    if (!targetId || targetType !== "product") {
      setContextProduct(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const d = await apiFetch(`/api/products/${targetId}`);
        if (!cancelled && d.product) setContextProduct(d.product);
      } catch {
        if (!cancelled) setContextProduct(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [targetId, targetType]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setListErr("");
    (async () => {
      try {
        const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
        const d = await apiFetch(`/api/reports?${qs.toString()}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!cancelled) {
          setRows(d.reports || []);
          setTotal(d.total || 0);
        }
      } catch (ex) {
        if (!cancelled) setListErr(ex.message || "Could not load your reports.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, page, listNonce]);

  const addEvidenceFile = async (file) => {
    if (!file || !accessToken) return;
    if (evidenceUrls.length >= 3) {
      setSubmitErr("You can attach at most 3 images.");
      return;
    }
    const ok = /^image\/(jpeg|png|webp)$/i.test(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
    if (!ok) {
      setSubmitErr("Use PNG, JPG, or WebP (max 5 MB each).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setSubmitErr("Each file must be 5 MB or smaller.");
      return;
    }
    setSubmitErr("");
    setEvidenceUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${getApiBase()}/api/uploads/report-evidence`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: fd,
        credentials: "include"
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error?.message || data?.message || `Upload failed (${res.status})`;
        throw new Error(msg);
      }
      if (data.url) setEvidenceUrls((prev) => [...prev, data.url].slice(0, 3));
    } catch (ex) {
      setSubmitErr(ex.message || "Upload failed.");
    } finally {
      setEvidenceUploading(false);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitErr("");
    if (!accessToken) return;
    if (String(description).trim().length < 10) {
      setSubmitErr("Please describe the issue in at least 10 characters.");
      return;
    }
    setSubmitting(true);
    try {
      const trimmedDesc = description.trim();
      const extra = additionalInfo.trim();
      const fullDescription = extra
        ? `${trimmedDesc}\n\nAdditional information: ${extra}`
        : trimmedDesc;
      await apiFetch("/api/reports", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: {
          category,
          description: fullDescription,
          targetType,
          targetId: String(targetId).trim() || undefined,
          evidenceUrls: evidenceUrls.length ? evidenceUrls : undefined
        }
      });
      toast("Report submitted. Our team will review it.", { variant: "success" });
      setDescription("");
      setAdditionalInfo("");
      setCategory(defaultCat);
      setEvidenceUrls([]);
      setPage(1);
      setListNonce((n) => n + 1);
    } catch (ex) {
      setSubmitErr(ex.message || "Could not submit report.");
    } finally {
      setSubmitting(false);
    }
  };

  const orderProductName = useMemo(() => {
    if (contextOrder && Array.isArray(contextOrder.items) && contextOrder.items.length) {
      return contextOrder.items.map((it) => it.name).filter(Boolean).join(", ");
    }
    return contextProduct ? contextProduct.name || contextProduct.title || null : null;
  }, [contextOrder, contextProduct]);

  const orderThumb = useMemo(() => {
    if (contextOrder && Array.isArray(contextOrder.items) && contextOrder.items.length) {
      const it = contextOrder.items[0];
      return (it && (it.image || it.imageUrl)) || null;
    }
    if (contextProduct) {
      const im = contextProduct.images || contextProduct.imageUrls || contextProduct.photoUrls;
      if (Array.isArray(im) && im.length) return im[0];
      if (typeof im === "string") return im;
      return contextProduct.image || contextProduct.imageUrl || null;
    }
    return null;
  }, [contextOrder, contextProduct]);

  const orderPartyLabel = useMemo(() => {
    if (!contextOrder) return null;
    if (variant === "buyer") {
      const sc = contextOrder.sellerContacts;
      if (Array.isArray(sc) && sc.length && sc[0].displayName) return String(sc[0].displayName).trim();
    }
    if (variant === "vendor" && contextOrder.buyerContact && contextOrder.buyerContact.displayName) {
      return String(contextOrder.buyerContact.displayName).trim();
    }
    return null;
  }, [contextOrder, variant]);

  const showOrderDetails = Boolean(
    (targetType === "order" && (targetId || contextOrder)) ||
      (targetType === "product" && (contextProduct || targetId))
  );

  const pageTitle = variant === "vendor" ? "Report a Buyer / Issue" : "Report an Issue";
  const introTitle = variant === "vendor" ? "We take reports seriously" : "We’re here to help";
  const introBody =
    variant === "vendor"
      ? "Help us keep Campus Mart safe and trusted for everyone."
      : "Tell us what happened and we’ll review your report.";
  const orderStepTitle = variant === "vendor" ? "Order / Transaction details" : "Order details";
  const orderAmount = useMemo(() => {
    if (!contextOrder) return null;
    const total = typeof contextOrder.total === "number" ? contextOrder.total : null;
    if (total == null) return null;
    const cur = (contextOrder.currency || "GHS").toUpperCase();
    const symbol = cur === "GHS" ? "₵" : cur === "USD" ? "$" : cur === "EUR" ? "€" : `${cur} `;
    try {
      return `${symbol}${Number(total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    } catch {
      return `${symbol}${total}`;
    }
  }, [contextOrder]);
  const charCount = description.length;
  const charPercent = Math.min(100, (charCount / DESCRIPTION_MAX) * 100);
  const charNearLimit = charCount > DESCRIPTION_MAX * 0.9;

  return h(
    "div",
    {
      className:
        "mx-auto w-full max-w-xl px-3 py-6 sm:px-4 sm:py-8"
    },
    [
      h(
        "div",
        {
          key: "shell",
          className:
            "overflow-hidden rounded-3xl border border-slate-200/70 bg-slate-50/95 shadow-xl shadow-slate-300/30 dark:border-white/10 dark:bg-night-900/40 dark:shadow-none"
        },
        [
          // Header bar
          h(
            "div",
            {
              key: "hd",
              className:
                "flex items-center justify-between gap-3 border-b border-slate-200/70 bg-white/95 px-4 py-3 dark:border-white/10 dark:bg-night-900/70"
            },
            [
              h(
                "button",
                {
                  key: "back",
                  type: "button",
                  onClick: () => navigate(backHref),
                  "aria-label": "Go back",
                  className:
                    "inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5"
                },
                h(ArrowLeft, { className: "h-5 w-5" })
              ),
              h(
                "h1",
                {
                  key: "ttl",
                  className:
                    "flex-1 truncate text-center text-base font-semibold text-slate-900 dark:text-white sm:text-lg"
                },
                pageTitle
              ),
              h(
                Link,
                {
                  key: "help",
                  to: "/support",
                  className:
                    "inline-flex items-center gap-1.5 text-sm font-medium text-purple-700 transition hover:text-purple-900 dark:text-purple-300 dark:hover:text-purple-100"
                },
                [h(Headphones, { key: "i", className: "h-4 w-4" }), "Help"]
              )
            ]
          ),

          // Body
          h(
            "form",
            {
              key: "body",
              className: "space-y-4 px-4 py-5 sm:px-5",
              onSubmit
            },
            [
              // Intro banner (variant-aware)
              h(
                "div",
                {
                  key: "intro",
                  className:
                    "flex items-start gap-3 rounded-2xl bg-purple-50/80 px-4 py-3 text-sm dark:bg-purple-950/30"
                },
                [
                  h(
                    "div",
                    {
                      key: "ic",
                      className:
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-200"
                    },
                    h(ShieldCheck, { className: "h-5 w-5" })
                  ),
                  h("div", { key: "tx", className: "min-w-0" }, [
                    h(
                      "p",
                      { className: "font-semibold text-slate-900 dark:text-white" },
                      introTitle
                    ),
                    h(
                      "p",
                      { className: "mt-0.5 text-slate-600 dark:text-slate-300" },
                      introBody
                    )
                  ])
                ]
              ),

              // Step 1: Issue type
              h(
                StepCard,
                { key: "s1", step: 1, title: "What seems to be the problem?" },
                h(IssueTypePicker, { value: category, onChange: setCategory, options: problemOptions })
              ),

              // Step 2: Description
              h(
                StepCard,
                {
                  key: "s2",
                  step: 2,
                  title: h("span", null, [
                    "Please describe the issue ",
                    h("span", { key: "r", className: "text-rose-500" }, "*")
                  ])
                },
                [
                  h("textarea", {
                    key: "ta",
                    rows: 5,
                    required: true,
                    value: description,
                    maxLength: DESCRIPTION_MAX,
                    onChange: (e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX)),
                    placeholder: "Explain what happened in detail...",
                    className:
                      "block w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200/60 dark:border-white/10 dark:bg-night-900/70 dark:text-slate-100 dark:placeholder-slate-500"
                  }),
                  h("div", { key: "meta", className: "mt-2 flex items-center justify-between gap-3" }, [
                    h(
                      "div",
                      {
                        key: "bar",
                        className:
                          "h-1 w-32 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"
                      },
                      h("div", {
                        className: `h-full rounded-full transition-all ${
                          charNearLimit ? "bg-amber-500" : "bg-purple-500"
                        }`,
                        style: { width: `${charPercent}%` }
                      })
                    ),
                    h(
                      "span",
                      {
                        key: "ct",
                        className: `text-xs tabular-nums ${
                          charNearLimit ? "text-amber-600" : "text-slate-500 dark:text-slate-400"
                        }`
                      },
                      `${charCount}/${DESCRIPTION_MAX}`
                    )
                  ])
                ]
              ),

              // Step 3: Upload evidence
              h(
                StepCard,
                {
                  key: "s3",
                  step: 3,
                  title: "Upload evidence ",
                  actions: h(
                    "span",
                    { className: "text-xs font-normal text-slate-500 dark:text-slate-400" },
                    "(optional)"
                  )
                },
                [
                  h(
                    "p",
                    {
                      key: "sub",
                      className: "mb-3 text-xs text-slate-500 dark:text-slate-400"
                    },
                    "Add photos or screenshots to support your report."
                  ),
                  h(
                    "button",
                    {
                      key: "drop",
                      type: "button",
                      disabled: evidenceUploading || evidenceUrls.length >= 3,
                      onClick: () => fileRef.current?.click(),
                      onDragOver: (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      },
                      onDrop: (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const f2 = e.dataTransfer.files && e.dataTransfer.files[0];
                        if (f2) addEvidenceFile(f2);
                      },
                      className:
                        "flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-200 bg-white px-4 py-7 text-center transition hover:border-purple-400 hover:bg-purple-50/40 disabled:opacity-50 dark:border-white/10 dark:bg-night-900/60 dark:hover:border-purple-500/40 dark:hover:bg-purple-950/20"
                    },
                    [
                      evidenceUploading
                        ? h(Loader2, { key: "ld", className: "h-7 w-7 animate-spin text-purple-600 dark:text-purple-300" })
                        : h(UploadCloud, { key: "ic", className: "h-7 w-7 text-purple-600 dark:text-purple-300" }),
                      h(
                        "p",
                        { key: "t1", className: "text-sm font-medium text-slate-800 dark:text-slate-100" },
                        "Click to upload or drag and drop"
                      ),
                      h(
                        "p",
                        { key: "t2", className: "text-xs text-slate-500 dark:text-slate-400" },
                        "PNG, JPG up to 5MB"
                      )
                    ]
                  ),
                  h("input", {
                    key: "inp",
                    ref: fileRef,
                    type: "file",
                    accept: "image/png,image/jpeg,image/webp",
                    className: "hidden",
                    onChange: (e) => {
                      const f2 = e.target.files && e.target.files[0];
                      e.target.value = "";
                      if (f2) addEvidenceFile(f2);
                    }
                  }),
                  evidenceUrls.length
                    ? h(
                        "div",
                        { key: "thumbs", className: "mt-3 flex flex-wrap gap-2" },
                        evidenceUrls.map((url, i) =>
                          h("div", { key: url, className: "group relative" }, [
                            h("img", {
                              key: "img",
                              src: url,
                              alt: "",
                              className: "h-20 w-20 rounded-xl border border-slate-200 object-cover dark:border-white/10"
                            }),
                            h(
                              "button",
                              {
                                key: "rm",
                                type: "button",
                                "aria-label": "Remove",
                                className:
                                  "absolute -right-1.5 -top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-rose-600 text-white shadow-md opacity-0 transition group-hover:opacity-100",
                                onClick: () => setEvidenceUrls((u) => u.filter((_, j) => j !== i))
                              },
                              h(Trash2, { className: "h-3.5 w-3.5" })
                            )
                          ])
                        )
                      )
                    : null
                ]
              ),

              // Step 4: Order/Transaction details (only when relevant)
              showOrderDetails
                ? h(
                    StepCard,
                    { key: "s4", step: 4, title: orderStepTitle },
                    [
                      contextErr
                        ? h(
                            "p",
                            {
                              key: "err",
                              className:
                                "mb-3 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/20 dark:bg-amber-950/20 dark:text-amber-200"
                            },
                            contextErr
                          )
                        : null,
                      h(
                        "div",
                        {
                          key: "row",
                          className:
                            "flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-white/10 dark:bg-night-900/60"
                        },
                        [
                          h(
                            "div",
                            {
                              key: "thumb",
                              className:
                                "flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-white/5"
                            },
                            orderThumb
                              ? h("img", { src: orderThumb, alt: "", className: "h-full w-full object-cover" })
                              : h(Box, { className: "h-6 w-6 text-slate-400" })
                          ),
                          h(
                            "div",
                            {
                              key: "cells",
                              className: `grid min-w-0 flex-1 gap-2 text-xs ${
                                variant === "vendor" && orderAmount ? "grid-cols-4" : "grid-cols-3"
                              }`
                            },
                            [
                              h("div", { key: "id", className: "min-w-0" }, [
                                h(
                                  "p",
                                  { className: "text-[11px] uppercase tracking-wide text-slate-400" },
                                  targetType === "product" ? "Product ID" : "Order ID"
                                ),
                                h(
                                  "p",
                                  {
                                    className:
                                      "truncate font-medium text-slate-800 dark:text-slate-100"
                                  },
                                  shortId(
                                    (contextOrder && contextOrder.id) ||
                                      (contextProduct && contextProduct.id) ||
                                      targetId
                                  )
                                )
                              ]),
                              h("div", { key: "pr", className: "min-w-0" }, [
                                h(
                                  "p",
                                  { className: "text-[11px] uppercase tracking-wide text-slate-400" },
                                  "Product"
                                ),
                                h(
                                  "p",
                                  {
                                    className: "truncate font-medium text-slate-800 dark:text-slate-100"
                                  },
                                  orderProductName || "—"
                                )
                              ]),
                              h("div", { key: "vd", className: "min-w-0" }, [
                                h(
                                  "p",
                                  { className: "text-[11px] uppercase tracking-wide text-slate-400" },
                                  variant === "vendor" ? "Buyer" : "Vendor"
                                ),
                                h(
                                  "p",
                                  {
                                    className: "truncate font-medium text-slate-800 dark:text-slate-100"
                                  },
                                  orderPartyLabel ||
                                    (contextProduct && (contextProduct.sellerName || contextProduct.vendorName)) ||
                                    "—"
                                )
                              ]),
                              variant === "vendor" && orderAmount
                                ? h("div", { key: "amt", className: "min-w-0" }, [
                                    h(
                                      "p",
                                      { className: "text-[11px] uppercase tracking-wide text-slate-400" },
                                      "Amount"
                                    ),
                                    h(
                                      "p",
                                      {
                                        className:
                                          "truncate font-semibold text-slate-900 dark:text-white"
                                      },
                                      orderAmount
                                    )
                                  ])
                                : null
                            ].filter(Boolean)
                          ),
                          h(ChevronRight, {
                            key: "ch",
                            className: "h-5 w-5 shrink-0 text-slate-300"
                          })
                        ]
                      )
                    ].filter(Boolean)
                  )
                : null,

              // Step 5: Additional information
              h(
                StepCard,
                {
                  key: "s5",
                  step: showOrderDetails ? 5 : 4,
                  title: "Additional information ",
                  actions: h(
                    "span",
                    { className: "text-xs font-normal text-slate-500 dark:text-slate-400" },
                    "(optional)"
                  )
                },
                h("input", {
                  type: "text",
                  value: additionalInfo,
                  maxLength: 300,
                  onChange: (e) => setAdditionalInfo(e.target.value.slice(0, 300)),
                  placeholder: "Any additional details, chat screenshots, phone numbers, etc.",
                  className:
                    "block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200/60 dark:border-white/10 dark:bg-night-900/70 dark:text-slate-100 dark:placeholder-slate-500"
                })
              ),

              // What happens next?
              h(
                "div",
                {
                  key: "next",
                  className:
                    "flex items-start gap-3 rounded-2xl border border-purple-100 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-night-900/70"
                },
                [
                  h(
                    "div",
                    {
                      key: "ic",
                      className:
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-200"
                    },
                    h(Info, { className: "h-5 w-5" })
                  ),
                  h("div", { key: "tx", className: "min-w-0" }, [
                    h(
                      "p",
                      { className: "font-semibold text-slate-900 dark:text-white" },
                      "What happens next?"
                    ),
                    h(
                      "p",
                      { className: "mt-0.5 text-slate-600 dark:text-slate-300" },
                      "Our team will review your report and take appropriate action. You will be notified within 24–48 hours."
                    )
                  ])
                ]
              ),

              // Errors
              submitErr
                ? h(
                    InlineNotice,
                    { key: "err", variant: "error", onDismiss: () => setSubmitErr("") },
                    submitErr
                  )
                : null,

              // Submit
              h(
                "button",
                {
                  key: "sub",
                  type: "submit",
                  disabled: submitting || charCount < 10,
                  className:
                    "inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-purple-600 px-4 py-3.5 text-base font-semibold text-white shadow-lg shadow-purple-900/20 transition hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-purple-600 dark:hover:bg-purple-500"
                },
                [
                  submitting
                    ? h(Loader2, { key: "ld", className: "h-5 w-5 animate-spin" })
                    : h(Send, { key: "i", className: "h-5 w-5" }),
                  h("span", { key: "t" }, "Submit Report")
                ]
              )
            ].filter(Boolean)
          )
        ]
      ),

      // Reports list (kept under the form so users can see history)
      h(
        "div",
        { key: "list-wrap", className: "mt-8" },
        [
          h(
            "h2",
            {
              key: "list-h",
              className: "mb-3 text-lg font-semibold text-slate-900 dark:text-white"
            },
            "Your reports"
          ),
          listErr
            ? h(
                InlineNotice,
                { key: "le", variant: "error", onDismiss: () => setListErr("") },
                listErr
              )
            : null,
          h(
            GlassCard,
            {
              key: "tbl",
              className: "overflow-x-auto !border-purple-200/50 !p-0 dark:!border-purple-500/10"
            },
            h("table", { className: "w-full min-w-[760px] text-left text-sm" }, [
              h(
                "thead",
                {
                  className:
                    "bg-purple-50/80 text-xs uppercase text-purple-900 dark:bg-purple-950/50 dark:text-purple-100"
                },
                h("tr", null, [
                  h("th", { className: "px-4 py-3" }, "ID"),
                  h("th", { className: "px-4 py-3" }, "Type"),
                  h("th", { className: "px-4 py-3" }, "Target"),
                  h("th", { className: "px-4 py-3" }, "Photos"),
                  h("th", { className: "px-4 py-3" }, "Status"),
                  h("th", { className: "px-4 py-3" }, "Submitted"),
                  h("th", { className: "px-4 py-3" }, "Details")
                ])
              ),
              h(
                "tbody",
                { className: "divide-y divide-purple-100/80 dark:divide-white/5" },
                rows.length === 0
                  ? h(
                      "tr",
                      { key: "e" },
                      h(
                        "td",
                        {
                          colSpan: 7,
                          className: "px-4 py-12 text-center text-sm text-slate-500"
                        },
                        "You have not submitted any reports yet."
                      )
                    )
                  : rows.map((r) =>
                      h(
                        "tr",
                        {
                          key: r.id,
                          className: "align-top hover:bg-purple-50/40 dark:hover:bg-white/[0.03]"
                        },
                        [
                          h("td", { className: "px-4 py-3 font-mono text-xs" }, shortId(r.id)),
                          h(
                            "td",
                            { className: "px-4 py-3 text-slate-700 dark:text-slate-200" },
                            categoryLabel(r.category)
                          ),
                          h(
                            "td",
                            { className: "px-4 py-3 text-slate-500" },
                            [
                              h("div", { key: "t", className: "capitalize" }, r.targetType),
                              r.targetId
                                ? h(
                                    "div",
                                    {
                                      key: "i",
                                      className: "mt-0.5 font-mono text-[10px] text-slate-400"
                                    },
                                    String(r.targetId).slice(-12)
                                  )
                                : null
                            ].filter(Boolean)
                          ),
                          h("td", { className: "px-4 py-3" }, [
                            r.evidenceUrls && r.evidenceUrls.length
                              ? h(
                                  "div",
                                  { key: "ev", className: "flex gap-1" },
                                  r.evidenceUrls.slice(0, 3).map((u) =>
                                    h(
                                      "div",
                                      {
                                        key: u,
                                        className:
                                          "h-8 w-8 overflow-hidden rounded-md border border-white/20"
                                      },
                                      h("img", {
                                        src: u,
                                        alt: "",
                                        className: "h-full w-full object-cover"
                                      })
                                    )
                                  )
                                )
                              : h("span", { className: "text-xs text-slate-400" }, "—")
                          ]),
                          h(
                            "td",
                            { className: "px-4 py-3" },
                            h(
                              Badge,
                              { tone: reportStatusTone(r.status) },
                              r.status.replace(/_/g, " ")
                            )
                          ),
                          h(
                            "td",
                            { className: "px-4 py-3 text-xs text-slate-500" },
                            fmtDate(r.createdAt)
                          ),
                          h(
                            "td",
                            {
                              className:
                                "max-w-[280px] px-4 py-3 text-xs text-slate-600 dark:text-slate-300"
                            },
                            [
                              h(
                                "p",
                                {
                                  key: "d",
                                  className: "line-clamp-4 whitespace-pre-wrap break-words"
                                },
                                r.description
                              ),
                              r.adminNote
                                ? h(
                                    "p",
                                    {
                                      key: "n",
                                      className:
                                        "mt-2 rounded-lg border border-purple-200/50 bg-purple-50/80 p-2 text-purple-900 dark:border-purple-500/20 dark:bg-purple-950/30 dark:text-purple-100"
                                    },
                                    [
                                      h(
                                        "span",
                                        { key: "l", className: "font-semibold" },
                                        "Admin: "
                                      ),
                                      r.adminNote
                                    ]
                                  )
                                : null
                            ].filter(Boolean)
                          )
                        ]
                      )
                    )
              )
            ])
          ),
          h(ReportsPager, { key: "pg", page, total, limit, onPage: setPage })
        ]
      )
    ]
  );
}

export function BuyerReportsPage() {
  const [cartOpen, setCartOpen] = useState(false);
  return h(f, null, [
    h(
      BuyerLayout,
      { key: "layout", onOpenCart: () => setCartOpen(true), hideSearch: true, title: "Reports" },
      h(
        "div",
        { key: "main", className: "w-full px-4 pb-10 sm:px-6 lg:px-8" },
        h(ReportPanelInner, { key: "panel", variant: "buyer" })
      )
    ),
    h(CartDrawer, { key: "cart", open: cartOpen, onClose: () => setCartOpen(false) })
  ]);
}

export function VendorReportsPage() {
  return h(ReportPanelInner, { variant: "vendor" });
}
