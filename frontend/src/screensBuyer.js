import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Cpu,
  Footprints,
  Heart,
  HelpCircle,
  LayoutGrid,
  Lock,
  Menu,
  MessageSquare,
  Minus,
  Package,
  Plus,
  ReceiptText,
  Search,
  Send,
  Camera,
  Shirt,
  ShoppingCart,
  Star,
  Store,
  Trash2,
  User,
  Utensils,
  Wallet,
  X
} from "lucide-react";
import { useAuth } from "./AuthContext";
import { useCart } from "./CartContext";
import { useNotice } from "./NoticeContext";
import { useTheme } from "./ThemeContext";
import { apiFetch, apiUploadProfileImage, deleteAuthenticatedAccount } from "./api";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  FILTERS,
  formatSellerPaymentSnippet,
  groupCartItemsBySeller,
  productBadge,
  productMatchesFilter,
  refFromId,
  sellerGroupGross
} from "./catalog";
import { formatGhc } from "./money";
import { h, f } from "./h";
import {
  Button,
  Field,
  GlassCard,
  GlassPanel,
  InlineNotice,
  LogoMark,
  RefImage,
  SelectInput,
  TextArea,
  TextInput,
  ThemeToggleButton
} from "./ui";

function buyerPricePanel(product) {
  return h(GlassPanel, { key: "price-info", className: "!border-sky-500/20" }, [
    h("h3", { className: "text-sm font-semibold text-slate-900 dark:text-white" }, "What you pay"),
    h(
      "p",
      { className: "mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400" },
      `The price shown (${formatGhc(product.price)}) is what you pay at checkout.`
    )
  ]);
}

/** @param {Record<string, unknown> | null | undefined} sellerPayment */
function buyerVendorPayPanel(sellerPayment) {
  if (!sellerPayment || typeof sellerPayment !== "object") {
    return h(
      GlassPanel,
      { key: "vend-pay", className: "!border-amber-500/30 !bg-amber-500/10" },
      h(
        "p",
        { className: "text-sm text-amber-950 dark:text-amber-100" },
        "This seller has not added a MoMo number or bank payout details yet. You can still order; use your order messages if you need payment help."
      )
    );
  }
  const sp = sellerPayment;
  const name = String(sp.displayName || "").trim();
  const phone = String(sp.phone || "").trim();
  const email = String(sp.email || "").trim();
  const bankName = String(sp.bankName || "").trim();
  const bankAcct = String(sp.bankAccountNumber || "").trim();
  const bankHolder = String(sp.bankAccountName || "").trim();
  const rows = [];
  if (name) rows.push(h("p", { key: "dn", className: "text-sm font-semibold text-slate-900 dark:text-white" }, name));
  if (phone) {
    rows.push(
      h("div", { key: "ph", className: "mt-2" }, [
        h("p", { className: "text-[10px] font-bold uppercase tracking-wide text-slate-500" }, "MoMo"),
        h("p", { className: "mt-0.5 font-mono text-sm text-slate-800 dark:text-slate-100" }, phone)
      ])
    );
  }
  if (email) {
    rows.push(
      h("div", { key: "em", className: "mt-2" }, [
        h("p", { className: "text-[10px] font-bold uppercase tracking-wide text-slate-500" }, "Email"),
        h("p", { className: "mt-0.5 text-sm text-slate-800 dark:text-slate-100" }, email)
      ])
    );
  }
  if (bankName || bankAcct || bankHolder) {
    rows.push(
      h("div", { key: "bk", className: "mt-3 border-t border-white/10 pt-3" }, [
        h("p", { className: "text-[10px] font-bold uppercase tracking-wide text-slate-500" }, "Bank transfer"),
        h("p", { className: "mt-1 text-sm text-slate-800 dark:text-slate-100" }, [bankName, bankHolder].filter(Boolean).join(" · ") || "—"),
        bankAcct ? h("p", { className: "mt-1 font-mono text-sm text-slate-800 dark:text-slate-100" }, bankAcct) : null
      ].filter(Boolean))
    );
  }
  return h(GlassPanel, { key: "vend-pay", className: "!border-sky-500/25" }, [
    h("h3", { className: "text-xs font-bold uppercase tracking-wide text-sky-800 dark:text-sky-200" }, "Vendor payment details"),
    h("p", { className: "mt-1 text-xs text-slate-600 dark:text-slate-400" }, "Use these details to pay the seller if your checkout method asks for them."),
    ...rows
  ]);
}

function ReviewStars({ value, className = "" }) {
  const v = Math.min(5, Math.max(0, Math.round(Number(value) || 0)));
  return h(
    "span",
    { className: `inline-flex items-center gap-0.5 ${className}` },
    [1, 2, 3, 4, 5].map((i) =>
      h(Star, {
        key: i,
        className: `h-4 w-4 shrink-0 ${i <= v ? "fill-amber-400 text-amber-400" : "fill-none text-slate-400/35 dark:text-slate-500/50"}`,
        strokeWidth: 1.5,
        "aria-hidden": true
      })
    )
  );
}

/** Clickable 1–5 stars (same visuals as product page). */
function RatingStarPicker({ value, onChange, starSizeClass = "h-8 w-8" }) {
  const v = Math.min(5, Math.max(1, Math.round(Number(value) || 1)));
  return h(
    "div",
    { className: "flex flex-wrap items-center gap-1", role: "group", "aria-label": "Star rating" },
    [1, 2, 3, 4, 5].map((n) =>
      h(
        "button",
        {
          key: n,
          type: "button",
          onClick: () => onChange(n),
          className: "rounded-lg p-1 transition hover:bg-white/10",
          "aria-label": `Rate ${n} out of 5`,
          "aria-pressed": n <= v
        },
        h(Star, {
          className: `${starSizeClass} ${n <= v ? "fill-amber-400 text-amber-400" : "fill-none text-slate-400/50"}`,
          strokeWidth: 1.5
        })
      )
    )
  );
}

function BuyerReviewModal({ open, onClose, productId, orderId, productTitle }) {
  const { accessToken } = useAuth();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [reviewStatus, setReviewStatus] = useState(null);
  const [reviewStatusErr, setReviewStatusErr] = useState("");
  const [reviewMsg, setReviewMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !productId || !orderId || !accessToken) return;
    setRating(5);
    setComment("");
    setReviewMsg("");
    setReviewStatusErr("");
    setReviewStatus(null);
    let cancelled = false;
    setLoading(true);
    const qs = `?orderId=${encodeURIComponent(orderId)}&_=${Date.now()}`;
    apiFetch(`/api/products/${productId}/review-status${qs}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
      .then((d) => {
        if (!cancelled) setReviewStatus(d);
      })
      .catch((ex) => {
        if (!cancelled) {
          setReviewStatus(null);
          setReviewStatusErr(ex.message || "Could not load review eligibility");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, productId, orderId, accessToken]);

  const submitReview = async () => {
    setReviewMsg("");
    if (!accessToken || !productId || !reviewStatus?.canSubmit) return;
    const oid =
      reviewStatus.orderId != null && String(reviewStatus.orderId).trim()
        ? String(reviewStatus.orderId).trim()
        : "";
    if (!reviewStatus.skipVerifiedPurchase && !oid) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/products/${productId}/reviews`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: { rating, comment: comment.trim(), ...(oid ? { orderId: oid } : {}) }
      });
      setComment("");
      const qs2 = `?orderId=${encodeURIComponent(orderId)}&_=${Date.now()}`;
      const st = await apiFetch(`/api/products/${productId}/review-status${qs2}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setReviewStatus(st);
      setReviewMsg("Thanks — your review was posted.");
    } catch (ex) {
      if (ex?.status === 409 && orderId) {
        try {
          const qs3 = `?orderId=${encodeURIComponent(orderId)}&_=${Date.now()}`;
          const st = await apiFetch(`/api/products/${productId}/review-status${qs3}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          setReviewStatus(st);
          if (st?.hasReview) {
            setReviewMsg("");
            return;
          }
        } catch {
          setReviewStatus((prev) => ({ ...(prev || {}), canSubmit: false, hasReview: true }));
        }
      }
      setReviewMsg(ex.message || "Could not submit review");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const titleId = "buyer-review-modal-title";
  const showForm = !loading && reviewStatus?.canSubmit;
  const doneThanks = Boolean(reviewMsg && String(reviewMsg).startsWith("Thanks"));

  return h(
    "div",
    {
      className: "fixed inset-0 z-[60] flex items-end justify-center sm:items-center",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": titleId
    },
    [
      h("button", {
        key: "backdrop",
        type: "button",
        className: "absolute inset-0 bg-black/55 backdrop-blur-[2px]",
        onClick: onClose,
        "aria-label": "Close dialog"
      }),
      h(
        "div",
        {
          key: "panel",
          className:
            "relative z-10 flex max-h-[min(92vh,560px)] w-full max-w-md flex-col rounded-t-3xl border border-white/10 bg-white/98 shadow-2xl dark:bg-night-900/98 sm:m-4 sm:max-h-[min(90vh,560px)] sm:rounded-3xl"
        },
        [
          h("div", { key: "head", className: "flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-4" }, [
            h(
              "h2",
              { id: titleId, className: "min-w-0 flex-1 font-display text-lg font-bold text-slate-900 dark:text-white" },
              "Rate this item"
            ),
            h(
              "button",
              {
                type: "button",
                className: "tap-target rounded-xl border border-white/15 p-2 hover:bg-white/10",
                onClick: onClose,
                "aria-label": "Close"
              },
              h(X, { className: "h-5 w-5 text-slate-600 dark:text-slate-300" })
            )
          ]),
          productTitle
            ? h("p", { key: "sub", className: "shrink-0 px-5 pt-3 text-sm font-medium text-slate-800 dark:text-slate-100" }, productTitle)
            : null,
          h(
            "div",
            { key: "body", className: "min-h-0 flex-1 overflow-y-auto px-5 py-4" },
            [
              loading && h("p", { key: "ld", className: "text-sm text-slate-500 dark:text-slate-400" }, "Loading…"),
              !loading &&
                reviewStatusErr &&
                h(InlineNotice, { key: "rs-err", variant: "error", className: "mb-3", onDismiss: () => setReviewStatusErr("") }, reviewStatusErr),
              !loading &&
                reviewStatus?.hasReview &&
                h(
                  InlineNotice,
                  {
                    key: "done",
                    variant: "success",
                    onDismiss: doneThanks ? () => setReviewMsg("") : undefined
                  },
                  doneThanks
                    ? reviewMsg
                    : h("div", { className: "space-y-2" }, [
                        h("p", { className: "font-medium" }, "You already reviewed this product."),
                        reviewStatus?.review &&
                          h("p", { className: "text-xs opacity-90" }, [
                            `Your review: ${reviewStatus.review.rating}/5`,
                            reviewStatus.review.createdAt
                              ? ` on ${new Date(reviewStatus.review.createdAt).toLocaleDateString()}`
                              : ""
                          ]),
                        reviewStatus?.review?.comment
                          ? h("p", { className: "text-xs opacity-90" }, `Comment: ${reviewStatus.review.comment}`)
                          : null,
                        h("p", { className: "text-xs opacity-90" }, "Only one review per product is allowed.")
                      ].filter(Boolean))
                ),
              !loading &&
                reviewStatus &&
                !reviewStatus.canSubmit &&
                !reviewStatus.hasReview &&
                reviewStatus.reason === "order_not_eligible" &&
                h(
                  "p",
                  { key: "bad-ord", className: "text-sm text-amber-800 dark:text-amber-200/90" },
                  "This order cannot be used for a review on this product."
                ),
              !loading &&
                reviewStatus &&
                !reviewStatus.canSubmit &&
                !reviewStatus.hasReview &&
                reviewStatus.reason === "purchase_required" &&
                h("p", { key: "need", className: "text-sm text-slate-600 dark:text-slate-400" }, "You need a paid order with this item to leave a review."),
              showForm &&
                h(GlassPanel, { key: "form", className: "!border-sky-500/20 !p-4" }, [
                  h("p", { className: "text-xs text-slate-500 dark:text-slate-400" }, "Tap a star to set your rating (1 is lowest, 5 is best)."),
                  h("div", { className: "mt-3" }, [
                    h("p", { className: "mb-2 text-sm font-medium text-slate-700 dark:text-slate-200" }, "Your rating"),
                    h(RatingStarPicker, { value: rating, onChange: setRating }),
                    h("p", { className: "mt-2 text-xs text-slate-500 dark:text-slate-400" }, `${rating} of 5 stars`)
                  ]),
                  h(
                    "div",
                    { key: "comm", className: "mt-4" },
                    h(
                      Field,
                      { label: "Comment (optional)" },
                      h(TextArea, {
                        value: comment,
                        onChange: (e) => setComment(e.target.value),
                        rows: 3,
                        placeholder: "Quality, would you recommend it?"
                      })
                    )
                  ),
                  reviewMsg &&
                    !doneThanks &&
                    h(InlineNotice, { key: "rm-err", variant: "error", className: "mt-3", onDismiss: () => setReviewMsg("") }, reviewMsg),
                  h(
                    Button,
                    {
                      key: "sub",
                      className: "mt-4 w-full",
                      type: "button",
                      loading: submitting,
                      onClick: submitReview
                    },
                    "Submit review"
                  )
                ])
            ].filter(Boolean)
          ),
          h("div", { key: "foot", className: "shrink-0 border-t border-white/10 px-5 py-3" }, [
            h(
              Button,
              {
                variant: doneThanks ? "secondary" : "ghost",
                className: "w-full",
                type: "button",
                onClick: onClose
              },
              doneThanks ? "Done" : "Close"
            )
          ])
        ].filter(Boolean)
      )
    ]
  );
}

export function ProductDetailPage() {
  const { productId } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const [searchParams] = useSearchParams();
  const orderIdFromUrl = searchParams.get("orderId") || "";
  const { accessToken } = useAuth();
  const { add } = useCart();
  const { toast } = useNotice();
  const [product, setProduct] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [reviewStatus, setReviewStatus] = useState(null);
  const [reviewStatusErr, setReviewStatusErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reviewMsg, setReviewMsg] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState("bad_product");
  const [reportDesc, setReportDesc] = useState("");
  const [reportSend, setReportSend] = useState(false);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    setLoading(true);
    setErr("");
    Promise.all([apiFetch(`/api/products/${productId}`), apiFetch(`/api/products/${productId}/reviews`)])
      .then(([pd, rv]) => {
        if (cancelled) return;
        setProduct(pd.product || null);
        setReviews(rv.reviews || []);
        setPhotoIdx(0);
      })
      .catch((ex) => {
        if (!cancelled) {
          setErr(ex.message || "Failed to load");
          setProduct(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  useEffect(() => {
    if (!accessToken || !productId) {
      setReviewStatus(null);
      setReviewStatusErr("");
      return;
    }
    let cancelled = false;
    setReviewStatusErr("");
    const qs = orderIdFromUrl ? `?orderId=${encodeURIComponent(orderIdFromUrl)}&_=${Date.now()}` : `?_=${Date.now()}`;
    apiFetch(`/api/products/${productId}/review-status${qs}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
      .then((d) => {
        if (!cancelled) {
          setReviewStatus(d);
          setReviewStatusErr("");
        }
      })
      .catch((ex) => {
        if (!cancelled) {
          setReviewStatus(null);
          setReviewStatusErr(ex.message || "Could not load review eligibility");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, productId, orderIdFromUrl]);

  const tryAdd = () => {
    if (!product || (product.stock ?? 0) <= 0) return;
    if (!accessToken) {
      nav("/login", { state: { from: loc.pathname } });
      return;
    }
    add(product, 1);
  };

  const submitReport = async () => {
    if (!accessToken || !productId) return;
    const d = reportDesc.trim();
    if (d.length < 10) {
      toast("Please describe the issue in at least 10 characters.", { variant: "warning" });
      return;
    }
    setReportSend(true);
    try {
      await apiFetch("/api/reports", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: { category: reportCategory, description: d, targetType: "product", targetId: productId }
      });
      toast("Thanks — we received your report.", { variant: "success" });
      setReportOpen(false);
      setReportDesc("");
    } catch (ex) {
      toast(ex.message || "Could not send report", { variant: "error" });
    } finally {
      setReportSend(false);
    }
  };

  const submitReview = async () => {
    setReviewMsg("");
    if (!accessToken || !productId || !reviewStatus?.canSubmit) return;
    const oid = reviewStatus.orderId != null && String(reviewStatus.orderId).trim() ? String(reviewStatus.orderId).trim() : "";
    if (!reviewStatus.skipVerifiedPurchase && !oid) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/products/${productId}/reviews`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: { rating, comment: comment.trim(), ...(oid ? { orderId: oid } : {}) }
      });
      setComment("");
      const rv = await apiFetch(`/api/products/${productId}/reviews`);
      setReviews(rv.reviews || []);
      const qs2 = orderIdFromUrl ? `?orderId=${encodeURIComponent(orderIdFromUrl)}&_=${Date.now()}` : `?_=${Date.now()}`;
      const st = await apiFetch(`/api/products/${productId}/review-status${qs2}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setReviewStatus(st);
      setReviewMsg("Thanks — your review was posted.");
    } catch (ex) {
      if (ex?.status === 409) {
        try {
          const qs3 = orderIdFromUrl
            ? `?orderId=${encodeURIComponent(orderIdFromUrl)}&_=${Date.now()}`
            : `?_=${Date.now()}`;
          const [rv, st] = await Promise.all([
            apiFetch(`/api/products/${productId}/reviews`),
            apiFetch(`/api/products/${productId}/review-status${qs3}`, {
              headers: { Authorization: `Bearer ${accessToken}` }
            })
          ]);
          setReviews(rv.reviews || []);
          setReviewStatus(st);
          if (st?.hasReview) {
            setReviewMsg("");
            return;
          }
        } catch {
          /* keep error message below */
        }
      }
      setReviewMsg(ex.message || "Could not submit review");
    } finally {
      setSubmitting(false);
    }
  };

  const avgRating = useMemo(() => {
    if (!reviews.length) return null;
    const s = reviews.reduce((a, r) => a + (Number(r.rating) || 0), 0);
    return Math.round((s / reviews.length) * 10) / 10;
  }, [reviews]);

  const badge = product ? productBadge(product) : null;
  const imgs = product?.imageUrls?.length ? product.imageUrls : [];

  if (loading) {
    return h(f, null, [
      h(
        BuyerLayout,
        { key: "layout", onOpenCart: () => setCartOpen(true), hideSearch: true, title: "Product" },
        h("p", { key: "ld", className: "mx-auto max-w-7xl px-4 py-10 text-slate-500" }, "Loading product…")
      ),
      h(CartDrawer, { key: "cart", open: cartOpen, onClose: () => setCartOpen(false) })
    ]);
  }

  if (err || !product) {
    return h(f, null, [
      h(
        BuyerLayout,
        { key: "layout", onOpenCart: () => setCartOpen(true), hideSearch: true, title: "Product" },
        h("div", { key: "em", className: "mx-auto max-w-3xl px-4 py-10" }, [
        h(
          InlineNotice,
          { variant: "error", className: "mt-2", title: "Oops", onDismiss: () => setErr("") },
          err || "Product not found"
        ),
        h(Link, { key: "bk", to: "/", className: "mt-6 inline-block" }, h(Button, { className: "!rounded-full" }, "Back to shop"))
        ])
      ),
      h(CartDrawer, { key: "cart", open: cartOpen, onClose: () => setCartOpen(false) })
    ]);
  }

  const mainSrc = imgs[photoIdx] || imgs[0];
  const titleShort = product.name.length > 28 ? `${product.name.slice(0, 26)}…` : product.name;

  return h(f, null, [
    h(
      BuyerLayout,
      {
        key: "layout",
        onOpenCart: () => setCartOpen(true),
        hideSearch: true,
        title: titleShort
      },
      h("div", { key: "main", className: "mx-auto max-w-5xl px-4 py-6 pb-28 sm:px-6" }, [
      h(Link, { key: "back", to: "/", className: "mb-6 inline-flex items-center gap-2 text-sm font-medium text-sky-600 hover:underline dark:text-sky-300" }, [
        h(ArrowLeft, { className: "h-4 w-4" }),
        h("span", null, "Back to shop")
      ]),
      h("div", { key: "grid", className: "grid gap-8 lg:grid-cols-2" }, [
        h("div", { key: "gal", className: "space-y-3" }, [
          h("div", { className: "relative overflow-hidden rounded-3xl border border-white/10 bg-white/5" }, [
            badge
              ? h(
                  "span",
                  {
                    key: "bdg",
                    className:
                      "absolute left-3 top-3 z-10 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-900"
                  },
                  badge
                )
              : null,
            h(RefImage, {
              key: "main",
              src: mainSrc,
              n: refFromId(product.id),
              alt: product.name,
              className: "aspect-square w-full object-cover sm:aspect-[4/3]"
            })
          ].filter(Boolean)),
          imgs.length > 1
            ? h(
                "div",
                { key: "thumbs", className: "flex flex-wrap gap-2" },
                imgs.map((url, i) =>
                  h(
                    "button",
                    {
                      key: url + i,
                      type: "button",
                      onClick: () => setPhotoIdx(i),
                      className: `overflow-hidden rounded-xl border-2 transition ${
                        i === photoIdx ? "border-sky-500 ring-2 ring-sky-500/30" : "border-transparent opacity-80 hover:opacity-100"
                      }`
                    },
                    h("img", { src: url, alt: "", className: "h-16 w-16 object-cover sm:h-20 sm:w-20" })
                  )
                )
              )
            : null
        ]),
        h("div", { key: "info", className: "space-y-5" }, [
          h("div", { key: "hd" }, [
            h("h1", { className: "font-display text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl" }, product.name),
            h("p", { className: "mt-1 text-sm text-slate-500 dark:text-slate-400" }, CATEGORY_LABELS[product.category] || product.category),
            avgRating != null &&
              h("div", { key: "avg", className: "mt-3 flex flex-wrap items-center gap-2 text-sm" }, [
                h(ReviewStars, { key: "st", value: avgRating }),
                h("span", { className: "font-semibold text-slate-700 dark:text-slate-200" }, String(avgRating)),
                h("span", { className: "text-slate-500" }, `(${reviews.length} review${reviews.length === 1 ? "" : "s"})`)
              ])
          ]),
          h("div", { key: "pr", className: "flex flex-wrap items-baseline gap-3" }, [
            h("span", { className: "text-3xl font-bold text-sky-600 dark:text-sky-300" }, formatGhc(product.price)),
            product.compareAtPrice != null &&
              product.compareAtPrice > 0 &&
              h("span", { className: "text-lg text-slate-400 line-through" }, formatGhc(product.compareAtPrice))
          ]),
          h("p", { className: "text-sm text-slate-600 dark:text-slate-300" }, `${product.stock ?? 0} in stock`),
          (product.tags || []).length > 0 &&
            h(
              "div",
              { key: "tags", className: "flex flex-wrap gap-2" },
              (product.tags || []).map((t) =>
                h(
                  "span",
                  {
                    key: t,
                    className: "rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-200"
                  },
                  t
                )
              )
            ),
          buyerPricePanel(product),
          buyerVendorPayPanel(product.sellerPayment),
          h(
            Button,
            {
              key: "add",
              variant: "primary",
              className: "w-full !rounded-2xl !py-3 sm:w-auto sm:!px-10",
              type: "button",
              disabled: (product.stock ?? 0) <= 0,
              onClick: tryAdd
            },
            [
              h(ShoppingCart, { key: "ic", className: "h-5 w-5" }),
              h(
                "span",
                { key: "tx" },
                (product.stock ?? 0) <= 0 ? "Out of stock" : accessToken ? "Add to cart" : "Sign in to add to cart"
              )
            ]
          ),
          accessToken &&
            h(f, { key: "rep-line" }, [
              h(
                "button",
                {
                  type: "button",
                  onClick: () => setReportOpen((v) => !v),
                  className: "text-sm font-medium text-amber-600 underline-offset-2 hover:underline dark:text-amber-300"
                },
                "Report this listing"
              ),
              reportOpen &&
                h(GlassPanel, { key: "rep-form", className: "mt-3 !border-amber-500/20" }, [
                  h("p", { className: "text-xs text-slate-500" }, "Reports are reviewed by admins. Be specific (min. 10 characters)."),
                  h(Field, { className: "mt-2", label: "Category" }, h(SelectInput, { value: reportCategory, onChange: (e) => setReportCategory(e.target.value) }, [
                    h("option", { value: "bad_product" }, "Bad product / misleading listing"),
                    h("option", { value: "fake_seller" }, "Fake or misleading seller"),
                    h("option", { value: "scam" }, "Scam"),
                    h("option", { value: "chat_abuse" }, "Abuse in messages"),
                    h("option", { value: "other" }, "Other")
                  ])),
                  h(Field, { className: "mt-2", label: "What happened?" }, h(TextArea, { value: reportDesc, onChange: (e) => setReportDesc(e.target.value), rows: 4, placeholder: "Describe the issue…" })),
                  h(
                    Button,
                    { className: "mt-3", type: "button", loading: reportSend, onClick: submitReport },
                    "Submit report"
                  )
                ])
            ]),
          h(GlassPanel, { key: "desc", className: "!border-white/10" }, [
            h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, "Description"),
            h("p", { className: "mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200" }, product.description || "No description provided.")
          ])
        ])
      ]),
      h("section", { key: "reviews", className: "mt-12 border-t border-white/10 pt-10" }, [
        h("h2", { className: "font-display text-xl font-bold text-slate-900 dark:text-white" }, "Customer reviews"),
        h("p", { className: "mt-1 text-sm text-slate-500 dark:text-slate-400" }, "Ratings are from verified purchases."),
        reviewStatusErr &&
          h(InlineNotice, { key: "rs-err", variant: "error", className: "mt-4", onDismiss: () => setReviewStatusErr("") }, reviewStatusErr),
        accessToken && reviewStatus?.canSubmit &&
          h(GlassPanel, { key: "form", className: "mt-6 !border-sky-500/20" }, [
            h("h3", { className: "font-semibold text-slate-900 dark:text-white" }, "Write a review"),
            h("p", { className: "mt-1 text-xs text-slate-500 dark:text-slate-400" }, "Tap a star to choose 1–5, then add an optional comment and submit."),
            h("div", { className: "mt-4" }, [
              h("p", { className: "mb-2 text-sm font-medium text-slate-700 dark:text-slate-200" }, "Rating"),
              h(RatingStarPicker, { value: rating, onChange: setRating }),
              h("p", { className: "mt-1 text-xs text-slate-500 dark:text-slate-400" }, `${rating} of 5 stars`)
            ]),
            h("div", { key: "comm", className: "mt-4" }, h(Field, { label: "Comment (optional)" }, h(TextArea, { value: comment, onChange: (e) => setComment(e.target.value), rows: 4, placeholder: "Quality, would you recommend it?" }))),
            reviewMsg &&
              (reviewMsg.startsWith("Thanks")
                ? h(InlineNotice, { key: "rm", variant: "success", className: "mt-3", onDismiss: () => setReviewMsg("") }, reviewMsg)
                : h(InlineNotice, { key: "rm", variant: "error", className: "mt-3", onDismiss: () => setReviewMsg("") }, reviewMsg)),
            h(
              Button,
              {
                key: "sub",
                className: "mt-4",
                type: "button",
                loading: submitting,
                onClick: submitReview
              },
              "Submit review"
            )
          ]),
        accessToken &&
          reviewStatus &&
          !reviewStatus.canSubmit &&
          !reviewStatus.hasReview &&
          reviewStatus.reason === "purchase_required" &&
          h("div", { key: "need", className: "mt-4 space-y-2 text-sm text-slate-500 dark:text-slate-400" }, [
            h("p", null, "You can leave a review after this item is on a paid order (paid, processing, sent_for_delivery, or delivered)."),
            h(Link, { to: "/orders", className: "font-medium text-sky-600 hover:underline dark:text-sky-300" }, "View my orders →"),
            h("p", { className: "text-xs" }, "Tip: use Rate on My orders to review here, or add ?orderId=… to this page’s address bar so we can match the right purchase.")
          ]),
        accessToken &&
          reviewStatus &&
          !reviewStatus.canSubmit &&
          !reviewStatus.hasReview &&
          reviewStatus.reason === "order_not_eligible" &&
          h("p", { key: "bad-ord", className: "mt-4 text-sm text-amber-700 dark:text-amber-200/90" }, "This order cannot be used for a review on this product. Pick another order from My orders or remove ?orderId from the address bar."),
        accessToken && reviewStatus?.hasReview &&
          h("p", { key: "done", className: "mt-4 text-sm text-emerald-600 dark:text-emerald-400" }, "You already reviewed this product."),
        !accessToken &&
          h("p", { key: "guest", className: "mt-4 text-sm text-slate-500 dark:text-slate-400" }, "Sign in to leave a review after you buy this product."),
        h("div", { key: "list", className: "mt-6 space-y-4" }, [
          reviews.length === 0 && h("p", { className: "text-sm text-slate-500" }, "No reviews yet."),
          reviews.map((r) =>
            h(GlassCard, { key: r.id, className: "!p-4" }, [
              h("div", { className: "flex flex-wrap items-center justify-between gap-2" }, [
                h("span", { className: "font-medium text-slate-800 dark:text-slate-100" }, r.reviewerDisplayName || "Verified buyer"),
                h("span", { className: "text-xs text-slate-500" }, new Date(r.createdAt).toLocaleDateString())
              ]),
              h(ReviewStars, { value: r.rating, className: "mt-1" }),
              r.comment && h("p", { className: "mt-2 text-sm text-slate-700 dark:text-slate-200" }, r.comment)
            ].filter(Boolean))
          )
        ])
      ])
    ])
    ),
    h(CartDrawer, { key: "cart", open: cartOpen, onClose: () => setCartOpen(false) })
  ]);
}

/** Rounded avatar: uploaded photo or initial letter. */
function buyerUserAvatarNode(u, { sizeClass = "h-8 w-8", textClass = "text-sm" } = {}) {
  const src = u?.profileImageUrl && String(u.profileImageUrl).trim();
  if (src) {
    return h("img", { src, alt: "", className: `${sizeClass} shrink-0 rounded-full object-cover` });
  }
  return h(
    "span",
    { className: `flex ${sizeClass} shrink-0 items-center justify-center rounded-full bg-sky-600 ${textClass} font-bold text-white` },
    buyerAvatarInitial(u)
  );
}

/** Avatar letter for buyer shell (matches vendor hub chip). */
function buyerAvatarInitial(u) {
  if (!u) return "B";
  const name = String(u.displayName || "").trim();
  if (name.length) {
    const ch = name.charAt(0);
    if (/[a-zA-Z]/i.test(ch)) return ch.toUpperCase();
    if (/[0-9]/.test(ch)) return ch;
  }
  const em = String(u.email || "").trim();
  if (em.length) {
    const local = em.split("@")[0] || em;
    const ch = local.charAt(0);
    if (/[a-zA-Z0-9]/.test(ch)) return ch.toUpperCase();
  }
  return "B";
}

/** Buyer chip text (same style pattern as vendor: avatar + label). */
function buyerNavbarHandle(u) {
  if (!u) return "";
  const label = String(u.displayName || "").trim() || u.email || "";
  return label || "Your account";
}

function BuyerSidebarNavLink({ to, end, icon: Icon, onClose, children }) {
  return h(NavLink, {
    to,
    end: Boolean(end),
    onClick: onClose,
    className: ({ isActive }) =>
      `flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm font-medium transition sm:px-4 sm:text-base ${
        isActive
          ? "bg-gradient-to-r from-sky-600/90 to-blue-700/90 text-white shadow-lg shadow-sky-900/30"
          : "text-slate-700 hover:bg-white/40 dark:text-slate-200 dark:hover:bg-white/10"
      }`,
    children: ({ isActive }) =>
      h(f, null, [
        h(Icon, { key: "ic", className: `h-4 w-4 shrink-0 sm:h-5 sm:w-5 ${isActive ? "text-white" : ""}` }),
        h("span", { key: "tx" }, children)
      ])
  });
}

function BuyerLayout({ children, onOpenCart, title, hideSearch, searchValue, onSearchChange, onSearchSubmit }) {
  const { dark, toggle } = useTheme();
  const { count } = useCart();
  const { accessToken, logout, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [loc.pathname]);

  const onLogout = async () => {
    await logout();
    nav("/", { replace: true });
  };

  const submitSearch = () => {
    onSearchSubmit?.();
  };

  const closeSb = () => setSidebarOpen(false);
  const cartNavInactive =
    "text-slate-700 hover:bg-white/40 dark:text-slate-200 dark:hover:bg-white/10";

  const sidebar = h(
    "aside",
    {
      className: `fixed inset-y-0 left-0 z-40 flex h-[100dvh] max-h-[100dvh] w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-white/10 bg-white/35 p-4 shadow-2xl backdrop-blur-2xl transition-transform dark:bg-night-900/50 lg:max-w-none lg:translate-x-0 ${
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      }`
    },
    [
      h("div", { key: "sb-mob", className: "mb-6 flex items-center justify-between gap-2 lg:hidden" }, [
        h("span", { key: "lbl", className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, "Menu"),
        h(
          "button",
          {
            key: "close",
            type: "button",
            className: "tap-target rounded-xl p-2 hover:bg-white/10",
            onClick: () => setSidebarOpen(false),
            "aria-label": "Close menu"
          },
          h(X, { className: "h-5 w-5" })
        )
      ]),
      h("div", { key: "main-title", className: "mb-6 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400" }, "Main"),
      h("nav", { key: "sb-nav-main", className: "space-y-1" }, [
        h(BuyerSidebarNavLink, { key: "dash", to: "/", end: true, icon: LayoutGrid, onClose: closeSb }, "Dashboard"),
        h(BuyerSidebarNavLink, { key: "ord", to: "/orders", icon: Package, onClose: closeSb }, "Orders"),
        accessToken && h(BuyerSidebarNavLink, { key: "msg", to: "/messages", icon: MessageSquare, onClose: closeSb }, "Messages"),
        h(BuyerSidebarNavLink, { key: "prof", to: "/profile", icon: User, onClose: closeSb }, "Profile")
      ].filter(Boolean)),
      h("div", { key: "shop-title", className: "mb-2 mt-6 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400" }, "Shop"),
      h("nav", { key: "sb-nav-shop", className: "space-y-1" }, [
        h(
          "button",
          {
            key: "sb-cart",
            type: "button",
            className: `relative flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition sm:px-4 sm:text-base ${cartNavInactive}`,
            onClick: () => {
              onOpenCart();
              setSidebarOpen(false);
            }
          },
          [
            h(ShoppingCart, { key: "i", className: "h-4 w-4 shrink-0 sm:h-5 sm:w-5" }),
            h("span", { key: "t" }, "Cart"),
            count > 0 &&
              h(
                "span",
                {
                  key: "c",
                  className:
                    "ml-auto flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-sky-500 px-2 text-xs font-bold text-white"
                },
                String(count)
              )
          ]
        )
      ]),
      h("div", { key: "sidebar-spacer", className: "min-h-0 flex-1" }),
      !accessToken &&
        h("div", { key: "sb-foot", className: "space-y-3 border-t border-white/10 pt-5" }, [
          h(
            Button,
            {
              key: "sb-sell",
              variant: "ghost",
              className: "w-full !justify-start !rounded-2xl",
              type: "button",
              onClick: () => {
                nav("/login", { state: { from: "vendor" } });
                setSidebarOpen(false);
              }
            },
            [h(Store, { key: "i", className: "h-5 w-5" }), h("span", { key: "t" }, "Seller sign in")]
          ),
          h(
            Button,
            {
              key: "sb-login",
              variant: "primary",
              className: "w-full !rounded-2xl",
              type: "button",
              onClick: () => {
                nav("/login");
                setSidebarOpen(false);
              }
            },
            "Login"
          )
        ]),
      h(
        GlassCard,
        {
          key: "shop-hub",
          className: "mt-3 !border-sky-500/20 !bg-gradient-to-br !from-sky-900/80 !to-night-950 !p-4"
        },
        [
          h("p", { key: "t", className: "text-xs font-bold uppercase tracking-wide text-sky-200" }, "Campus Mart"),
          h(
            "p",
            { key: "d", className: "mt-1 text-xs text-white/80" },
            "Browse sellers, track orders, and check out with MoMo or card — all in one place."
          )
        ]
      )
    ]
  );

  const profileChip =
    accessToken &&
    user &&
    h(
      "div",
      {
        key: "user-chip",
        className:
          "hidden min-w-0 max-w-[min(14rem,50vw)] items-center gap-2 rounded-2xl border border-white/10 bg-white/20 px-2.5 py-1.5 sm:flex sm:max-w-[18rem] sm:px-3 dark:bg-white/5",
        title: buyerNavbarHandle(user)
      },
      [
        h("div", { key: "av", className: "shrink-0" }, buyerUserAvatarNode(user, { sizeClass: "h-8 w-8" })),
        h(
          "span",
          {
            key: "nm",
            className: "truncate text-xs font-medium text-slate-800 dark:text-slate-100 sm:text-sm"
          },
          buyerNavbarHandle(user)
        )
      ]
    );

  const headerActions = [
    h(ThemeToggleButton, { key: "th", dark, onToggle: toggle }),
    profileChip,
    !accessToken &&
      h(
        Button,
        {
          key: "sell",
          variant: "ghost",
          className: "!hidden !min-h-[44px] !rounded-full !px-2 sm:!inline-flex",
          type: "button",
          onClick: () => nav("/login", { state: { from: "vendor" } }),
          title: "Vendor sign in"
        },
        [h(Store, { key: "si", className: "h-4 w-4" }), h("span", { key: "st", className: "hidden lg:inline" }, "Seller")]
      ),
    h(
      Button,
      {
        key: "auth",
        variant: "primary",
        className: "!min-h-[44px] !rounded-full !px-3 !text-xs sm:!px-4 sm:!text-sm",
        type: "button",
        onClick: () => (accessToken ? onLogout() : nav("/login"))
      },
      accessToken ? "Log out" : "Login"
    )
  ].filter(Boolean);

  return h("div", { className: "flex min-h-screen bg-slate-100 dark:bg-night-950 dark:bg-mesh-dark" }, [
    sidebarOpen &&
      h("button", {
        key: "overlay",
        type: "button",
        className: "fixed inset-0 z-30 bg-slate-950/50 backdrop-blur-sm lg:hidden",
        onClick: () => setSidebarOpen(false),
        "aria-label": "Close menu"
      }),
    h("div", { key: "sidebar-gutter", className: "w-0 shrink-0 lg:w-72", "aria-hidden": true }),
    sidebar,
    h("div", { key: "main-wrap", className: "flex min-h-screen min-w-0 flex-1 flex-col" }, [
      h(
        "header",
        {
          key: "hdr",
          className:
            "sticky top-0 z-40 border-b border-white/10 bg-white/30 shadow-sm backdrop-blur-xl dark:bg-night-900/40"
        },
        h("div", { className: "mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6" }, [
          h("div", { key: "row-1", className: "flex items-center gap-2 sm:gap-3" }, [
            h(
              "button",
              {
                key: "menu",
                type: "button",
                className: "tap-target shrink-0 rounded-2xl border border-white/15 p-2 lg:hidden",
                onClick: () => setSidebarOpen(true),
                "aria-label": "Open menu"
              },
              h(Menu, { className: "h-5 w-5" })
            ),
            h(Link, { key: "brand", to: "/", className: "flex shrink-0 items-center gap-2" }, [
              h(LogoMark, { key: "lm", className: "h-9 w-9" }),
              h("div", { key: "titles", className: "min-w-0 leading-tight" }, [
                h("span", { key: "brand", className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, "Campus Mart"),
                title
                  ? h(
                      "span",
                      {
                        key: "subtitle",
                        className:
                          "ml-2 inline-block max-w-[10rem] truncate align-middle rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300 sm:max-w-[14rem]"
                      },
                      title
                    )
                  : null
              ])
            ]),
            h("div", { key: "actions", className: "ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-2" }, headerActions)
          ]),
          !hideSearch &&
            h("div", { key: "row-search", className: "flex flex-1 items-center gap-2" }, [
              h("div", { key: "search-wrap", className: "relative flex flex-1 items-center" }, [
                h(Search, {
                  key: "ic-search",
                  className: "pointer-events-none absolute left-3 h-4 w-4 text-slate-400"
                }),
                h(TextInput, {
                  key: "input",
                  value: searchValue ?? "",
                  onChange: (e) => onSearchChange?.(e.target.value),
                  onKeyDown: (e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitSearch();
                    }
                  },
                  placeholder: "Search products, brands…",
                  className: "!rounded-full !pl-10 !pr-24"
                }),
                h(
                  Button,
                  {
                    key: "submit",
                    variant: "primary",
                    className: "!absolute right-1 top-1/2 !min-h-[36px] -translate-y-1/2 !rounded-full !px-4 !py-2 !text-sm",
                    type: "button",
                    onClick: submitSearch
                  },
                  "Search"
                )
              ])
            ])
        ])
      ),
      h("div", { key: "page-children", className: "flex-1" }, children)
    ])
  ]);
}

function CategoryRow({ active, onSelect }) {
  const icons = {
    all: Store,
    electronics: Cpu,
    books: BookOpen,
    clothing: Shirt,
    food: Utensils,
    footwears: Footprints,
    other: Package
  };
  return h(
    "div",
    { className: "no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" },
    CATEGORIES.map((c) => {
      const Icon = icons[c.id] || LayoutGrid;
      const isOn = active === c.id;
      return h(
        "button",
        {
          key: c.id,
          type: "button",
          onClick: () => onSelect(c.id),
          className: `flex min-w-[4.5rem] flex-col items-center gap-1 rounded-2xl border px-3 py-2 text-xs font-medium transition sm:min-w-0 sm:flex-row sm:gap-2 sm:px-4 sm:text-sm ${
            isOn
              ? "border-sky-500/50 bg-sky-500/15 text-slate-900 dark:border-sky-400/40 dark:text-white"
              : "border-transparent bg-white/30 text-slate-700 hover:bg-white/50 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
          }`
        },
        [
          h(
            "span",
            {
              key: "ic",
              className: `flex h-10 w-10 items-center justify-center rounded-full sm:h-9 sm:w-9 ${
                isOn ? "bg-sky-600 text-white" : "bg-slate-200/80 text-slate-700 dark:bg-night-800 dark:text-slate-200"
              }`
            },
            h(Icon, { className: "h-5 w-5" })
          ),
          h("span", { key: "lb" }, c.label)
        ]
      );
    })
  );
}

export function CartDrawer({ open, onClose }) {
  const { items, subtotal, setQty, remove, clear } = useCart();
  const { accessToken } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const checkout = async () => {
    setErr("");
    if (!accessToken) {
      onClose?.();
      nav("/login", { state: { from: "/checkout" } });
      return;
    }
    if (items.length === 0 || subtotal <= 0) return;
    onClose?.();
    nav("/checkout");
  };

  if (!open) return null;
  return h(
    "div",
    { className: "fixed inset-0 z-50 flex justify-end" },
    [
      h("button", {
        key: "overlay",
        type: "button",
        className: "absolute inset-0 bg-slate-950/60 backdrop-blur-sm",
        onClick: onClose,
        "aria-label": "Close cart overlay"
      }),
      h(
        GlassPanel,
        {
          key: "panel",
          className: "relative z-10 m-0 h-full w-full max-w-md rounded-none border-l border-white/10 sm:m-4 sm:h-[calc(100%-2rem)] sm:rounded-3xl",
          onClick: (e) => e.stopPropagation()
        },
        [
          h("div", { key: "head", className: "flex items-center justify-between border-b border-white/10 pb-4" }, [
            h("div", { key: "title-wrap", className: "flex items-center gap-2" }, [
              h(ShoppingCart, { key: "ic", className: "h-5 w-5 text-sky-400" }),
              h("h2", { key: "tx", className: "text-lg font-semibold text-slate-900 dark:text-white" }, "Your cart")
            ]),
            h(
              "button",
              {
                key: "close",
                type: "button",
                className: "tap-target rounded-2xl p-2 hover:bg-white/10",
                onClick: onClose
              },
              h(X, { className: "h-5 w-5" })
            )
          ]),
          h("div", { key: "items", className: "mt-4 flex max-h-[55vh] flex-col gap-3 overflow-y-auto pr-1" }, [
            items.length === 0 &&
              h("p", { key: "empty", className: "text-sm text-slate-500 dark:text-slate-400" }, "Your cart is empty."),
            items.map((p) =>
              h(GlassCard, { key: p.id, className: "!p-3" }, [
                h("div", { key: "row", className: "flex gap-3" }, [
                  h(RefImage, {
                    key: "img",
                    src: p.imageUrls?.[0],
                    n: refFromId(p.id),
                    alt: p.name,
                    className: "h-16 w-16 shrink-0 rounded-xl"
                  }),
                  h("div", { key: "meta", className: "min-w-0 flex-1" }, [
                    h("p", { key: "name", className: "truncate font-semibold text-slate-900 dark:text-white" }, p.name),
                    h("p", { key: "desc", className: "text-xs text-slate-500 dark:text-slate-400" }, p.blurb || p.description || ""),
                    h("p", { key: "price", className: "mt-1 text-sm font-bold text-sky-600 dark:text-sky-300" }, formatGhc(p.price)),
                    h("div", { key: "qty", className: "mt-2 flex items-center gap-2" }, [
                      h(
                        "button",
                        {
                          key: "dec",
                          type: "button",
                          className: "tap-target rounded-xl border border-white/15 p-2 hover:bg-white/10",
                          onClick: () => setQty(p.id, p.qty - 1)
                        },
                        h(Minus, { className: "h-4 w-4" })
                      ),
                      h("span", { key: "count", className: "w-6 text-center text-sm font-semibold" }, String(p.qty)),
                      h(
                        "button",
                        {
                          key: "inc",
                          type: "button",
                          className: "tap-target rounded-xl border border-white/15 p-2 hover:bg-white/10",
                          onClick: () => {
                            if (!accessToken) {
                              onClose?.();
                              nav("/login", { state: { from: loc.pathname + (loc.search || "") } });
                              return;
                            }
                            setQty(p.id, p.qty + 1);
                          }
                        },
                        h(Plus, { className: "h-4 w-4" })
                      ),
                      h(
                        "button",
                        {
                          key: "rm",
                          type: "button",
                          className: "ml-auto text-xs font-semibold text-rose-400 hover:underline",
                          onClick: () => remove(p.id)
                        },
                        "Remove"
                      )
                    ])
                  ])
                ])
              ])
            )
          ]),
          err
            ? h(InlineNotice, { key: "err", variant: "error", className: "mt-3", onDismiss: () => setErr("") }, err)
            : null,
          h("div", { key: "totals", className: "mt-6 space-y-2 border-t border-white/10 pt-4 text-sm" }, [
            h("div", { key: "subtotal", className: "flex justify-between text-slate-600 dark:text-slate-400" }, [
              h("span", { key: "l" }, "Subtotal"),
              h("span", { key: "v", className: "font-semibold text-slate-900 dark:text-white" }, formatGhc(subtotal))
            ]),
            h("div", { key: "delivery", className: "flex justify-between text-slate-600 dark:text-slate-400" }, [
              h("span", { key: "l" }, "Delivery"),
              h("span", { key: "v", className: "font-semibold text-emerald-400" }, "Free")
            ]),
            h("div", { key: "total", className: "flex justify-between text-lg font-bold text-slate-900 dark:text-white" }, [
              h("span", { key: "l" }, "Total"),
              h("span", { key: "v" }, formatGhc(subtotal))
            ]),
            h(
              Button,
              {
                key: "checkout",
                className: "mt-3 w-full !rounded-2xl",
                onClick: checkout,
                loading,
                disabled: items.length === 0
              },
              [h("span", { key: "tx" }, "Proceed to checkout "), h(ChevronRight, { key: "ic", className: "h-4 w-4" })]
            )
          ])
        ]
      )
    ]
  );
}

function formatCardNumberInput(raw) {
  const d = String(raw).replace(/\D/g, "").slice(0, 19);
  return d.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function formatExpiryInput(raw) {
  const d = String(raw).replace(/\D/g, "").slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}`;
}

function buildGhanaMomoPhone(localDigits) {
  const digits = String(localDigits).replace(/\D/g, "").replace(/^0+/, "");
  return digits.length >= 9 ? `+233${digits.slice(0, 9)}` : "";
}

function normalizeGhanaMomoLocal(raw) {
  return String(raw).replace(/\D/g, "").slice(0, 10);
}

function ghanaMomoLocalNine(raw) {
  const digits = normalizeGhanaMomoLocal(raw).replace(/^0+/, "");
  return digits.slice(0, 9);
}

/** Provider-aware prefix checks to avoid obvious wrong-network numbers. */
function validateMomoByProvider(provider, localRaw) {
  const local9 = ghanaMomoLocalNine(localRaw);
  if (local9.length !== 9) {
    return "Enter a valid Ghana mobile number (9 digits after +233).";
  }
  const prefix2 = local9.slice(0, 2);
  const allowedByProvider = {
    mtn: new Set(["24", "25", "53", "54", "55", "59"]),
    telecel: new Set(["20", "50"]),
    airteltigo: new Set(["26", "27", "56", "57"])
  };
  if (!provider || !allowedByProvider[provider]) return "";
  if (!allowedByProvider[provider].has(prefix2)) {
    const providerName =
      provider === "mtn" ? "MTN" : provider === "telecel" ? "Telecel" : "AirtelTigo";
    return `That number does not look like a ${providerName} MoMo line.`;
  }
  return "";
}

const segBtn =
  "relative z-10 flex-1 rounded-xl py-2.5 text-center text-xs font-semibold transition sm:text-sm";
const segBtnOn =
  "bg-white text-slate-900 shadow-sm dark:bg-night-700 dark:text-white dark:shadow-black/20";
const segBtnOff = "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200";

export function CheckoutPage() {
  const { accessToken } = useAuth();
  const { items, subtotal, clear } = useCart();
  const nav = useNavigate();
  const cartBySeller = useMemo(() => groupCartItemsBySeller(items), [items]);
  const [method, setMethod] = useState("bank");
  const [reference, setReference] = useState("");
  const [momoProvider, setMomoProvider] = useState(null);
  const [momoLocal, setMomoLocal] = useState("");
  const [momoAmount, setMomoAmount] = useState("");
  const [saveCard, setSaveCard] = useState(false);
  const [cardholderName, setCardholderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const momoPhoneError = useMemo(
    () => (method === "momo" ? validateMomoByProvider(momoProvider, momoLocal) : ""),
    [method, momoProvider, momoLocal]
  );

  useEffect(() => {
    setMomoAmount(subtotal > 0 ? subtotal.toFixed(2) : "");
  }, [subtotal]);

  const placeOrderAndPay = async () => {
    setErr("");
    if (!accessToken) {
      nav("/login");
      return;
    }
    if (!items.length) {
      setErr("Your cart is empty.");
      return;
    }
    if (method === "momo") {
      if (!momoProvider) {
        setErr("Choose your mobile money provider.");
        return;
      }
      if (momoPhoneError) {
        setErr(momoPhoneError);
        return;
      }
      const amt = parseFloat(momoAmount);
      if (!Number.isFinite(amt) || amt <= 0) {
        setErr("Enter a valid amount.");
        return;
      }
    } else {
      const digits = cardNumber.replace(/\D/g, "");
      if (digits.length < 13) {
        setErr("Enter a valid card number.");
        return;
      }
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(cardExpiry)) {
        setErr("Expiry must be MM/YY.");
        return;
      }
      if (!/^\d{3,4}$/.test(cardCvv)) {
        setErr("Enter a valid CVV.");
        return;
      }
      if (cardholderName.trim().length < 2) {
        setErr("Enter the name on the card.");
        return;
      }
    }

    setLoading(true);
    try {
      const checkoutBody = { items: items.map((p) => ({ productId: p.id, quantity: p.qty })) };
      const { order } = await apiFetch("/api/orders/checkout", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: checkoutBody
      });

      let payJson;
      if (method === "momo") {
        const amt = parseFloat(momoAmount);
        if (Math.abs(amt - order.total) > 0.02) {
          setErr("Amount must match the order total.");
          setLoading(false);
          return;
        }
        const providerLabel =
          momoProvider === "mtn" ? "MTN MoMo" : momoProvider === "telecel" ? "Telecel Cash" : "AirtelTigo Money";
        const refMerged = [providerLabel, reference.trim()].filter(Boolean).join(" · ");
        payJson = {
          method: "momo",
          momoPhone: buildGhanaMomoPhone(momoLocal),
          momoAmount: amt,
          ...(refMerged ? { reference: refMerged } : {})
        };
      } else {
        payJson = {
          method: "bank",
          cardholderName: cardholderName.trim(),
          cardNumber: cardNumber.replace(/\s/g, ""),
          cardExpiry,
          cvv: cardCvv.trim(),
          ...(reference.trim() ? { reference: reference.trim() } : {})
        };
      }

      await apiFetch(`/api/orders/${order.id}/pay-manual`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: payJson
      });
      clear();
      nav(`/payment/success?orderId=${order.id}`, { replace: true });
    } catch (ex) {
      const st = ex && typeof ex.status === "number" ? ex.status : 0;
      if (st === 403) {
        setErr(
          "You don’t have permission to check out with this login. Log out and sign in again, or use a buyer account."
        );
      } else {
        setErr(ex.message || "Could not complete payment.");
      }
    } finally {
      setLoading(false);
    }
  };

  const cardDigitsPreview = cardNumber.replace(/\D/g, "");
  const cardDisplay = cardDigitsPreview.length > 0 ? formatCardNumberInput(cardDigitsPreview) : "•••• •••• •••• ••••";
  const totalStr = formatGhc(subtotal);

  const modalShell = (inner) =>
    h("div", { className: "relative min-h-screen bg-slate-100 dark:bg-night-950" }, [
      h("div", {
        key: "mesh",
        className: "pointer-events-none fixed inset-0 bg-mesh-dark opacity-70 dark:opacity-100"
      }),
      h(
        "div",
        {
          key: "wrap",
          className: "relative mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-8 sm:px-6"
        },
        [
          h(
            "div",
            {
              key: "modal",
              className:
                "rounded-3xl border border-white/25 bg-white/95 p-5 shadow-glass backdrop-blur-xl dark:border-white/10 dark:bg-night-900/90 dark:shadow-black/40 sm:p-7"
            },
            inner
          )
        ]
      )
    ]);

  if (!items.length) {
    return modalShell([
      h("div", { key: "hdr-e", className: "flex items-start justify-between gap-3" }, [
        h("div", { key: "t" }, [
          h(
            "h1",
            { key: "h1", className: "font-display text-xl font-bold text-slate-900 dark:text-white sm:text-2xl" },
            "Complete Your Payment"
          ),
          h("p", { key: "tot", className: "mt-1 text-sm text-slate-600 dark:text-slate-400" }, `Total: ${totalStr}`)
        ]),
        h(
          "button",
          {
            key: "x",
            type: "button",
            onClick: () => nav("/"),
            className:
              "rounded-full p-2 text-slate-500 transition hover:bg-slate-200/80 hover:text-slate-800 dark:hover:bg-white/10 dark:hover:text-white",
            "aria-label": "Close"
          },
          h(X, { className: "h-5 w-5" })
        )
      ]),
      h("p", { key: "empty", className: "mt-6 text-center text-slate-600 dark:text-slate-300" }, "Your cart is empty."),
      h(Button, { key: "shop", className: "mt-6 w-full", onClick: () => nav("/") }, "Back to shop")
    ]);
  }

  return modalShell([
    h("div", { key: "hdr", className: "flex items-start justify-between gap-3" }, [
      h("div", { key: "titles" }, [
        h(
          "h1",
          { key: "h1", className: "font-display text-xl font-bold text-slate-900 dark:text-white sm:text-2xl" },
          "Complete Your Payment"
        ),
        h("p", { key: "tot", className: "mt-1 text-sm font-medium text-slate-600 dark:text-slate-400" }, [
          "Total: ",
          h("span", { key: "amt", className: "text-slate-900 dark:text-white" }, totalStr)
        ]),
        h(
          "p",
          { key: "fee-note", className: "mt-2 max-w-sm text-xs text-slate-500 dark:text-slate-400" },
          "You pay the cart total below. Vendor contact details follow where applicable."
        )
      ]),
      h(
        "button",
        {
          key: "close",
          type: "button",
          onClick: () => nav("/"),
          className:
            "rounded-full p-2 text-slate-500 transition hover:bg-slate-200/80 hover:text-slate-800 dark:hover:bg-white/10 dark:hover:text-white",
          "aria-label": "Close"
        },
        h(X, { className: "h-5 w-5" })
      )
    ]),

    items.length > 0 &&
      h(
        "div",
        {
          key: "pay-summary",
          className: "mt-5 space-y-3 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] p-4 text-sm text-slate-700 dark:text-slate-200"
        },
        [
          h("p", { key: "t", className: "text-xs font-bold uppercase tracking-wide text-emerald-900 dark:text-emerald-100" }, "Order total"),
          h("div", { key: "row1", className: "flex justify-between gap-2" }, [
            h("span", null, "You pay"),
            h("span", { className: "font-semibold text-slate-900 dark:text-white" }, formatGhc(subtotal))
          ]),
          h("div", { key: "vendors", className: "mt-3 space-y-3 border-t border-white/15 pt-3" }, [
            h("p", { className: "text-xs font-semibold text-slate-600 dark:text-slate-300" }, "Pay vendor"),
            ...cartBySeller.map((g, idx) => {
              const vendorTotal = sellerGroupGross(g.items);
              return h(
                "div",
                {
                  key: g.sellerId || String(idx),
                  className: "rounded-xl border border-white/10 bg-white/40 p-3 text-xs dark:bg-night-900/40"
                },
                [
                  h("p", { key: "h", className: "font-semibold text-slate-900 dark:text-white" }, [
                    g.sellerPayment?.displayName || "Vendor",
                    " · ",
                    h("span", { className: "text-emerald-700 dark:text-emerald-300" }, `items total ~${formatGhc(vendorTotal)}`)
                  ]),
                  g.sellerPayment?.phone &&
                    h("p", { key: "ph", className: "mt-1 font-mono text-slate-800 dark:text-slate-100" }, String(g.sellerPayment.phone)),
                  (g.sellerPayment?.bankName || g.sellerPayment?.bankAccountNumber) &&
                    h("p", { key: "bk", className: "mt-1 text-slate-700 dark:text-slate-200" }, [
                      [g.sellerPayment.bankName, g.sellerPayment.bankAccountName].filter(Boolean).join(" · "),
                      g.sellerPayment.bankAccountNumber ? ` · ${g.sellerPayment.bankAccountNumber}` : ""
                    ])
                ].filter(Boolean)
              );
            })
          ])
        ]
      ),

    h(
      "div",
      {
        key: "segment",
        className: "mt-6 flex rounded-2xl bg-slate-200/90 p-1 dark:bg-night-800/90"
      },
      [
        h(
          "button",
          {
            key: "card",
            type: "button",
            role: "tab",
            "aria-selected": method === "bank",
            className: `${segBtn} ${method === "bank" ? segBtnOn : segBtnOff}`,
            onClick: () => setMethod("bank")
          },
          "Credit / Debit Card"
        ),
        h(
          "button",
          {
            key: "momo",
            type: "button",
            role: "tab",
            "aria-selected": method === "momo",
            className: `${segBtn} ${method === "momo" ? segBtnOn : segBtnOff}`,
            onClick: () => setMethod("momo")
          },
          "Mobile Money"
        )
      ]
    ),

    h("div", { key: "body", className: "mt-6 min-h-[280px]" }, [
      method === "bank"
        ? h("div", { key: "bank-block", className: "space-y-4" }, [
            h("div", { key: "bank-h", className: "flex flex-wrap items-center justify-between gap-2" }, [
              h(
                "h2",
                { key: "h2", className: "text-sm font-semibold text-slate-800 dark:text-slate-100" },
                "Pay with Bank Card"
              ),
              h("div", { key: "brands", className: "flex items-center gap-1.5" }, [
                h(
                  "span",
                  {
                    key: "visa",
                    className: "rounded-lg bg-[#1A1F71] px-2 py-1 text-[10px] font-bold tracking-wide text-white"
                  },
                  "VISA"
                ),
                h(
                  "span",
                  {
                    key: "mc",
                    className:
                      "rounded-lg bg-gradient-to-r from-[#EB001B] to-[#F79E1B] px-2 py-1 text-[10px] font-bold text-white"
                  },
                  "MC"
                )
              ])
            ]),
            h(
              "div",
              {
                key: "card-visual",
                className:
                  "relative overflow-hidden rounded-2xl bg-gradient-to-br from-night-800 via-sky-950 to-blue-950 p-5 text-white shadow-lg ring-1 ring-sky-500/20"
              },
              [
                h("div", {
                  key: "glow",
                  className: "pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-ice-500/25 blur-2xl"
                }),
                h("div", {
                  key: "chip",
                  className: "relative h-9 w-12 rounded-md bg-gradient-to-br from-ice-400/90 to-amber-500/80 shadow-inner"
                }),
                h("p", { key: "num", className: "relative mt-4 font-mono text-lg tracking-widest sm:text-xl" }, cardDisplay),
                h(
                  "div",
                  {
                    key: "row",
                    className: "relative mt-4 flex justify-between gap-4 text-xs uppercase tracking-wide text-white/75"
                  },
                  [
                    h("div", { key: "name" }, [
                      h("div", { key: "l", className: "text-[10px]" }, "Cardholder"),
                      h(
                        "div",
                        { key: "v", className: "mt-0.5 text-sm font-medium text-white" },
                        cardholderName.trim() || "YOUR NAME"
                      )
                    ]),
                    h("div", { key: "exp", className: "text-right" }, [
                      h("div", { key: "l", className: "text-[10px]" }, "Expires"),
                      h("div", { key: "v", className: "mt-0.5 font-mono text-sm text-white" }, cardExpiry || "MM/YY")
                    ])
                  ]
                )
              ]
            ),
            h(Field, { key: "cn", label: "Card number" }, h(TextInput, {
              value: cardNumber,
              onChange: (e) => setCardNumber(formatCardNumberInput(e.target.value)),
              placeholder: "1234 5678 9012 3456",
              inputMode: "numeric",
              autoComplete: "cc-number"
            })),
            h(Field, { key: "ch", label: "Name on card" }, h(TextInput, {
              value: cardholderName,
              onChange: (e) => setCardholderName(e.target.value.toUpperCase()),
              placeholder: "JANE DOE",
              autoComplete: "cc-name"
            })),
            h("div", { key: "exp-cvv", className: "grid grid-cols-2 gap-3" }, [
              h(Field, { key: "exp", label: "Expiry date" }, h(TextInput, {
                value: cardExpiry,
                onChange: (e) => setCardExpiry(formatExpiryInput(e.target.value)),
                placeholder: "MM / YY",
                inputMode: "numeric",
                autoComplete: "cc-exp"
              })),
              h("div", { key: "cvv-wrap", className: "space-y-1.5" }, [
                h("div", { key: "cvv-lbl", className: "flex items-center gap-1" }, [
                  h(
                    "span",
                    {
                      key: "lb",
                      className: "text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400"
                    },
                    "CVV"
                  ),
                  h(HelpCircle, {
                    key: "ic",
                    className: "h-3.5 w-3.5 text-slate-400",
                    "aria-label": "Card security code",
                    title: "3–4 digits on the back of your card"
                  })
                ]),
                h(TextInput, {
                  key: "cvv-in",
                  value: cardCvv,
                  onChange: (e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4)),
                  placeholder: "•••",
                  inputMode: "numeric",
                  autoComplete: "cc-csc",
                  type: "password"
                })
              ])
            ]),
            h(
              "label",
              {
                key: "save",
                className: "flex cursor-pointer items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300"
              },
              [
                h("input", {
                  key: "cb",
                  type: "checkbox",
                  checked: saveCard,
                  onChange: (e) => setSaveCard(e.target.checked),
                  className:
                    "h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 dark:border-white/20 dark:bg-night-900"
                }),
                "Save card for future payments"
              ]
            ),
            h("p", { key: "hint-card", className: "text-xs text-slate-500 dark:text-slate-400" }, "Full card number and CVV are not stored on our servers.")
          ])
        : h("div", { key: "momo-block", className: "space-y-4" }, [
            h(
              "h2",
              { key: "momo-h2", className: "text-sm font-semibold text-slate-800 dark:text-slate-100" },
              "Pay with Mobile Money"
            ),
            h("div", { key: "providers", className: "grid grid-cols-1 gap-2 sm:grid-cols-3" }, [
              h(
                "button",
                {
                  key: "mtn",
                  type: "button",
                  onClick: () => setMomoProvider("mtn"),
                  className: `rounded-xl px-2 py-3 text-center text-[11px] font-bold leading-snug text-slate-900 shadow-sm transition sm:text-xs ${
                    momoProvider === "mtn" ? "ring-2 ring-sky-500 ring-offset-2 dark:ring-offset-night-900" : ""
                  } bg-[#FFCB05] hover:brightness-105`
                },
                "MTN Mobile Money"
              ),
              h(
                "button",
                {
                  key: "telecel",
                  type: "button",
                  onClick: () => setMomoProvider("telecel"),
                  className: `rounded-xl px-2 py-3 text-center text-[11px] font-bold leading-snug text-white shadow-sm transition sm:text-xs ${
                    momoProvider === "telecel" ? "ring-2 ring-sky-500 ring-offset-2 dark:ring-offset-night-900" : ""
                  } bg-[#E60000] hover:brightness-110`
                },
                "Telecel Cash"
              ),
              h(
                "button",
                {
                  key: "tigo",
                  type: "button",
                  onClick: () => setMomoProvider("airteltigo"),
                  className: `rounded-xl px-2 py-3 text-center text-[11px] font-bold leading-snug text-white shadow-sm transition sm:text-xs ${
                    momoProvider === "airteltigo" ? "ring-2 ring-sky-500 ring-offset-2 dark:ring-offset-night-900" : ""
                  } bg-[#0066B3] hover:brightness-110`
                },
                "AirtelTigo Money"
              )
            ]),
            h("div", { key: "phone-block", className: "space-y-1.5" }, [
              h(
                "span",
                {
                  key: "plab",
                  className: "text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400"
                },
                "Mobile number"
              ),
              h(
                "div",
                {
                  key: "prow",
                  className:
                    "flex min-h-[48px] overflow-hidden rounded-2xl border border-slate-300/70 bg-white/70 shadow-inner dark:border-white/10 dark:bg-night-900/60"
                },
                [
                  h(
                    "span",
                    {
                      key: "pre",
                      className:
                        "flex shrink-0 items-center gap-2 border-r border-slate-300/70 px-3 text-sm text-slate-700 dark:border-white/10 dark:text-slate-200"
                    },
                    [
                      h("span", { key: "flag", className: "text-lg leading-none", "aria-hidden": true }, "🇬🇭"),
                      h("span", { key: "cc", className: "font-mono text-sm font-semibold" }, "+233")
                    ]
                  ),
                  h("input", {
                    key: "in",
                    className:
                      "min-w-0 flex-1 border-0 bg-transparent px-3 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100",
                    value: momoLocal,
                    onChange: (e) => setMomoLocal(normalizeGhanaMomoLocal(e.target.value)),
                    placeholder: "Enter your mobile number",
                    inputMode: "numeric",
                    pattern: "[0-9]*",
                    maxLength: 10,
                    autoComplete: "tel-national"
                  })
                ]
              ),
              h(
                "p",
                { key: "phint", className: "text-xs text-slate-500 dark:text-slate-400" },
                "Enter 9 digits (leading 0 is optional). Amount sent must match your total."
              )
            ]),
            method === "momo" && momoPhoneError
              ? h("p", { key: "momo-phone-err", className: "text-xs font-medium text-rose-600 dark:text-rose-300" }, momoPhoneError)
              : null,
            h(Field, { key: "momo-amt", label: "Amount to send (Ghc)" }, h(TextInput, {
              value: momoAmount,
              onChange: (e) => setMomoAmount(e.target.value),
              placeholder: subtotal.toFixed(2),
              inputMode: "decimal"
            }))
          ])
    ]),

    h(Field, { key: "ref", label: "Reference / note (optional)" }, h(TextInput, {
      value: reference,
      onChange: (e) => setReference(e.target.value),
      placeholder: "Transaction ID, auth code, etc."
    })),

    err
      ? h(InlineNotice, { key: "err", variant: "error", className: "mt-3", onDismiss: () => setErr("") }, err)
      : null,

    h(Button, {
      key: "pay",
      className: "mt-5 w-full !rounded-2xl !py-3.5 text-base font-semibold",
      loading,
      disabled: method === "momo" && (!!momoPhoneError || !momoProvider),
      onClick: placeOrderAndPay
    }, `Pay ${totalStr}`),

    h(
      "div",
      {
        key: "trust",
        className: "mt-4 flex flex-col items-center gap-2 text-xs text-slate-500 dark:text-slate-400"
      },
      [
        h("div", { key: "lock", className: "flex items-center gap-1.5" }, [
          h(Lock, { key: "ic", className: "h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" }),
          h("span", { key: "t" }, "100% Secure Payment")
        ]),
        h("div", { key: "mini", className: "flex flex-wrap justify-center gap-2 opacity-80" }, [
          h("span", { key: "v", className: "rounded bg-[#1A1F71] px-1.5 py-0.5 text-[9px] font-bold text-white" }, "VISA"),
          h(
            "span",
            { key: "m", className: "rounded bg-gradient-to-r from-[#EB001B] to-[#F79E1B] px-1.5 py-0.5 text-[9px] font-bold text-white" },
            "MC"
          )
        ])
      ]
    ),

    h(
      "div",
      {
        key: "footer",
        className: "mt-6 flex items-center justify-between border-t border-slate-200/80 pt-4 dark:border-white/10"
      },
      [
        h(
          "button",
          {
            key: "back",
            type: "button",
            onClick: () => nav(-1),
            className:
              "inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-sky-600 dark:text-slate-400 dark:hover:text-ice-400"
          },
          [h(ArrowLeft, { key: "a", className: "h-4 w-4" }), h("span", { key: "b" }, "Back")]
        ),
        h(
          "div",
          {
            key: "foot-brands",
            className: "flex max-w-[52%] flex-wrap justify-end gap-x-2 gap-y-1 text-[9px] font-bold uppercase tracking-tight text-slate-400 dark:text-slate-500"
          },
          [
            h("span", { key: "mtn" }, "MTN"),
            h("span", { key: "tel" }, "Telecel"),
            h("span", { key: "at" }, "AirtelTigo"),
            h("span", { key: "cd" }, "Cards")
          ]
        )
      ]
    )
  ]);
}

export function ShopPage() {
  const [cat, setCat] = useState("all");
  const [fil, setFil] = useState("all");
  const [cartOpen, setCartOpen] = useState(false);
  const [queryInput, setQueryInput] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [products, setProducts] = useState([]);
  const [listErr, setListErr] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const { add } = useCart();
  const { accessToken } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();

  const tryAddToCart = (p) => {
    if ((p.stock ?? 0) <= 0) return;
    if (!accessToken) {
      nav("/login", { state: { from: loc.pathname + (loc.search || "") } });
      return;
    }
    add(p, 1);
  };

  useEffect(() => {
    const t = setTimeout(() => setSearchQ(queryInput.trim()), 350);
    return () => clearTimeout(t);
  }, [queryInput]);

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    const params = new URLSearchParams();
    if (cat !== "all") params.set("category", cat);
    if (searchQ) params.set("q", searchQ);
    const qs = params.toString();
    apiFetch(`/api/products${qs ? `?${qs}` : ""}`)
      .then((d) => {
        if (!cancelled) setProducts(d.products || []);
      })
      .catch((ex) => {
        if (!cancelled) {
          setListErr(ex.message || "Could not load products");
          setProducts([]);
        }
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cat, searchQ]);

  const filtered = useMemo(() => {
    return products.filter((p) => productMatchesFilter(p, fil));
  }, [products, fil]);

  return h(f, null, [
    h(
      BuyerLayout,
      {
        key: "layout",
        onOpenCart: () => setCartOpen(true),
        searchValue: queryInput,
        onSearchChange: setQueryInput,
        onSearchSubmit: () => setSearchQ(queryInput.trim())
      },
      h("div", { key: "main", className: "relative mx-auto max-w-7xl px-4 py-6 pb-24 sm:px-6" }, [
      h(RefImage, {
        key: "bg-blur",
        n: 4,
        alt: "",
        className: "pointer-events-none absolute left-1/2 top-0 -z-10 h-40 w-full max-w-2xl -translate-x-1/2 rounded-3xl object-cover opacity-20 blur-2xl dark:opacity-[0.12]"
      }),
      h("section", { key: "cats", className: "mb-4" }, h(CategoryRow, { active: cat, onSelect: setCat })),
      h(
        GlassCard,
        {
          key: "hero-mini",
          className:
            "relative mb-5 overflow-hidden !rounded-2xl !border-sky-400/40 !bg-gradient-to-br !from-sky-500/[0.12] !via-white/40 !to-indigo-500/[0.08] !p-3 !shadow-lg !shadow-sky-500/20 sm:!p-4 dark:!border-sky-500/30 dark:!from-sky-500/[0.08] dark:!via-night-900/80 dark:!to-indigo-950/40 dark:!shadow-sky-950/40"
        },
        [
          h("div", {
            key: "hero-blob-a",
            className: "pointer-events-none absolute -right-8 -top-12 h-36 w-36 rounded-full bg-sky-400/30 blur-2xl dark:bg-sky-500/25"
          }),
          h("div", {
            key: "hero-blob-b",
            className: "pointer-events-none absolute -bottom-14 -left-10 h-40 w-40 rounded-full bg-indigo-500/25 blur-3xl dark:bg-indigo-500/20"
          }),
          h("div", {
            key: "hero-shine",
            className:
              "pointer-events-none absolute inset-0 bg-gradient-to-br from-white/50 via-transparent to-transparent opacity-60 dark:from-white/[0.04] dark:opacity-100"
          }),
          h(
            "div",
            { key: "hero-row", className: "relative flex items-start gap-3 sm:gap-4" },
            [
              h(
                "div",
                {
                  key: "hero-icon",
                  className:
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-600/35 ring-2 ring-white/50 dark:ring-sky-400/20"
                },
                h(Store, { className: "h-5 w-5", "aria-hidden": true })
              ),
              h("div", { key: "hero-copy", className: "min-w-0 flex-1 space-y-1" }, [
                h(
                  "p",
                  {
                    key: "hero-eyebrow",
                    className: "text-[10px] font-bold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-400"
                  },
                  "Campus Mart"
                ),
                h("h1", { key: "hero-h1", className: "font-display text-base font-semibold leading-snug sm:text-lg" }, [
                  h(
                    "span",
                    {
                      key: "hero-h1-grad",
                      className:
                        "bg-gradient-to-r from-slate-900 via-sky-800 to-indigo-800 bg-clip-text text-transparent dark:from-white dark:via-sky-100 dark:to-indigo-100"
                    },
                    "Everything you need for campus life"
                  )
                ]),
                h(
                  "p",
                  {
                    key: "hero-sub",
                    className: "text-xs leading-relaxed text-slate-600 dark:text-slate-400 sm:text-sm"
                  },
                  "Electronics, books, clothing, food, and more from trusted campus vendors."
                )
              ])
            ]
          )
        ]
      ),
      h("div", { key: "filters-row", className: "mb-4 flex flex-wrap items-center gap-2" }, [
        h("span", { key: "flabel", className: "text-sm font-semibold text-slate-600 dark:text-slate-300" }, "Filter:"),
        FILTERS.map((fitem) =>
          h(
            "button",
            {
              key: fitem.id,
              type: "button",
              onClick: () => setFil(fitem.id),
              className: `tap-target rounded-full px-4 py-2 text-sm font-medium transition ${
                fil === fitem.id
                  ? "bg-sky-600 text-white shadow-lg shadow-sky-900/30"
                  : "glass text-slate-700 hover:bg-white/50 dark:text-slate-200 dark:hover:bg-white/10"
              }`
            },
            fitem.label
          )
        )
      ]),
      listErr
        ? h(InlineNotice, { key: "list-err", variant: "error", className: "mb-4", onDismiss: () => setListErr("") }, listErr)
        : null,
      h("h2", { key: "feat-h2", className: "mb-4 font-display text-xl font-bold text-slate-900 dark:text-white sm:text-2xl" }, "Featured products"),
      listLoading &&
        h("p", { key: "list-load", className: "mb-4 text-sm text-slate-500 dark:text-slate-400" }, "Loading products…"),
      h(
        "div",
        { key: "product-grid", className: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" },
        filtered.map((p) => {
          const badge = productBadge(p);
          const detailTo = `/products/${p.id}`;
          return h(GlassCard, { key: p.id, className: "group flex flex-col !p-4" }, [
            h("div", { key: "img", className: "relative" }, [
              badge
                ? h(
                    "span",
                    {
                      key: "bdg",
                      className:
                        "pointer-events-none absolute left-2 top-2 z-10 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-900"
                    },
                    badge
                  )
                : null,
              h(
                Link,
                { key: "pic-l", to: detailTo, className: "block overflow-hidden rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500" },
                h(RefImage, {
                  key: "pic",
                  src: p.imageUrls?.[0],
                  n: refFromId(p.id),
                  alt: p.name,
                  className: "h-40 w-full object-cover transition group-hover:scale-[1.02] sm:h-44"
                })
              )
            ].filter(Boolean)),
            h("div", { key: "title-row", className: "mt-3 flex items-start justify-between gap-2" }, [
              h(
                Link,
                {
                  key: "titles",
                  to: detailTo,
                  className: "min-w-0 flex-1 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                },
                h("div", { className: "min-w-0" }, [
                  h("h3", { className: "truncate font-semibold text-slate-900 underline-offset-2 hover:underline dark:text-white" }, p.name),
                  h(
                    "p",
                    { className: "text-xs text-slate-500 dark:text-slate-400" },
                    CATEGORY_LABELS[p.category] || p.category
                  )
                ])
              ),
              h(
                "button",
                {
                  key: "wish",
                  type: "button",
                  className: "tap-target shrink-0 rounded-xl p-2 text-slate-400 hover:bg-white/10 hover:text-rose-400",
                  "aria-label": "Wishlist"
                },
                h(Heart, { className: "h-5 w-5" })
              )
            ]),
            h(
              Link,
              {
                key: "price-l",
                to: detailTo,
                className: "mt-2 flex items-center justify-between rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              },
              [
                h("span", { key: "pr", className: "text-lg font-bold text-sky-600 dark:text-sky-300" }, formatGhc(p.price)),
                h("span", { key: "st", className: "text-xs text-slate-500 dark:text-slate-400" }, `${p.stock ?? 0} in stock`)
              ]
            ),
            formatSellerPaymentSnippet(p.sellerPayment) &&
              h(
                Link,
                {
                  key: "pay-snippet",
                  to: detailTo,
                  className: "mt-2 block line-clamp-2 rounded text-left text-[11px] leading-snug text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-400 dark:hover:text-slate-200"
                },
                formatSellerPaymentSnippet(p.sellerPayment)
              ),
            h(
              Button,
              {
                key: "add",
                variant: "ghost",
                className: "mt-3 w-full !justify-center !rounded-2xl border-sky-500/30",
                type: "button",
                disabled: (p.stock ?? 0) <= 0,
                onClick: () => tryAddToCart(p)
              },
              [
                h(ShoppingCart, { key: "ic", className: "h-4 w-4" }),
                h(
                  "span",
                  { key: "tx" },
                  (p.stock ?? 0) <= 0 ? "Out of stock" : accessToken ? "Add to cart" : "Sign in to add"
                )
              ]
            )
          ]);
        })
      )
    ])
  ),
    h(CartDrawer, { key: "cart", open: cartOpen, onClose: () => setCartOpen(false) }),
    h(
      "button",
      {
        key: "fab-cart",
        type: "button",
        className:
          "fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-xl shadow-sky-900/40 sm:hidden",
        onClick: () => setCartOpen(true)
      },
      [h(ShoppingCart, { key: "i", className: "h-5 w-5" }), h("span", { key: "t" }, "Cart")]
    )
  ]);
}

export function ProfilePage() {
  const [cartOpen, setCartOpen] = useState(false);
  const nav = useNavigate();
  const { confirm, alert } = useNotice();
  const { user, accessToken, setUser, logout } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const [saveOk, setSaveOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const photoFileRef = useRef(null);

  useEffect(() => {
    if (!accessToken) {
      setDisplayName("");
      setEmail("");
      return;
    }
    let cancelled = false;
    apiFetch("/api/auth/me", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((meData) => {
        if (cancelled) return;
        if (meData?.user) {
          setDisplayName(meData.user.displayName || "");
          setEmail(meData.user.email || "");
          setUser(meData.user);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const onPickProfilePhoto = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !accessToken) return;
    if (!/^image\/(jpeg|png|gif|webp)$/i.test(f.type)) {
      setSaveErr("Please choose a JPEG, PNG, WebP, or GIF image (max 5 MB).");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setSaveErr("Image must be 5 MB or smaller.");
      return;
    }
    setSaveErr("");
    setSaveOk("");
    setPhotoLoading(true);
    try {
      const data = await apiUploadProfileImage(f, accessToken);
      if (data.user) setUser(data.user);
      setSaveOk("Profile photo updated.");
    } catch (ex) {
      setSaveErr(ex.message || "Upload failed");
    } finally {
      setPhotoLoading(false);
    }
  };

  const clearProfilePhoto = async () => {
    if (!accessToken) return;
    setSaveErr("");
    setSaveOk("");
    setPhotoLoading(true);
    try {
      const data = await apiFetch("/api/auth/profile", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: { clearProfileImage: true }
      });
      if (data.user) setUser(data.user);
      setSaveOk("Profile photo removed.");
    } catch (ex) {
      setSaveErr(ex.message || "Could not remove photo");
    } finally {
      setPhotoLoading(false);
    }
  };

  const saveProfile = async () => {
    setSaveErr("");
    setSaveOk("");
    if (!accessToken) return;
    setSaving(true);
    try {
      const data = await apiFetch("/api/auth/profile", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: { displayName: displayName.trim() }
      });
      if (data.user) setUser(data.user);
      setSaveOk("Profile updated.");
    } catch (ex) {
      setSaveErr(ex.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const removeAccount = async () => {
    if (!accessToken) return;
    const ok = await confirm("This deletes your account permanently. You will lose access to this profile.", {
      title: "Delete account?",
      confirmLabel: "Yes, delete",
      cancelLabel: "Keep account"
    });
    if (!ok) return;
    setSaveErr("");
    setSaveOk("");
    setDeleting(true);
    try {
      await deleteAuthenticatedAccount(accessToken, {
        password: deletePassword,
        confirm: deleteConfirm.trim()
      });
      await logout();
      await alert("Your account was deleted.", { variant: "success", title: "Done" });
      nav("/register", { replace: true });
    } catch (ex) {
      setSaveErr(ex.message || "Could not delete account");
    } finally {
      setDeleting(false);
    }
  };

  return h(f, null, [
    h(
      BuyerLayout,
      { key: "layout", onOpenCart: () => setCartOpen(true), hideSearch: true },
      h("div", { key: "main", className: "mx-auto max-w-3xl px-4 py-10 sm:px-6" }, [
      h("div", { key: "hero", className: "mb-8 flex flex-col items-center text-center" }, [
        h("div", { key: "avatar-wrap", className: "flex flex-col items-center" }, [
          h(
            "div",
            { key: "av", className: "ring-4 ring-sky-500/30 ring-offset-2 ring-offset-slate-100 dark:ring-offset-night-950 rounded-full" },
            user?.profileImageUrl && String(user.profileImageUrl).trim()
              ? h("img", {
                  key: "img",
                  src: String(user.profileImageUrl).trim(),
                  alt: "",
                  className: "h-24 w-24 rounded-full object-cover"
                })
              : h(RefImage, { key: "def", n: 12, alt: "Profile", className: "h-24 w-24 rounded-full object-cover" })
          ),
          accessToken &&
            h("div", { key: "photo-actions", className: "mt-4 flex flex-wrap items-center justify-center gap-2" }, [
              h("input", {
                key: "file",
                ref: photoFileRef,
                type: "file",
                accept: "image/jpeg,image/png,image/webp,image/gif",
                className: "sr-only",
                onChange: onPickProfilePhoto
              }),
              h(
                Button,
                {
                  key: "upl",
                  variant: "ghost",
                  className: "!min-h-[40px] gap-1.5",
                  type: "button",
                  disabled: photoLoading,
                  loading: photoLoading,
                  onClick: () => photoFileRef.current?.click()
                },
                [h(Camera, { key: "i", className: "h-4 w-4" }), h("span", { key: "t" }, "Upload photo")]
              ),
              (user?.profileImageUrl && String(user.profileImageUrl).trim() &&
                h(Button, {
                  key: "rm",
                  variant: "subtle",
                  type: "button",
                  disabled: photoLoading,
                  onClick: clearProfilePhoto
                }, "Remove photo")) ||
                null
            ])
        ]),
        h(
          "h1",
          { key: "title", className: "mt-4 font-display text-2xl font-bold text-slate-900 dark:text-white" },
          displayName || user?.displayName || user?.email || "Your profile"
        ),
        h("p", { key: "sub", className: "text-sm text-slate-500 dark:text-slate-400" }, user?.email || "Sign in to sync your account")
      ]),
      h(GlassPanel, { key: "acct", className: "mb-6" }, [
        h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, "Account details"),
        h("div", { className: "mt-4 space-y-4" }, [
          h(Field, { key: "f-name", label: "Display name" }, h(TextInput, { value: displayName, onChange: (e) => setDisplayName(e.target.value), placeholder: "Your name" })),
          h(Field, { key: "f-email", label: "Email" }, h(TextInput, { type: "email", value: email, disabled: true })),
          saveErr
            ? h(InlineNotice, { key: "save-err", variant: "error", onDismiss: () => setSaveErr("") }, saveErr)
            : null,
          saveOk
            ? h(InlineNotice, { key: "save-ok", variant: "success", onDismiss: () => setSaveOk("") }, saveOk)
            : null,
          h(
            Button,
            {
              key: "save-btn",
              variant: "primary",
              className: "w-full sm:w-auto",
              type: "button",
              onClick: saveProfile,
              loading: saving,
              disabled: !accessToken
            },
            "Save changes"
          ),
          !accessToken &&
            h("p", { key: "guest-note", className: "text-sm text-amber-400" }, "You are browsing as a guest. Log in to persist profile changes.")
        ])
      ]),
      h(GlassPanel, { key: "delete", className: "!border-rose-500/30 !bg-rose-500/[0.05]" }, [
        h("h2", { className: "text-lg font-semibold text-rose-700 dark:text-rose-300" }, "Delete account"),
        h(
          "p",
          { className: "mt-2 text-sm text-slate-600 dark:text-slate-300" },
          "For safety, enter your password and type DELETE. If you still have active orders, deletion will be blocked."
        ),
        h("div", { className: "mt-4 space-y-3" }, [
          h(Field, { key: "del-pass", label: "Current password" }, h(TextInput, {
            type: "password",
            value: deletePassword,
            onChange: (e) => setDeletePassword(e.target.value),
            placeholder: "Your password"
          })),
          h(Field, { key: "del-confirm", label: 'Type DELETE to confirm' }, h(TextInput, {
            value: deleteConfirm,
            onChange: (e) => setDeleteConfirm(e.target.value),
            placeholder: "DELETE"
          })),
          h(Button, {
            key: "del-btn",
            variant: "ghost",
            className: "!border-rose-500/30 !text-rose-700 dark:!text-rose-300",
            type: "button",
            onClick: removeAccount,
            loading: deleting,
            disabled: !accessToken || !deletePassword.trim() || deleteConfirm.trim().toUpperCase() !== "DELETE"
          }, [
            h(Trash2, { key: "ic", className: "h-4 w-4" }),
            h("span", { key: "tx" }, "Delete my account")
          ])
        ])
      ])
    ])
  ),
    h(CartDrawer, { key: "cart", open: cartOpen, onClose: () => setCartOpen(false) })
  ]);
}

function formatBuyerOrderStatus(s) {
  return String(s || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buyerOrderStatusTone(status) {
  if (status === "delivered") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (status === "sent_for_delivery") return "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300";
  if (status === "processing") return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
  if (status === "paid") return "bg-teal-500/15 text-teal-700 dark:text-teal-300";
  if (status === "awaiting_vendor_payment") return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
  if (status === "pending_payment") return "bg-slate-500/15 text-slate-700 dark:text-slate-300";
  return "bg-rose-500/15 text-rose-700 dark:text-rose-300";
}

function paymentMethodLabel(method) {
  if (method === "momo") return "Mobile money";
  if (method === "bank") return "Bank card";
  if (method === "stripe") return "Stripe";
  return "—";
}

function BuyerReceiptModal({ order, onClose }) {
  if (!order) return null;
  const printReceipt = () => {
    if (typeof window !== "undefined") window.print();
  };
  const items = order.items || [];
  const payment = order.paymentDetails || null;
  return h("div", { className: "fixed inset-0 z-[70] flex items-end justify-center sm:items-center" }, [
    h("button", {
      key: "bg",
      type: "button",
      className: "absolute inset-0 bg-black/55 backdrop-blur-[2px]",
      onClick: onClose,
      "aria-label": "Close receipt"
    }),
    h(GlassPanel, { key: "card", className: "relative z-10 m-3 w-full max-w-xl !border-sky-500/20 !bg-white/98 dark:!bg-night-900/98" }, [
      h("div", { key: "head", className: "flex items-center justify-between gap-3 border-b border-white/10 pb-3" }, [
        h("div", { key: "ttl" }, [
          h("h3", { className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, "Payment receipt"),
          h("p", { className: "font-mono text-xs text-slate-500" }, `Order #${String(order.id).slice(-8)}`)
        ]),
        h("button", { key: "x", type: "button", className: "tap-target rounded-xl border border-white/15 p-2 hover:bg-white/10", onClick: onClose }, h(X, { className: "h-4 w-4" }))
      ]),
      h("div", { key: "body", className: "mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-200" }, [
        h("div", { className: "flex justify-between gap-3" }, [h("span", null, "Date"), h("span", { className: "text-right" }, order.createdAt ? new Date(order.createdAt).toLocaleString() : "—")]),
        h("div", { className: "flex justify-between gap-3" }, [h("span", null, "Payment method"), h("span", { className: "text-right" }, paymentMethodLabel(order.paymentMethod))]),
        h("div", { className: "flex justify-between gap-3" }, [h("span", null, "Payment reference"), h("span", { className: "max-w-[65%] text-right break-words" }, order.paymentReference || "—")]),
        payment?.momoPhone && h("div", { className: "flex justify-between gap-3" }, [h("span", null, "MoMo number"), h("span", { className: "font-mono text-right" }, payment.momoPhone)]),
        payment?.cardLast4 && h("div", { className: "flex justify-between gap-3" }, [h("span", null, "Card"), h("span", { className: "text-right" }, `**** ${payment.cardLast4}`)]),
        h("div", { className: "mt-3 rounded-xl border border-white/10 bg-white/30 p-3 dark:bg-night-900/30" }, [
          h("p", { className: "text-[10px] font-bold uppercase tracking-wide text-slate-500" }, "Items"),
          ...items.map((it, idx) =>
            h("div", { key: `${it.productId || it.name}-${idx}`, className: "mt-2 flex justify-between gap-3 text-sm" }, [
              h("span", { className: "min-w-0 flex-1" }, `${it.name} ×${it.quantity ?? 1}`),
              h("span", { className: "shrink-0 font-medium" }, formatGhc((Number(it.unitPrice) || 0) * (Number(it.quantity) || 1)))
            ])
          )
        ]),
        h("div", { className: "mt-2 flex justify-between border-t border-white/10 pt-3 text-base font-semibold text-slate-900 dark:text-white" }, [
          h("span", null, "Total paid"),
          h("span", null, formatGhc(order.total || 0))
        ])
      ].filter(Boolean)),
      h("div", { key: "ft", className: "mt-4 flex flex-wrap justify-end gap-2 border-t border-white/10 pt-3" }, [
        h(Button, { variant: "ghost", type: "button", onClick: onClose }, "Close"),
        h(Button, { type: "button", onClick: printReceipt }, "Print")
      ])
    ])
  ]);
}

export function BuyerMessagesPage() {
  const [cartOpen, setCartOpen] = useState(false);
  const { accessToken } = useAuth();
  const [threads, setThreads] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [replyByPeer, setReplyByPeer] = useState({});
  const [sending, setSending] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);

  const loadThreads = useCallback(() => {
    if (!accessToken) return Promise.resolve();
    return apiFetch("/api/conversations", {
      headers: { Authorization: `Bearer ${accessToken}` }
    }).then((d) => setThreads(Array.isArray(d?.threads) ? d.threads : []));
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr("");
    loadThreads()
      .catch((ex) => {
        if (!cancelled) setErr(ex.message || "Could not load messages");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, loadThreads]);

  useEffect(() => {
    if (!threads.length) {
      setActiveId(null);
      return;
    }
    const ids = threads.map((t) => String(t.peerUserId));
    if (!activeId || !ids.includes(String(activeId))) {
      setActiveId(String(threads[0].peerUserId));
    }
  }, [threads, activeId]);

  const activeThread = useMemo(
    () => threads.find((t) => String(t.peerUserId) === String(activeId)) || null,
    [threads, activeId]
  );

  const threadPreview = useCallback((t) => {
    const msgs = t.messages || [];
    if (!msgs.length) return "No messages";
    const last = msgs[msgs.length - 1];
    const s = String(last.text || "").replace(/\s+/g, " ").trim();
    return s.length > 80 ? `${s.slice(0, 80)}…` : s || "…";
  }, []);

  const threadLastTime = useCallback((t) => {
    const msgs = t.messages || [];
    if (!msgs.length) return null;
    const ts = msgs.map((m) => new Date(m.createdAt).getTime());
    return new Date(Math.max(...ts));
  }, []);

  const sendReply = async (peerUserId) => {
    const pid = String(peerUserId || "");
    const text = String(replyByPeer[pid] || "").trim();
    if (!text || !accessToken) return;
    setErr("");
    setSending(pid);
    try {
      await apiFetch(`/api/conversations/by-peer/${encodeURIComponent(pid)}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: { text }
      });
      setReplyByPeer((prev) => ({ ...prev, [pid]: "" }));
      await loadThreads();
    } catch (ex) {
      setErr(ex.message || "Could not send reply");
    } finally {
      setSending(null);
    }
  };

  const renderBubble = (m, idx) => {
    const mine = m.senderRole === "buyer";
    return h(
      "div",
      {
        key: `b-${idx}`,
        className: `flex w-full ${mine ? "justify-end" : "justify-start"}`
      },
      h(
        "div",
        {
          className: `max-w-[min(100%,22rem)] rounded-2xl px-3.5 py-2.5 shadow-sm ${
            mine
              ? "rounded-br-md bg-sky-600 text-white dark:bg-sky-600"
              : "rounded-bl-md border border-white/15 bg-white/50 text-slate-900 dark:border-white/10 dark:bg-night-900/70 dark:text-slate-100"
          }`
        },
        [
          h("p", { className: "text-[11px] font-semibold uppercase tracking-wide opacity-80" }, m.senderLabel || (mine ? "You" : "Seller")),
          h("p", { className: "mt-1 whitespace-pre-wrap text-sm leading-relaxed" }, m.text),
          m.createdAt
            ? h("p", { className: `mt-1.5 text-[10px] ${mine ? "text-white/75" : "text-slate-500 dark:text-slate-400"}` }, new Date(m.createdAt).toLocaleString())
            : null
        ].filter(Boolean)
      )
    );
  };

  const chatShell =
    !loading &&
    !err &&
    threads.length > 0 &&
    h(
      "div",
      {
        key: "chat-shell",
        className:
          "flex min-h-[min(28rem,calc(100dvh-13rem))] flex-col overflow-hidden rounded-2xl border border-white/15 bg-white/25 shadow-xl backdrop-blur-xl dark:bg-night-900/45 md:min-h-[calc(100dvh-10rem)] md:flex-row md:rounded-3xl"
      },
      [
        h(
          "aside",
          {
            key: "conv-list",
            className: `flex max-h-[40vh] shrink-0 flex-col border-white/10 md:max-h-none md:h-auto md:w-[min(100%,20rem)] md:max-w-[40%] md:border-r ${
              mobileShowChat ? "max-md:hidden" : "max-md:flex min-h-0"
            }`
          },
          [
            h("div", { key: "conv-h", className: "shrink-0 border-b border-white/10 px-4 py-3" }, [
              h("h2", { className: "text-base font-semibold text-slate-900 dark:text-white" }, "Chats"),
              h("p", { className: "mt-0.5 text-xs text-slate-500 dark:text-slate-400" }, "One thread per seller — every order with them stays together.")
            ]),
            h(
              "div",
              { key: "conv-scroll", className: "min-h-0 flex-1 overflow-y-auto" },
              threads.map((t) => {
                const selected = String(t.peerUserId) === String(activeId);
                const lt = threadLastTime(t);
                return h(
                  "button",
                  {
                    key: t.peerUserId,
                    type: "button",
                    onClick: () => {
                      setActiveId(String(t.peerUserId));
                      setMobileShowChat(true);
                    },
                    className: `flex w-full flex-col gap-1 border-b border-white/5 px-4 py-3.5 text-left transition hover:bg-white/25 dark:hover:bg-white/5 ${
                      selected ? "bg-sky-500/15 dark:bg-sky-500/10" : ""
                    }`
                  },
                  [
                    h("div", { className: "flex items-baseline justify-between gap-2" }, [
                      h(
                        "span",
                        { className: "min-w-0 truncate text-sm font-semibold text-slate-800 dark:text-slate-100" },
                        t.peerDisplayName || "Seller"
                      ),
                      lt
                        ? h("span", { className: "shrink-0 text-[10px] text-slate-400" }, lt.toLocaleDateString())
                        : null
                    ]),
                    t.itemSummary
                      ? h("p", { className: "truncate text-[11px] text-slate-500 dark:text-slate-400" }, t.itemSummary)
                      : null,
                    h("p", { className: "line-clamp-2 text-xs text-slate-600 dark:text-slate-300" }, threadPreview(t))
                  ].filter(Boolean)
                );
              })
            )
          ]
        ),
        h(
          "section",
          {
            key: "thread",
            className: `flex min-h-0 flex-1 flex-col overflow-hidden bg-white/15 dark:bg-night-950/25 max-md:min-h-[52vh] ${
              mobileShowChat ? "max-md:flex" : "max-md:hidden md:flex"
            }`
          },
          activeThread
            ? [
                h("header", { key: "th", className: "flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-3 md:px-4" }, [
                  h(
                    "button",
                    {
                      key: "back",
                      type: "button",
                      className: "tap-target rounded-xl p-2 hover:bg-white/15 md:hidden",
                      onClick: () => setMobileShowChat(false),
                      "aria-label": "Back to conversations"
                    },
                    h(ArrowLeft, { className: "h-5 w-5 text-slate-700 dark:text-slate-200" })
                  ),
                  h("div", { key: "tit", className: "min-w-0 flex-1" }, [
                    h("p", { className: "truncate font-semibold text-slate-900 dark:text-white" }, activeThread.peerDisplayName || "Seller"),
                    h(
                      "p",
                      { className: "truncate text-xs text-slate-500 dark:text-slate-400" },
                      activeThread.itemSummary || "One thread for all your orders with this seller."
                    )
                  ]),
                  h(
                    Link,
                    {
                      key: "ord",
                      to: "/orders",
                      className: "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-sky-600 hover:bg-sky-500/10 dark:text-sky-300"
                    },
                    "Orders"
                  )
                ]),
                h(
                  "div",
                  {
                    key: "scroll",
                    className: "min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 md:px-5"
                  },
                  (activeThread.messages || []).map((m, i) => renderBubble(m, i))
                ),
                h("footer", { key: "ft", className: "shrink-0 border-t border-white/10 bg-white/20 p-3 dark:bg-night-950/40 md:p-4" }, [
                  h("div", { className: "flex items-end gap-2" }, [
                    h("textarea", {
                      key: `reply-${activeThread.peerUserId}`,
                      className:
                        "min-h-[44px] flex-1 resize-none rounded-2xl border border-white/20 bg-white/60 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-white/10 dark:bg-night-900/60 dark:text-slate-100 dark:placeholder:text-slate-500",
                      rows: 2,
                      maxLength: 1000,
                      placeholder: "Write a message…",
                      value: replyByPeer[String(activeThread.peerUserId)] || "",
                      onChange: (e) =>
                        setReplyByPeer((prev) => ({
                          ...prev,
                          [String(activeThread.peerUserId)]: e.target.value
                        })),
                      onKeyDown: (e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendReply(activeThread.peerUserId);
                        }
                      }
                    }),
                    h(
                      Button,
                      {
                        type: "button",
                        variant: "primary",
                        className: "!h-11 !min-w-[2.75rem] !rounded-2xl !px-3",
                        disabled: sending === String(activeThread.peerUserId) || !String(replyByPeer[String(activeThread.peerUserId)] || "").trim(),
                        onClick: () => sendReply(activeThread.peerUserId),
                        title: "Send"
                      },
                      sending === String(activeThread.peerUserId)
                        ? "…"
                        : h(Send, { className: "h-5 w-5", "aria-hidden": true })
                    )
                  ]),
                  h("p", { className: "mt-2 text-center text-[10px] text-slate-500 dark:text-slate-400" }, "Enter to send · Shift+Enter for new line")
                ])
              ]
            : h("div", { key: "ph", className: "hidden flex-1 items-center justify-center p-8 text-sm text-slate-500 md:flex" }, "Select a conversation")
        )
      ]
    );

  return h(f, null, [
    h(
      BuyerLayout,
      { key: "layout", onOpenCart: () => setCartOpen(true), hideSearch: true, title: "Messages" },
      h("div", { key: "main", className: "mx-auto flex w-full max-w-5xl flex-col px-4 py-6 pb-24 sm:px-6" }, [
        h("h2", { key: "h2", className: "sr-only" }, "Messages from sellers"),
        loading ? h("p", { key: "ld", className: "text-sm text-slate-500 dark:text-slate-400" }, "Loading…") : null,
        !loading &&
          err &&
          h(InlineNotice, { key: "er", variant: "error", className: "mb-4", onDismiss: () => setErr("") }, err),
        !loading &&
          !err &&
          threads.length === 0 &&
          h(GlassPanel, { key: "empty" }, [
            h("p", { className: "text-sm text-slate-600 dark:text-slate-300" }, "No seller chats yet."),
            h(
              "p",
              { className: "mt-2 text-xs text-slate-500 dark:text-slate-400" },
              "After you place an order, each seller you bought from appears here as one conversation — all your messages with them stay in that thread."
            )
          ]),
        chatShell
      ])
    ),
    h(CartDrawer, { key: "cart", open: cartOpen, onClose: () => setCartOpen(false) })
  ]);
}

export function BuyerOrdersPage() {
  const [cartOpen, setCartOpen] = useState(false);
  const { accessToken } = useAuth();
  const [orders, setOrders] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [reviewModal, setReviewModal] = useState(null);
  const [receiptOrder, setReceiptOrder] = useState(null);
  const closeReviewModal = useCallback(() => setReviewModal(null), []);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setLoading(true);
    setErr("");
    apiFetch("/api/orders", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => {
        if (!cancelled) setOrders(d.orders || []);
      })
      .catch((ex) => {
        if (!cancelled) setErr(ex.message || "Could not load orders");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const rateableStatuses = ["paid", "processing", "sent_for_delivery", "delivered"];
  const ordersSorted = useMemo(
    () =>
      [...orders].sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
      ),
    [orders]
  );
  const ordersWithReceiptMeta = useMemo(
    () => orders.filter((o) => o.paymentMethod || o.paymentReference || o.paymentDetails),
    [orders]
  );
  const paidTotal = useMemo(
    () =>
      orders
        .filter((o) => ["paid", "processing", "sent_for_delivery", "delivered"].includes(o.status))
        .reduce((sum, o) => sum + (Number(o.total) || 0), 0),
    [orders]
  );

  return h(f, null, [
    h(
      BuyerLayout,
      { key: "layout", onOpenCart: () => setCartOpen(true), hideSearch: true, title: "My orders" },
      h("div", { key: "main", className: "mx-auto max-w-3xl px-4 py-8 pb-24 sm:px-6" }, [
      h("h2", { key: "h2", className: "sr-only" }, "Your orders"),
      h(
        "p",
        { key: "hint", className: "mb-4 text-sm text-slate-600 dark:text-slate-400" },
        "After payment, tap Rate next to an item to leave a star rating and optional review here — no need to open the product page."
      ),
      !loading &&
        !err &&
        h("div", { key: "stats", className: "mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3" }, [
          h(GlassCard, { key: "st-all", className: "!p-4" }, [
            h("p", { className: "text-xs font-semibold uppercase text-slate-500 dark:text-slate-400" }, "Total orders"),
            h("p", { className: "mt-1 text-2xl font-bold text-slate-900 dark:text-white" }, String(orders.length))
          ]),
          h(GlassCard, { key: "st-pay", className: "!p-4" }, [
            h("p", { className: "flex items-center gap-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400" }, [
              h(Wallet, { key: "i", className: "h-3.5 w-3.5" }),
              "Payment records"
            ]),
            h("p", { className: "mt-1 text-2xl font-bold text-slate-900 dark:text-white" }, String(ordersWithReceiptMeta.length))
          ]),
          h(GlassCard, { key: "st-total", className: "!p-4" }, [
            h("p", { className: "text-xs font-semibold uppercase text-slate-500 dark:text-slate-400" }, "Paid value"),
            h("p", { className: "mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-300" }, formatGhc(paidTotal))
          ])
        ]),
      loading ? h("p", { key: "ld", className: "text-sm text-slate-500 dark:text-slate-400" }, "Loading orders…") : null,
      !loading && err
        ? h(InlineNotice, { key: "er", variant: "error", className: "mb-4", onDismiss: () => setErr("") }, err)
        : null,
      !loading && !err && orders.length === 0
        ? h("p", { key: "empty", className: "text-slate-600 dark:text-slate-300" }, "You have no orders yet.")
        : null,
      !loading &&
        !err &&
        orders.length > 0 &&
        h(GlassPanel, { key: "orders-list", className: "mb-4 !border-sky-500/20" }, [
          h("h3", { className: "font-semibold text-slate-900 dark:text-white" }, "Payment history"),
          h("p", { className: "mt-1 text-xs text-slate-500 dark:text-slate-400" }, "Status, line items, and rating. Receipt opens full payment details when available."),
          h(
            "div",
            { className: "mt-3 space-y-4" },
            ordersSorted.map((o) => {
              const lines = o.items || [];
              const canRate = rateableStatuses.includes(o.status);
              const hasReceiptMeta = !!(o.paymentMethod || o.paymentReference || o.paymentDetails);
              const summaryLine = hasReceiptMeta
                ? `${paymentMethodLabel(o.paymentMethod)} · ${formatGhc(o.total || 0)}`
                : formatGhc(o.total || 0);
              return h("div", { key: `ord-${o.id}`, className: "rounded-xl border border-white/10 bg-white/30 dark:bg-night-900/30" }, [
                h("div", { className: "flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4" }, [
                  h("div", { className: "min-w-0 flex-1" }, [
                    h("p", { className: "font-mono text-xs text-slate-500" }, `#${String(o.id).slice(-8)}`),
                    h("p", { className: "mt-1 text-sm font-medium text-slate-800 dark:text-slate-100" }, summaryLine),
                    h("p", { className: `mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${buyerOrderStatusTone(o.status)}` }, formatBuyerOrderStatus(o.status))
                  ]),
                  hasReceiptMeta
                    ? h(Button, {
                        variant: "ghost",
                        className: "!shrink-0 !px-3 !py-1.5",
                        type: "button",
                        onClick: () => setReceiptOrder(o)
                      }, [
                        h(ReceiptText, { key: "ic", className: "h-4 w-4" }),
                        h("span", { key: "tx" }, "Receipt")
                      ])
                    : null
                ].filter(Boolean)),
                lines.length > 0 &&
                  h("div", { className: "border-t border-white/10 px-3 py-3 sm:px-4" }, [
                    h("p", { className: "mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, "Items"),
                    ...lines.map((it) =>
                      h(
                        "div",
                        {
                          key: `${o.id}-${it.productId || it.name}`,
                          className:
                            "mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2 last:mb-0 last:border-0 last:pb-0"
                        },
                        [
                          h("span", { className: "min-w-0 flex-1 text-sm text-slate-800 dark:text-slate-100" }, `${it.name} ×${it.quantity ?? 1}`),
                          canRate && it.productId
                            ? h(
                                "button",
                                {
                                  type: "button",
                                  className:
                                    "shrink-0 rounded-full bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-500/25 dark:text-sky-300",
                                  onClick: () =>
                                    setReviewModal({
                                      productId: String(it.productId),
                                      orderId: String(o.id),
                                      productTitle: String(it.name || "Product")
                                    })
                                },
                                "Rate"
                              )
                            : !canRate && o.status === "pending_payment"
                              ? h("span", { className: "text-xs text-slate-500" }, "Pay to rate")
                              : null
                        ].filter(Boolean)
                      )
                    )
                  ])
              ].filter(Boolean));
            })
          )
        ])
    ])
  ),
    h(CartDrawer, { key: "cart", open: cartOpen, onClose: () => setCartOpen(false) }),
    reviewModal &&
      h(BuyerReviewModal, {
        key: "review-modal",
        open: true,
        onClose: closeReviewModal,
        productId: reviewModal.productId,
        orderId: reviewModal.orderId,
        productTitle: reviewModal.productTitle
      }),
    receiptOrder && h(BuyerReceiptModal, { key: "receipt-modal", order: receiptOrder, onClose: () => setReceiptOrder(null) })
  ]);
}

export function PaymentSuccessPage() {
  const [params] = useSearchParams();
  const { accessToken } = useAuth();
  const orderId = params.get("orderId") || "";
  const [phase, setPhase] = useState("loading");
  const [order, setOrder] = useState(null);
  const [pollErr, setPollErr] = useState("");

  useEffect(() => {
    if (!orderId) {
      setPhase("no_ref");
      return;
    }
    if (!accessToken) {
      setPhase("no_auth");
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 150;

    const paidLike = (s) => ["paid", "processing", "sent_for_delivery", "delivered"].includes(s);

    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const d = await apiFetch(`/api/orders/${orderId}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const st = d.order?.status;
        if (!st) {
          if (!cancelled) {
            setPollErr("Order not found.");
            setPhase("error");
          }
          return true;
        }
        if (!cancelled) setOrder(d.order);
        if (paidLike(st)) {
          if (!cancelled) setPhase("confirmed");
          return true;
        }
        if (st === "awaiting_vendor_payment") {
          if (!cancelled) setPhase("waiting_vendor");
          return false;
        }
        if (st === "pending_payment") {
          if (!cancelled) setPhase("pending_gateway");
          return false;
        }
        if (st === "cancelled") {
          if (!cancelled) {
            setPollErr("This order was cancelled.");
            setPhase("error");
          }
          return true;
        }
      } catch (ex) {
        if (!cancelled) {
          setPollErr(ex.message || "Could not verify order");
          setPhase("error");
        }
        return true;
      }
      if (attempts >= maxAttempts) {
        if (!cancelled) setPhase("timeout");
        return true;
      }
      return false;
    };

    tick();
    const t = setInterval(async () => {
      const done = await tick();
      if (done) clearInterval(t);
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [orderId, accessToken]);

  const sellers = order?.sellerContacts || [];
  const confirmed = new Set(order?.confirmedSellerIds || []);

  return h("div", { className: "mx-auto max-w-lg px-4 py-8 sm:py-12" }, [
    h(GlassPanel, { className: "text-center" }, [
      phase === "loading" && [
        h("h1", { key: "h1", className: "font-display text-xl font-bold text-slate-900 dark:text-white" }, "Checking your order…"),
        h("p", { key: "p", className: "mt-3 text-sm text-slate-600 dark:text-slate-400" }, "We verify payment status with the server before showing success.")
      ],
      phase === "no_ref" && [
        h("h1", { key: "h1", className: "font-display text-xl font-bold text-slate-900 dark:text-white" }, "Thanks for shopping"),
        h("p", { key: "p", className: "mt-3 text-sm text-slate-600 dark:text-slate-400" }, "Open My orders to see status for recent purchases."),
        h("div", { key: "nav", className: "mt-6 flex flex-wrap justify-center gap-3" }, [
          h(Link, { to: "/orders", className: "inline-block" }, h(Button, { className: "!rounded-full" }, "My orders")),
          h(Link, { to: "/", className: "inline-block" }, h(Button, { variant: "ghost", className: "!rounded-full" }, "Shop"))
        ])
      ],
      phase === "no_auth" && [
        h("h1", { key: "h1", className: "font-display text-xl font-bold text-slate-900 dark:text-white" }, "Sign in to view order status"),
        h(Link, { key: "lg", to: "/login", className: "mt-6 inline-block" }, h(Button, { className: "!rounded-full" }, "Log in"))
      ],
      phase === "pending_gateway" && [
        h("h1", { key: "h1", className: "font-display text-xl font-bold text-amber-400" }, "Payment processing"),
        h("p", { key: "p", className: "mt-3 text-sm text-slate-600 dark:text-slate-400" }, "Your bank or card provider is still confirming. This page will update automatically."),
        orderId && h("p", { key: "id", className: "mt-2 font-mono text-xs text-slate-500" }, `Order: ${orderId}`)
      ],
      phase === "waiting_vendor" && [
        h("h1", { key: "h1", className: "font-display text-xl font-bold text-sky-600 dark:text-sky-300" }, "Waiting for seller confirmation"),
        h("p", { key: "p", className: "mt-3 text-sm text-slate-600 dark:text-slate-300" }, "We only mark your order complete after the vendor confirms they received your MoMo or bank payment in their account."),
        h("p", { key: "p2", className: "mt-2 text-xs text-slate-500 dark:text-slate-400" }, "You can message the seller from your order if you need to send proof."),
        orderId && h("p", { key: "id", className: "mt-3 font-mono text-xs text-slate-500" }, `Order: ${orderId}`),
        sellers.length > 0 &&
          h("ul", { key: "ul", className: "mt-4 space-y-2 text-left text-sm text-slate-700 dark:text-slate-200" }, [
            h("p", { key: "cap", className: "text-xs font-semibold uppercase text-slate-500" }, "Sellers on this order"),
            ...sellers.map((sc) =>
              h("li", { key: sc.id, className: "flex items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2" }, [
                h("div", { className: "min-w-0" }, [
                  h("span", { className: "block truncate" }, sc.displayName || "Seller")
                ]),
                h("span", { className: "shrink-0 text-xs font-medium" }, confirmed.has(sc.id) ? "Confirmed" : "Pending")
              ])
            )
          ]),
        h("p", { key: "poll", className: "mt-4 text-xs text-slate-500" }, "Checking every few seconds…")
      ],
      phase === "confirmed" && [
        h("h1", { key: "h1", className: "font-display text-2xl font-bold text-emerald-400" }, "Payment successful"),
        h("p", { key: "p", className: "mt-2 text-slate-600 dark:text-slate-300" }, "Your order is confirmed — the seller(s) acknowledged payment."),
        h(
          "p",
          { key: "p2", className: "mt-3 text-sm text-slate-600 dark:text-slate-400" },
          "You can track the order under My orders and message sellers there if needed."
        ),
        orderId && h("p", { key: "id", className: "mt-2 font-mono text-xs text-slate-500 dark:text-slate-400" }, `Order reference: ${orderId}`)
      ],
      phase === "timeout" && [
        h("h1", { key: "h1", className: "font-display text-xl font-bold text-amber-400" }, "Still waiting"),
        h(
          "p",
          { key: "p", className: "mt-3 text-sm text-slate-600 dark:text-slate-300" },
          "Sellers have not all confirmed yet, or the gateway is slow. Check My orders for the latest status."
        ),
        orderId && h("p", { key: "id", className: "mt-2 font-mono text-xs text-slate-500" }, `Order: ${orderId}`)
      ],
      phase === "error" &&
        pollErr &&
        h(InlineNotice, { key: "err", variant: "error", className: "mt-4 text-left", onDismiss: () => setPollErr("") }, pollErr),
      ["confirmed", "timeout", "error", "no_ref"].includes(phase) &&
        h("div", { key: "nav", className: "mt-6 flex flex-wrap items-center justify-center gap-3" }, [
          h(Link, { to: "/orders", className: "inline-block" }, h(Button, { variant: "ghost", className: "!rounded-full" }, "View my orders")),
          h(Link, { to: "/", className: "inline-block" }, h(Button, { className: "!rounded-full" }, "Back to shop"))
        ]),
      ["waiting_vendor", "pending_gateway", "loading"].includes(phase) &&
        h("div", { key: "nav-pend", className: "mt-6 flex flex-wrap items-center justify-center gap-3" }, [
          h(Link, { to: "/orders", className: "inline-block" }, h(Button, { variant: "ghost", className: "!rounded-full" }, "My orders")),
          h(Link, { to: "/", className: "inline-block" }, h(Button, { variant: "ghost", className: "!rounded-full" }, "Shop"))
        ])
    ])
  ]);
}

export function PaymentCancelPage() {
  const [params] = useSearchParams();
  const { dark, toggle } = useTheme();
  const orderId = params.get("orderId") || "";
  return h("div", { className: "mx-auto max-w-lg px-4 py-8 sm:py-12" }, [
    h("div", { className: "mb-6 flex justify-end" }, h(ThemeToggleButton, { dark, onToggle: toggle })),
    h(GlassPanel, { className: "text-center" }, [
      h("h1", { className: "font-display text-2xl font-bold text-amber-300" }, "Checkout cancelled"),
      h("p", { className: "mt-2 text-slate-600 dark:text-slate-300" }, "No charge was made. You can return to checkout from your cart when ready."),
      orderId && h("p", { className: "mt-2 font-mono text-xs text-slate-500 dark:text-slate-400" }, `Order draft: ${orderId}`),
      h(Link, { to: "/", className: "mt-6 inline-block" }, h(Button, { variant: "ghost", className: "!rounded-full" }, "Return to shop"))
    ])
  ]);
}
