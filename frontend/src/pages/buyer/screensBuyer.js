import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Baby,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Copy,
  Cpu,
  Gift,
  Flag,
  Heart,
  LayoutGrid,
  Mail,
  Menu,
  MessageSquare,
  Minus,
  Crosshair,
  MapPin,
  Navigation,
  Package,
  Plus,
  ReceiptText,
  BadgeCheck,
  Building2,
  Bookmark,
  Search,
  Send,
  ShoppingBasket,
  Sparkles,
  Camera,
  Headphones,
  Shirt,
  ShoppingCart,
  Star,
  Store,
  Trash2,
  Shield,
  Lock,
  Truck,
  TrendingUp,
  User,
  Utensils,
  Wallet,
  Wrench,
  X
} from "lucide-react";
import { useAuth, useCart, useNotice, useTheme } from "context";
import { useSavedProducts } from "context/SavedProductsContext";
import { apiFetch, apiUploadProfileImage, deleteAuthenticatedAccount, apiErrorMessage } from "services/api";
import { NotificationBell, NotificationsContent } from "pages/notifications/screensNotifications";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  FILTERS,
  formatSellerPaymentSnippet,
  groupCartItemsBySeller,
  isFoodCallToOrderCategory,
  isOfflineQuoteCategory,
  canAddProductToCart,
  usesRequestInsteadOfCart,
  isServicesCategory,
  cartRequiresDelivery,
  supportsCartCustomizationNotes,
  productBadge,
  browseFilterEmptyHint,
  browseFilterSectionTitle,
  productMatchesFilter,
  sortProductsByBrowseFilter,
  productStorefrontBadges,
  refFromId,
  sellerGroupGross,
  withAllCategoryFirst
} from "config/catalog";
import { normalizeProductCategoryId } from "config/productCategories";
import {
  ProductCustomizationPanel,
  productShowsCustomizationUi,
  productSupportsMealCustomization
} from "components/products/ProductCustomizationPanel";
import { cartLineSellerUnit, effectiveListUnitPrice, productAddonDefs } from "utils/productAddons";
import { containsContactSharing, CONTACT_SHARING_BLOCKED_MESSAGE } from "utils/contactSharingGuard";
import { getGuestOrderSecret, setGuestOrderSecret } from "utils/guestOrderSecret";
import { SITE_NAME, SUPPORT_LABEL } from "config/brand";
import { formatGhc } from "utils/money";
import { TrackOrderModal } from "components/features/TrackOrderModal";
import { ShoppingAssistantFAB } from "components/features/ShoppingAssistantFAB";
import { ShopHomePromoCarousel } from "pages/buyer/shopFlashDealsRail";
import { MenuItemFeedCard } from "components/marketplace/MenuItemFeedCard";
import { ProductCardRotatingImage } from "components/marketplace/ProductCardRotatingImage";
import { RestaurantContextPanel } from "components/marketplace/RestaurantContextPanel";
import { productSocialProofLines, productStoreContext } from "utils/productStore";
import { buyerDisplayPrice } from "utils/checkoutPricing";
import { computeCheckoutBreakdown, useCheckoutPricingOptions } from "hooks/useCheckoutPricing";
import { buyerOrderFulfillmentPillClass, formatOrderFulfillmentLabel, isOnsiteOrder } from "utils/orderStatusDisplay";
import { h, f } from "utils/h";
import {
  Button,
  Field,
  GlassCard,
  GlassPanel,
  InlineNotice,
  LogoMark,
  RefImage,
  TextArea,
  TextInput,
  ThemeToggleButton
} from "components/ui";

/** Service listings have no fixed storefront price — buyer contacts vendor. */
function buyerServicePricingPanel() {
  return h(GlassPanel, { key: "svc-price", className: "!border-amber-500/25 !bg-amber-500/10" }, [
    h("h3", { className: "text-sm font-semibold text-amber-950 dark:text-amber-50" }, "Pricing"),
    h(
      "p",
      { className: "mt-1 text-xs leading-relaxed text-amber-950/90 dark:text-amber-100/90" },
      "No fixed online price — use the request form on this page. Sign in to send a request, or buy other priced items as a guest."
    )
  ]);
}

function buyerFoodCallPricingPanel() {
  return h(GlassPanel, { key: "food-c2o", className: "!border-violet-500/25 !bg-violet-500/10" }, [
    h("h3", { className: "text-sm font-semibold text-violet-950 dark:text-violet-50" }, "Pricing"),
    h(
      "p",
      { className: "mt-1 text-xs leading-relaxed text-violet-950/90 dark:text-violet-100/90" },
      "Tap Place order to send your request to the seller."
    )
  ]);
}

export function ReviewStars({ value, className = "" }) {
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
          setReviewStatusErr(apiErrorMessage(ex, "Could not load review eligibility"));
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
      setReviewMsg(apiErrorMessage(ex, "Could not submit review"));
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
  const { accessToken, user } = useAuth();
  const { toast } = useNotice();
  const { add } = useCart();
  const { isSaved, toggleSaved } = useSavedProducts();
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
  const [svcPreferredTime, setSvcPreferredTime] = useState("");
  const [svcMessage, setSvcMessage] = useState("");
  const [svcSubmitting, setSvcSubmitting] = useState(false);
  const [relatedExplore, setRelatedExplore] = useState([]);
  const [relatedSimilar, setRelatedSimilar] = useState([]);
  const [relatedTogether, setRelatedTogether] = useState([]);
  const [relatedExploreTitle, setRelatedExploreTitle] = useState("Explore your interests");
  const [relatedSimilarTitle, setRelatedSimilarTitle] = useState("More you may like");
  const [relatedTogetherTitle, setRelatedTogetherTitle] = useState("Frequently bought together");
  const [selectedAddonLabels, setSelectedAddonLabels] = useState([]);
  const [orderNotes, setOrderNotes] = useState("");
  const pricingOpts = useCheckoutPricingOptions();
  const guestReviewSecret = orderIdFromUrl ? getGuestOrderSecret(orderIdFromUrl) : "";

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
        setSvcPreferredTime("");
        setSvcMessage("");
      })
      .catch((ex) => {
        if (!cancelled) {
          setErr(apiErrorMessage(ex, "Failed to load"));
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
    if (!product?.id || user?.role !== "buyer" || !accessToken) return;
    apiFetch(`/api/products/${product.id}/view`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` }
    }).catch(() => {});
  }, [product?.id, accessToken, user?.role]);

  useEffect(() => {
    if (!productId) {
      setReviewStatus(null);
      setReviewStatusErr("");
      return;
    }
    const hasGuestReviewAccess = Boolean(orderIdFromUrl && guestReviewSecret);
    if (!accessToken && !hasGuestReviewAccess) {
      setReviewStatus(null);
      setReviewStatusErr("");
      return;
    }
    let cancelled = false;
    setReviewStatusErr("");
    const qs = orderIdFromUrl ? `?orderId=${encodeURIComponent(orderIdFromUrl)}&_=${Date.now()}` : `?_=${Date.now()}`;
    const headers = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (!accessToken && hasGuestReviewAccess) headers["X-Guest-Order-Secret"] = guestReviewSecret;
    apiFetch(`/api/products/${productId}/review-status${qs}`, { headers })
      .then((d) => {
        if (!cancelled) {
          setReviewStatus(d);
          setReviewStatusErr("");
        }
      })
      .catch((ex) => {
        if (!cancelled) {
          setReviewStatus(null);
          setReviewStatusErr(apiErrorMessage(ex, "Could not load review eligibility"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, productId, orderIdFromUrl, guestReviewSecret]);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    apiFetch(`/api/products/${productId}/related`)
      .then((d) => {
        if (cancelled) return;
        setRelatedExplore(Array.isArray(d.explore?.products) ? d.explore.products : []);
        setRelatedSimilar(Array.isArray(d.similar?.products) ? d.similar.products : []);
        setRelatedTogether(Array.isArray(d.together?.products) ? d.together.products : []);
        if (d.explore?.title) setRelatedExploreTitle(String(d.explore.title));
        if (d.similar?.title) setRelatedSimilarTitle(String(d.similar.title));
        if (d.together?.title) setRelatedTogetherTitle(String(d.together.title));
      })
      .catch(() => {
        if (!cancelled) {
          setRelatedExplore([]);
          setRelatedSimilar([]);
          setRelatedTogether([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  useEffect(() => {
    setSelectedAddonLabels([]);
    setOrderNotes("");
  }, [productId]);

  const tryAdd = () => {
    if (!product || !canAddProductToCart(product)) return;
    const baseList = Number(product.price) || 0;
    const labels = Array.isArray(selectedAddonLabels) ? selectedAddonLabels : [];
    const listUnit = effectiveListUnitPrice(product, labels);
    if (!(listUnit > 0)) {
      toast("This combination has no checkout price. Change your add-ons.", { variant: "error" });
      return;
    }
    const note = String(orderNotes || "").trim();
    if (note && containsContactSharing(note)) {
      toast(CONTACT_SHARING_BLOCKED_MESSAGE, { variant: "error" });
      return;
    }
    add(
      {
        ...product,
        baseListPrice: baseList,
        price: listUnit,
        selectedAddonLabels: labels
      },
      1,
      note
    );
    setCartOpen(true);
  };

  const submitOfflineInquiry = async () => {
    if (!productId || !product || !usesRequestInsteadOfCart(product)) return;
    if (!accessToken) {
      nav("/login", { state: { from: loc.pathname } });
      return;
    }
    const msg = svcMessage.trim();
    if (msg.length < 10) {
      toast("Please describe what you need (at least 10 characters).", { variant: "error" });
      return;
    }
    if (containsContactSharing(msg) || (svcPreferredTime.trim() && containsContactSharing(svcPreferredTime))) {
      toast(CONTACT_SHARING_BLOCKED_MESSAGE, { variant: "error" });
      return;
    }
    setSvcSubmitting(true);
    try {
      await apiFetch("/api/service-inquiries", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: {
          productId,
          message: msg,
          preferredTime: svcPreferredTime.trim()
        }
      });
      setSvcMessage("");
      setSvcPreferredTime("");
      toast(
        isFoodCallToOrderCategory(product)
          ? "Order request sent. The restaurant was notified in-app."
          : "Request sent. The seller was notified in-app.",
        { variant: "success" }
      );
    } catch (ex) {
      toast(apiErrorMessage(ex, "Could not send request."), { variant: "error" });
    } finally {
      setSvcSubmitting(false);
    }
  };

  const submitReview = async () => {
    setReviewMsg("");
    if (!productId || !reviewStatus?.canSubmit) return;
    const commentTrim = comment.trim();
    if (commentTrim && containsContactSharing(commentTrim)) {
      setReviewMsg(CONTACT_SHARING_BLOCKED_MESSAGE);
      return;
    }
    const hasGuestReviewAccess = Boolean(orderIdFromUrl && guestReviewSecret);
    if (!accessToken && !hasGuestReviewAccess) return;
    const oid = reviewStatus.orderId != null && String(reviewStatus.orderId).trim() ? String(reviewStatus.orderId).trim() : "";
    if (!reviewStatus.skipVerifiedPurchase && !oid) return;
    setSubmitting(true);
    try {
      const headers = {};
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      if (!accessToken && hasGuestReviewAccess) headers["X-Guest-Order-Secret"] = guestReviewSecret;
      await apiFetch(`/api/products/${productId}/reviews`, {
        method: "POST",
        headers,
        json: { rating, comment: comment.trim(), ...(oid ? { orderId: oid } : {}) }
      });
      setComment("");
      const rv = await apiFetch(`/api/products/${productId}/reviews`);
      setReviews(rv.reviews || []);
      const qs2 = orderIdFromUrl ? `?orderId=${encodeURIComponent(orderIdFromUrl)}&_=${Date.now()}` : `?_=${Date.now()}`;
      const st = await apiFetch(`/api/products/${productId}/review-status${qs2}`, { headers });
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
            apiFetch(`/api/products/${productId}/review-status${qs3}`, { headers })
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
      setReviewMsg(apiErrorMessage(ex, "Could not submit review"));
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
        h("p", { key: "ld", className: "w-full px-4 py-10 text-slate-500 sm:px-6 lg:px-8" }, "Loading product…")
      ),
      h(CartDrawer, { key: "cart", open: cartOpen, onClose: () => setCartOpen(false) })
    ]);
  }

  if (err || !product) {
    return h(f, null, [
      h(
        BuyerLayout,
        { key: "layout", onOpenCart: () => setCartOpen(true), hideSearch: true, title: "Product" },
        h("div", { key: "em", className: "w-full px-4 py-10 sm:px-6 lg:px-8" }, [
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
  const svc = isServicesCategory(product);
  const foodC2O = isFoodCallToOrderCategory(product);
  const offlineListing = usesRequestInsteadOfCart(product);
  const listPx = Number(product.price) || 0;
  const canBuy = canAddProductToCart(product);
  const showsCustomizeUi = productShowsCustomizationUi(product);
  const mealCustomization = productSupportsMealCustomization(product);
  const customizedListPx =
    mealCustomization || showsCustomizeUi ? effectiveListUnitPrice(product, selectedAddonLabels) : listPx;
  const unitPayTotal = !offlineListing ? buyerDisplayPrice(customizedListPx, pricingOpts, 1) : null;

  const pricingPanel =
    svc || foodC2O
      ? svc
        ? buyerServicePricingPanel()
        : buyerFoodCallPricingPanel()
      : showsCustomizeUi
        ? null
        : h("span", { key: "pr", className: "text-3xl font-bold text-sky-600 dark:text-sky-300" }, formatGhc(unitPayTotal ?? listPx));

  return h(f, null, [
    h(
      BuyerLayout,
      {
        key: "layout",
        onOpenCart: () => setCartOpen(true),
        hideSearch: true,
        title: titleShort
      },
      h("div", { key: "main", className: "w-full px-4 py-6 pb-28 sm:px-6 lg:px-8" }, [
      h(Link, { key: "back", to: "/", className: "mb-6 inline-flex items-center gap-2 text-sm font-medium text-sky-600 hover:underline dark:text-sky-300" }, [
        h(ArrowLeft, { className: "h-4 w-4" }),
        h("span", null, "Back to shop")
      ]),
      h("div", { key: "grid", className: "grid gap-8 lg:grid-cols-2 lg:items-start" }, [
        h("div", { key: "gal-media", className: "space-y-3 lg:col-start-1 lg:row-start-1" }, [
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
            : null,
          h("section", { key: "reviews", className: "mt-4 border-t border-white/10 pt-5" }, [
            h("h2", { className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, "Customer reviews"),
            h("p", { className: "mt-1 text-xs text-slate-500 dark:text-slate-400" }, "Ratings are from verified purchases."),
            reviewStatusErr &&
              h(InlineNotice, { key: "rs-err", variant: "error", className: "mt-3", onDismiss: () => setReviewStatusErr("") }, reviewStatusErr),
            accessToken && reviewStatus?.canSubmit &&
              h(GlassPanel, { key: "form", className: "mt-4 !border-sky-500/20" }, [
                h("h3", { className: "font-semibold text-slate-900 dark:text-white" }, "Write a review"),
                h("p", { className: "mt-1 text-xs text-slate-500 dark:text-slate-400" }, "Tap a star to choose 1–5, then add an optional comment and submit."),
                h("div", { className: "mt-3" }, [
                  h("p", { className: "mb-2 text-sm font-medium text-slate-700 dark:text-slate-200" }, "Rating"),
                  h(RatingStarPicker, { value: rating, onChange: setRating }),
                  h("p", { className: "mt-1 text-xs text-slate-500 dark:text-slate-400" }, `${rating} of 5 stars`)
                ]),
                h("div", { key: "comm", className: "mt-3" }, h(Field, { label: "Comment (optional)" }, h(TextArea, { value: comment, onChange: (e) => setComment(e.target.value), rows: 4, placeholder: "Quality, would you recommend it?" }))),
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
              h("div", { key: "need", className: "mt-3 space-y-2 text-sm text-slate-500 dark:text-slate-400" }, [
                h("p", null, "You can leave a review after this item is on a paid order (paid, processing, sent_for_delivery, or delivered)."),
                h(Link, { to: "/orders", className: "font-medium text-sky-600 hover:underline dark:text-sky-300" }, "View my orders →"),
                h("p", { className: "text-xs" }, "Tip: use Rate on My orders to review here, or add ?orderId=… to this page’s address bar so we can match the right purchase.")
              ]),
            accessToken &&
              reviewStatus &&
              !reviewStatus.canSubmit &&
              !reviewStatus.hasReview &&
              reviewStatus.reason === "order_not_eligible" &&
              h("p", { key: "bad-ord", className: "mt-3 text-sm text-amber-700 dark:text-amber-200/90" }, "This order cannot be used for a review on this product. Pick another order from My orders or remove ?orderId from the address bar."),
            accessToken && reviewStatus?.hasReview &&
              h("p", { key: "done", className: "mt-3 text-sm text-emerald-600 dark:text-emerald-400" }, "You already reviewed this product."),
            !accessToken && !guestReviewSecret &&
              h(
                "p",
                { key: "guest", className: "mt-3 text-sm text-slate-500 dark:text-slate-400" },
                "Sign in to leave a review, or open this product from your guest order confirmation link."
              ),
            h("div", { key: "list", className: "mt-4 space-y-3" }, [
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
        ]),
        h("div", { key: "info", className: "space-y-5 lg:col-start-2 lg:row-start-1" }, [
          h("div", { key: "hd" }, [
            h("div", { key: "hd-top", className: "flex flex-wrap items-start justify-between gap-3" }, [
              h("div", { key: "titles", className: "min-w-0 flex-1 space-y-1" }, [
                h("h1", { className: "font-display text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl" }, product.name),
                h("p", { className: "text-sm text-slate-500 dark:text-slate-400" }, CATEGORY_LABELS[product.category] || product.category)
              ]),
              h(
                "button",
                {
                  key: "save-det",
                  type: "button",
                  className:
                    "tap-target shrink-0 rounded-xl border border-slate-200/90 bg-white/80 p-2.5 text-slate-400 shadow-sm transition hover:border-rose-200 hover:text-rose-500 dark:border-white/10 dark:bg-night-900/60 dark:hover:border-rose-500/40",
                  "aria-label": isSaved(product.id) ? "Remove from saved" : "Save item",
                  "aria-pressed": isSaved(product.id),
                  onClick: (e) => {
                    e.preventDefault();
                    toggleSaved(product.id).catch(() => {});
                  }
                },
                h(Heart, {
                  className: `h-6 w-6 ${isSaved(product.id) ? "fill-rose-500 text-rose-500" : ""}`
                })
              )
            ]),
              avgRating != null &&
              h("div", { key: "avg", className: "mt-3 flex flex-wrap items-center gap-2 text-sm" }, [
                h(ReviewStars, { key: "st", value: avgRating }),
                h("span", { className: "font-semibold text-slate-700 dark:text-slate-200" }, String(avgRating)),
                h("span", { className: "text-slate-500" }, `(${reviews.length} review${reviews.length === 1 ? "" : "s"})`)
              ]),
              (() => {
                const socialLines = productSocialProofLines(product);
                if (!socialLines.length) return null;
                return h(
                  "p",
                  { key: "social-proof", className: "mt-2 text-sm text-slate-600 dark:text-slate-400" },
                  socialLines.map((ln) => ln.text).join(" · ")
                );
              })()
          ]),
          h(RestaurantContextPanel, { key: "store-ctx", product }),
          pricingPanel,
          !offlineListing &&
            showsCustomizeUi &&
            h(ProductCustomizationPanel, {
              key: "customize",
              product,
              selectedLabels: selectedAddonLabels,
              onChange: setSelectedAddonLabels,
              orderNotes,
              onOrderNotesChange: setOrderNotes,
              pricingOpts
            }),
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
          h(GlassPanel, { key: "desc", className: "!border-white/10" }, [
            h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, "Description"),
            h("p", { className: "mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-200" }, product.description || "No description provided.")
          ]),
          offlineListing &&
            h(GlassPanel, { key: "offline-inq", className: "!mt-4 !border-sky-500/25" }, [
              h(
                "h2",
                { className: "text-lg font-semibold text-slate-900 dark:text-white" },
                foodC2O ? "Send an order request" : "Request this service"
              ),
              h(
                "p",
                { className: "mt-1 text-xs text-slate-500 dark:text-slate-400" },
                foodC2O
                  ? "Food is call-to-order — describe what you want and when. The restaurant gets an in-app notification."
                  : "Send a booking-style message to the seller. They get an in-app notification (and can follow up however you agree)."
              ),
              h(
                "div",
                {
                  key: "inq-cust",
                  className:
                    "mt-5 rounded-2xl border border-sky-500/25 bg-sky-50/80 p-4 dark:border-sky-500/30 dark:bg-sky-950/30"
                },
                [
                  h("div", { className: "flex flex-wrap items-baseline justify-between gap-2" }, [
                    h("h3", { className: "text-base font-semibold text-slate-900 dark:text-white" }, "Customization"),
                    h("span", { className: "text-[10px] font-semibold uppercase tracking-wide text-slate-400" }, "Optional")
                  ]),
                  h(
                    "p",
                    { className: "mt-1 text-xs text-slate-600 dark:text-slate-400" },
                    foodC2O
                      ? "Allergies, no wele/extras, spice level — sellers see this on the order."
                      : "Timing, preferences, exclusions, scope — sellers see this on your request."
                  )
                ]
              ),
              h(
                Field,
                { key: "inq-when", label: foodC2O ? "When do you need it? (optional)" : "Preferred timing (optional)" },
                h(TextInput, {
                  value: svcPreferredTime,
                  onChange: (e) => setSvcPreferredTime(e.target.value.slice(0, 500)),
                  placeholder: foodC2O
                    ? "e.g. Today 6pm · tomorrow lunch · pickup after 3pm"
                    : "e.g. Weekday afternoons · before 6pm Saturday"
                })
              ),
              h(
                Field,
                { key: "inq-msg", label: "Notes for seller" },
                h(TextArea, {
                  value: svcMessage,
                  onChange: (e) => setSvcMessage(e.target.value.slice(0, 4000)),
                  rows: 5,
                  placeholder: foodC2O
                    ? "Example: No wele · extra shito on the side"
                    : "Example: Deadline next week · include materials · contact via WhatsApp"
                })
              ),
              h(
                Button,
                {
                  key: "inq-go",
                  className: "mt-3 w-full sm:w-auto",
                  type: "button",
                  variant: "primary",
                  loading: svcSubmitting,
                  disabled: !accessToken,
                  onClick: () => void submitOfflineInquiry()
                },
                accessToken
                  ? foodC2O
                    ? "Send order request"
                    : "Send request to seller"
                  : "Sign in to send a request"
              )
            ]),
          h(
            Button,
            {
              key: "add",
              variant: offlineListing ? "ghost" : "primary",
              className: `w-full !rounded-2xl !py-3 sm:w-auto sm:!px-10 ${offlineListing ? "!border-slate-300/60 dark:!border-white/20" : ""}`,
              type: "button",
              disabled: !canBuy,
              onClick: tryAdd
            },
            [
              canBuy ? h(ShoppingCart, { key: "ic", className: "h-5 w-5" }) : null,
              h(
                "span",
                { key: "tx" },
                offlineListing
                  ? svc
                    ? "Use the request form above"
                    : foodC2O
                      ? "Use the form above to place your order"
                      : "Contact seller from listing"
                  : !canBuy
                    ? "Out of stock"
                    : showsCustomizeUi && unitPayTotal != null
                      ? `Buy · ${formatGhc(unitPayTotal)}`
                      : "Buy"
              )
            ].filter(Boolean)
          ),
          accessToken
            ? h(
                "div",
                { key: "rep", className: "flex justify-end" },
                h(
                  Link,
                  {
                    to: `/reports?product=${encodeURIComponent(product.id)}`,
                    className:
                      "inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/60 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:border-rose-200 hover:bg-rose-50/70 hover:text-rose-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:border-rose-500/30 dark:hover:bg-rose-950/30 dark:hover:text-rose-300"
                  },
                  [
                    h(Flag, { key: "i", className: "h-3.5 w-3.5" }),
                    h("span", { key: "l" }, "Report this listing")
                  ]
                )
              )
            : null
        ])
      ]),
      h(BuyerProductDiscoveryRail, { key: "rail-exp", title: relatedExploreTitle, products: relatedExplore }),
      h(BuyerProductDiscoveryRail, { key: "rail-sim", title: relatedSimilarTitle, products: relatedSimilar }),
      h(BuyerProductDiscoveryRail, {
        key: "rail-together",
        title: relatedTogetherTitle,
        products: relatedTogether
      })
    ])
    ),
    h(CartDrawer, { key: "cart", open: cartOpen, onClose: () => setCartOpen(false) })
  ]);
}

/** ~4 rows on 3-col mobile / ~3 rows on 4-col desktop before "Great value" rail. */
const BROWSE_ROWS_BEFORE_GREAT_VALUE = 12;

function BrowseMenuItemCard({ product, isSaved, toggleSaved, onAddToCart, onNavigate }) {
  const p = product;
  const pricingOpts = useCheckoutPricingOptions();
  const detailTo = `/products/${p.id}`;
  const quoteCard = usesRequestInsteadOfCart(p);
  const foodCard = isFoodCallToOrderCategory(p);
  const showsCustomize = productShowsCustomizationUi(p);
  const listP = Number(p.price) || 0;
  const displayP = quoteCard || foodCard ? listP : buyerDisplayPrice(listP, pricingOpts, 1);
  const cmpAt = Number(p.compareAtPrice);
  const strikeCmp = Number.isFinite(cmpAt) && cmpAt > listP && listP >= 0;
  const storeCtx = productStoreContext(p);
  const socialLines = productSocialProofLines(p);

  return h(
    "div",
    {
      key: p.id,
      className:
        "group flex flex-col overflow-hidden rounded-xl border border-slate-200/95 bg-white p-2 shadow-sm transition hover:shadow-md dark:border-white/10 dark:bg-night-900/55 sm:p-4"
    },
    [
      h("div", { key: "img", className: "relative" }, [
        storefrontBadgeStack(p),
        h(ProductCardRotatingImage, {
          key: "rot",
          product: p,
          linkTo: detailTo,
          linkClassName:
            "relative block overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500",
          imageClassName:
            "h-28 w-full object-cover transition duration-300 group-hover:scale-[1.02] sm:h-40 md:h-48",
          dotsClassName: "pointer-events-none absolute bottom-2 left-0 right-0 z-[2] flex justify-center gap-1"
        })
      ]),
      h("div", { key: "meta", className: "mt-3 flex flex-1 flex-col" }, [
        h("div", { key: "title-row", className: "flex items-start gap-1.5" }, [
          h(
            "div",
            { key: "ttl-b", className: "min-w-0 flex-1" },
            h(
              Link,
              {
                key: "titles",
                to: detailTo,
                className: "block min-w-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              },
              h(
                "h3",
                {
                  className:
                    "line-clamp-2 text-xs font-semibold leading-snug text-slate-900 underline-offset-2 hover:underline dark:text-white sm:text-sm sm:text-[15px]"
                },
                p.name
              )
            )
          ),
          h(
            "button",
            {
              key: "wish",
              type: "button",
              className:
                "tap-target shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-500 dark:hover:bg-white/10",
              "aria-label": isSaved(p.id) ? "Remove from saved" : "Save item",
              "aria-pressed": isSaved(p.id),
              onClick: (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleSaved(p.id).catch(() => {});
              }
            },
            h(Heart, { className: `h-5 w-5 ${isSaved(p.id) ? "fill-rose-500 text-rose-500" : ""}` })
          )
        ]),
        h("div", { key: "vendor", className: "mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5" }, [
          h(Store, { key: "ic", className: "h-3.5 w-3.5 shrink-0 text-sky-500 dark:text-sky-400", "aria-hidden": true }),
          storeCtx.href
            ? h(
                Link,
                {
                  key: "store-nm",
                  to: storeCtx.href,
                  onClick: (e) => e.stopPropagation(),
                  className: "text-[11px] font-bold uppercase tracking-wide text-sky-700 hover:underline dark:text-sky-300"
                },
                storeCtx.name
              )
            : h(
                "span",
                {
                  key: "store-nm",
                  className: "text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                },
                storeCtx.name
              )
        ]),
        socialLines.length
          ? h(
              "p",
              {
                key: "social",
                className: "mt-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400"
              },
              socialLines.map((ln) => ln.text).join(" · ")
            )
          : null,
        quoteCard
          ? h(
              "p",
              {
                key: "svc-pr",
                className: `mt-3 text-sm font-semibold leading-snug ${foodCard ? "text-violet-900 dark:text-violet-50" : "text-amber-800 dark:text-amber-100"}`
              },
              foodCard ? "Buy" : "See listing for pricing & scope"
            )
          : h("div", { key: "prices", className: "mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1" }, [
              strikeCmp
                ? h(
                    "span",
                    { key: "strike", className: "text-xs font-semibold text-slate-400 line-through dark:text-slate-500" },
                    formatGhc(cmpAt)
                  )
                : null,
              h(
                "span",
                { key: "list", className: "text-sm font-extrabold text-sky-700 sm:text-lg dark:text-sky-200" },
                formatGhc(displayP)
              ),
            ])
      ]),
      h(
        Button,
        {
          key: "add",
          variant: "ghost",
          className:
            "mt-2 w-full !justify-center !rounded-xl border border-sky-500/60 !bg-transparent !text-xs !font-semibold !text-sky-700 hover:!bg-sky-50 sm:mt-4 sm:!text-sm dark:border-sky-400/45 dark:!text-sky-100 dark:hover:!bg-sky-950/35",
          type: "button",
          disabled: !quoteCard && !canAddProductToCart(p),
          onClick: () => {
            if (quoteCard || showsCustomize || productAddonDefs(p).length > 0) {
              onNavigate(detailTo);
              return;
            }
            onAddToCart(p);
          }
        },
        [
          quoteCard ? null : h(ShoppingCart, { key: "ic", className: "h-4 w-4" }),
          h(
            "span",
            { key: "tx" },
            quoteCard
              ? foodCard
                ? "Place Order"
                : "View listing"
              : !canAddProductToCart(p)
                ? "Out of stock"
                : showsCustomize || productAddonDefs(p).length > 0
                  ? "Customize & buy"
                  : "Buy"
          )
        ].filter(Boolean)
      )
    ].filter(Boolean)
  );
}

function browseMenuGridClassName() {
  return "grid grid-cols-3 gap-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5";
}

function ShopHomeRecommendationRow({ row, className = "mb-7" }) {
  if (!row) return null;
  const railRef = useRef(null);
  const trackRef = useRef(null);
  const cards = Array.isArray(row.products) ? row.products : [];
  if (!cards.length) return null;
  const marqueeCards = cards.length > 1 ? [...cards, ...cards] : cards;

  useEffect(() => {
    const viewport = railRef.current;
    const track = trackRef.current;
    if (!viewport || !track || typeof window === "undefined") return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return undefined;
    if (cards.length <= 1) return undefined;

    let rafId = 0;
    let paused = false;
    const speed = 0.35;
    let x = 0;

    const tick = () => {
      if (!track || paused) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }
      const loopWidth = track.scrollWidth / 2;
      if (!Number.isFinite(loopWidth) || loopWidth <= viewport.clientWidth + 4) {
        rafId = window.requestAnimationFrame(tick);
        return;
      }

      x += speed;
      if (x >= loopWidth) {
        x -= loopWidth;
      }
      track.style.transform = `translate3d(${-x}px,0,0)`;
      rafId = window.requestAnimationFrame(tick);
    };

    const pause = () => {
      paused = true;
    };
    const resume = () => {
      paused = false;
    };

    viewport.addEventListener("mouseenter", pause);
    viewport.addEventListener("mouseleave", resume);
    viewport.addEventListener("touchstart", pause, { passive: true });
    viewport.addEventListener("touchend", resume, { passive: true });
    viewport.addEventListener("focusin", pause);
    viewport.addEventListener("focusout", resume);

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
      viewport.removeEventListener("mouseenter", pause);
      viewport.removeEventListener("mouseleave", resume);
      viewport.removeEventListener("touchstart", pause);
      viewport.removeEventListener("touchend", resume);
      viewport.removeEventListener("focusin", pause);
      viewport.removeEventListener("focusout", resume);
      if (track) track.style.transform = "translate3d(0,0,0)";
    };
  }, [row?.id, cards.length]);

  if (!cards.length) return null;

  return h("div", { className, key: row.id || row.title }, [
    h("div", { key: "hdr", className: "mb-2 flex items-center gap-2" }, [
      h(Sparkles, { key: "ic", className: "h-4 w-4 shrink-0 text-sky-500 dark:text-sky-400", "aria-hidden": true }),
      h(
        "h3",
        {
          key: "t",
          className: "font-display text-base font-semibold tracking-tight text-slate-900 dark:text-white sm:text-lg"
        },
        row.title
      )
    ]),
    h(
      "div",
      {
        key: "rail",
        ref: railRef,
        className: "no-scrollbar -mx-4 overflow-hidden px-4 pb-1 sm:-mx-0 sm:px-0"
      },
      h(
        "div",
        {
          key: "track",
          ref: trackRef,
          className: "flex w-max gap-3 sm:gap-3.5 will-change-transform"
        },
        marqueeCards.map((p, idx) => h(MenuItemFeedCard, { key: `${p.id}-${idx}`, product: p, compact: true }))
      )
    )
  ]);
}

/** Shop home: algorithm rails from GET /api/products/recommended (personalized when signed in). */
function ShopHomeRecommendationRails({ rows, loading, err }) {
  if (err)
    return h(
      "p",
      { key: "rec-err", className: "mb-6 text-sm text-amber-800 dark:text-amber-200/90" },
      String(err)
    );
  if (loading && (!rows || !rows.length))
    return h(
      "p",
      { key: "rec-load", className: "mb-6 text-sm text-slate-500 dark:text-slate-400" },
      "Loading recommendations for you…"
    );
  if (!rows || !rows.length) return null;
  return h(
    "section",
    {
      key: "home-rec",
      className: "mb-8 space-y-7",
      "aria-label": "Recommended for you"
    },
    rows.map((row) => h(ShopHomeRecommendationRow, { key: row.id || row.title, row }))
  );
}

/** Discovery grid on product detail (“Explore your interests”, “More in …”). */
function BuyerProductDiscoveryRail({ title, products }) {
  if (!Array.isArray(products) || products.length === 0) return null;
  return h("div", { className: "mt-12 border-t border-white/10 pt-10", "aria-label": title }, [
    h(
      "div",
      { key: "h", className: "mb-3 flex items-center gap-2" },
      [
        h(Sparkles, { key: "ic", className: "h-5 w-5 shrink-0 text-sky-500 dark:text-sky-400", "aria-hidden": true }),
        h(
          "h2",
          {
            key: "t",
            className: "font-display text-base font-semibold tracking-tight text-slate-900 dark:text-white sm:text-lg"
          },
          title
        )
      ]
    ),
    h(
      "div",
      { key: "grid", className: browseMenuGridClassName() },
      products.map((p) =>
        h(MenuItemFeedCard, {
          key: p.id,
          product: p,
          layout: "grid",
          showSave: true,
          showQuickAdd: true
        })
      )
    )
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

/**
 * Compact top nav link (buyer / guest shell — no sidebar).
 * Optional `activeWhen` resolves highlight when pathname match alone is not enough (e.g. `/` vs `/#buyer-shop-grid`).
 */
function BuyerNavbarNavLink({ to, end, icon: Icon, label, activeWhen, labelOnMobile = false }) {
  const loc = useLocation();
  const resolveActive = (pathActive) =>
    typeof activeWhen === "function" ? activeWhen({ pathActive, loc }) : pathActive;
  return h(NavLink, {
    to,
    end: Boolean(end),
    title: label,
    "aria-label": label,
    className: ({ isActive }) => {
      const on = resolveActive(isActive);
      return `inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1.5 text-[11px] font-medium transition sm:gap-1.5 sm:px-2.5 sm:text-xs ${
        on
          ? "bg-sky-600 text-white shadow-sm dark:bg-sky-600"
          : "text-slate-700 hover:bg-white/45 dark:text-slate-200 dark:hover:bg-white/10"
      }`;
    },
    children: ({ isActive }) => {
      const on = resolveActive(isActive);
      return h(f, null, [
        h(Icon, {
          key: "ic",
          className: `h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4 ${on ? "text-white" : "opacity-85"}`
        }),
        h("span", { key: "tx", className: labelOnMobile ? "whitespace-nowrap text-[11px] sm:text-xs" : "hidden sm:inline" }, label)
      ]);
    }
  });
}

/**
 * Scrollable tab row: centered when it fits (`mx-auto` + `w-max`); when wider than the slot,
 * overflow scroll starts at the first tab (avoids `justify-center` on the flex + overflow clipping).
 */
function buyerTabsScrollWrap(pillNodes) {
  return h(
    "div",
    {
      className: "no-scrollbar min-w-0 max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch]"
    },
    h(
      "div",
      {
        className: "mx-auto flex w-max shrink-0 items-center justify-start gap-1 px-0.5 pb-0.5 sm:gap-1.5"
      },
      pillNodes
    )
  );
}

/** Short labels for category dropdown in the sidebar. */
const STOREFRONT_CATEGORY_SHORT = {
  all: "All",
  food_drinks: "Food",
  fashion_accessories: "Fashion",
  electronics_gadgets: "Electronics",
  beauty_personal_care: "Beauty",
  babies_infants: "Babies",
  services: "Services",
  books_academic: "Books",
  groceries_essentials: "Groceries"
};

const STOREFRONT_CATEGORY_ICONS = {
  all: LayoutGrid,
  food_drinks: Utensils,
  fashion_accessories: Shirt,
  electronics_gadgets: Cpu,
  beauty_personal_care: Sparkles,
  babies_infants: Baby,
  services: Wrench,
  books_academic: BookOpen,
  groceries_essentials: ShoppingBasket
};

/** Sidebar: Categories toggle reveals the marketplace category list. */
function SidebarCategoriesDropdown({ active, onSelect, onItemClick }) {
  const [open, setOpen] = useState(false);
  const activeShort = STOREFRONT_CATEGORY_SHORT[active] ?? CATEGORY_LABELS[active] ?? "All";

  const pick = (id) => {
    onSelect(id);
    setOpen(false);
    onItemClick?.();
    const grid = document.getElementById("buyer-shop-grid");
    if (grid) grid.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return h("div", { key: "cat-dd", className: `mb-3 ${open ? "relative z-30" : ""}` }, [
    h(
      "button",
      {
        key: "toggle",
        type: "button",
        "aria-expanded": open,
        "aria-controls": "storefront-category-list",
        onClick: () => setOpen((o) => !o),
        className: `flex w-full items-center gap-2 rounded-lg border px-2 py-2 text-left text-[13px] font-semibold leading-snug transition ${
          open
            ? "border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-500/45 dark:bg-sky-950/40 dark:text-sky-100"
            : "border-slate-200/90 bg-white text-slate-800 shadow-sm hover:border-sky-200 hover:bg-sky-50/70 dark:border-white/10 dark:bg-night-900/50 dark:text-slate-100 dark:hover:border-sky-500/30"
        }`
      },
      [
        h(LayoutGrid, {
          key: "ic",
          className: "h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300",
          strokeWidth: 2
        }),
        h("span", { key: "lb", className: "min-w-0 flex-1" }, "Categories"),
        h("span", { key: "cur", className: "truncate text-[11px] font-medium text-slate-500 dark:text-slate-400" }, activeShort),
        h(ChevronDown, {
          key: "ch",
          className: `h-4 w-4 shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${open ? "rotate-180" : ""}`,
          strokeWidth: 2
        })
      ]
    ),
    open
      ? h(
          "div",
          {
            key: "list",
            id: "storefront-category-list",
            role: "listbox",
            "aria-label": "Product categories",
            className:
              "mt-1.5 rounded-lg border border-slate-200/90 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-night-900/95"
          },
          withAllCategoryFirst(CATEGORIES).map((c) => {
            const Icon = STOREFRONT_CATEGORY_ICONS[c.id] || LayoutGrid;
            const isOn = active === c.id;
            const label = c.id === "all" ? "All categories" : c.label;
            return h(
              "button",
              {
                key: c.id,
                type: "button",
                role: "option",
                "aria-selected": isOn,
                onClick: () => pick(c.id),
                className: `flex w-full items-start gap-2 px-2.5 py-2 text-left text-[12px] font-medium leading-snug transition sm:text-[13px] ${
                  isOn
                    ? "bg-sky-50 text-sky-950 dark:bg-sky-950/50 dark:text-sky-100"
                    : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5"
                }`
              },
              [
                h(Icon, {
                  key: "ic",
                  className: `mt-0.5 h-4 w-4 shrink-0 ${isOn ? "text-sky-600 dark:text-sky-300" : "text-slate-500 dark:text-slate-400"}`,
                  strokeWidth: 2
                }),
                h("span", { key: "tx", className: "min-w-0 flex-1 whitespace-normal" }, label)
              ]
            );
          })
        )
      : null
  ]);
}

/** Storefront sidebar: categories dropdown, browse filters, discover links, price filters. */
function BuyerStorefrontAside({
  cat,
  setCat,
  fil,
  setFil,
  minPriceIn,
  maxPriceIn,
  setMinPriceIn,
  setMaxPriceIn,
  applyPriceRange,
  clearPriceRange,
  priceFilterCaption,
  onItemClick,
  navigate
}) {
  const row = (key, Icon, label, opts) => {
    const active = opts?.active;
    return h(
      "button",
      {
        key,
        type: "button",
        onClick: () => {
          opts?.onClick?.();
          onItemClick?.();
        },
        className: `flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[13px] font-medium leading-snug transition ${
          active ? "border border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-500/35 dark:bg-sky-950/40 dark:text-sky-100" : "border border-transparent text-slate-700 hover:bg-sky-50/70 dark:text-slate-200 dark:hover:bg-white/5"
        }`
      },
      [
        h(Icon, {
          key: "ic",
          className: `h-4 w-4 shrink-0 ${active ? "text-sky-600 dark:text-sky-300" : "text-slate-500 dark:text-slate-400"}`,
          strokeWidth: 2
        }),
        h("span", { key: "lb", className: "min-w-0 flex-1" }, label)
      ]
    );
  };

  const linkRow = (key, Icon, label, to) =>
    h(
      NavLink,
      {
        key,
        to,
        end: to === "/",
        onClick: () => onItemClick?.(),
        className: ({ isActive }) =>
          `flex w-full items-center gap-2 rounded-lg px-2 py-2 text-[13px] font-medium leading-snug transition ${
            isActive
              ? "border border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-500/35 dark:bg-sky-950/40 dark:text-sky-100"
              : "border border-transparent text-slate-700 hover:bg-sky-50/70 dark:text-slate-200 dark:hover:bg-white/5"
          }`
      },
      [
        h(Icon, { key: "ic", className: "h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400", strokeWidth: 2 }),
        h("span", { key: "lb", className: "min-w-0 truncate" }, label)
      ]
    );

  return h(
    "div",
    { className: "flex h-full min-h-0 flex-col gap-0 overflow-y-auto p-2.5 lg:p-3" },
    [
      h(SidebarCategoriesDropdown, {
        key: "categories",
        active: cat,
        onSelect: setCat,
        onItemClick
      }),
      h(
        "div",
        {
          key: "browse-filters",
          className: "mb-2 flex flex-col gap-0.5",
          role: "group",
          "aria-label": "Browse: all listings, sales, new, or popular"
        },
        withAllCategoryFirst(FILTERS).map((fitem) =>
          h(
            "button",
            {
              key: fitem.id,
              type: "button",
              onClick: () => {
                setFil(fitem.id);
                onItemClick?.();
              },
              className: `w-full rounded-md px-2 py-1.5 text-left text-[13px] font-semibold leading-tight transition ${
                fil === fitem.id
                  ? "border border-sky-200 bg-sky-50 text-sky-950 shadow-sm dark:border-sky-500/35 dark:bg-sky-950/40 dark:text-sky-100"
                  : "border border-transparent text-slate-700 hover:bg-sky-50/70 dark:text-slate-200 dark:hover:bg-white/5"
              }`
            },
            fitem.label
          )
        )
      ),
      h("p", { key: "u-h", className: "mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400" }, "Discover"),
      linkRow("browse-stores", Building2, "Browse stores", "/browse-stores"),
      row("saved", Bookmark, "Saved items", {
        onClick: () => navigate("/saved")
      }),
      row("recent", LayoutGrid, "Recently viewed", {
        onClick: () => {
          const el = document.getElementById("buyer-recently-viewed");
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          else {
            const grid = document.getElementById("buyer-shop-grid");
            if (grid) grid.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        }
      }),
      linkRow("help", Headphones, "Help & support", "/support"),
      h(
        "div",
        {
          key: "side-price-wrap",
          className: "mt-3",
          title: "Uses seller list prices with categories and search."
        },
        h(
          GlassCard,
          {
            key: "side-price",
            className:
              "!border-slate-200/90 !bg-white/95 !p-2 !shadow-sm dark:!border-white/10 dark:!bg-night-900/60"
          },
        [
          h(
            "p",
            {
              key: "t",
              className: "px-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-600 dark:text-sky-400"
            },
            "Price (GHS)"
          ),
          h("div", { key: "row", className: "mt-1.5 grid grid-cols-2 gap-1.5" }, [
            h("label", { key: "lmin", className: "block" }, [
              h("span", { key: "min-lbl", className: "block text-[9px] font-medium text-slate-500 dark:text-slate-400" }, "Min"),
              h(TextInput, {
                key: "min-inp",
                type: "number",
                min: 0,
                step: 1,
                value: minPriceIn,
                onChange: (e) => setMinPriceIn(e.target.value),
                onKeyDown: (e) => {
                  if (e.key === "Enter") applyPriceRange();
                },
                className: "!min-h-0 !h-8 !rounded-lg !px-2 !py-1 !text-xs !leading-tight",
                placeholder: "Any",
                "aria-label": "Minimum price in GHS"
              })
            ]),
            h("label", { key: "lmax", className: "block" }, [
              h("span", { key: "max-lbl", className: "block text-[9px] font-medium text-slate-500 dark:text-slate-400" }, "Max"),
              h(TextInput, {
                key: "max-inp",
                type: "number",
                min: 0,
                step: 1,
                value: maxPriceIn,
                onChange: (e) => setMaxPriceIn(e.target.value),
                onKeyDown: (e) => {
                  if (e.key === "Enter") applyPriceRange();
                },
                className: "!min-h-0 !h-8 !rounded-lg !px-2 !py-1 !text-xs !leading-tight",
                placeholder: "Any",
                "aria-label": "Maximum price in GHS"
              })
            ])
          ]),
          h("div", { key: "act", className: "mt-1.5 flex gap-1" }, [
            h(
              Button,
              {
                key: "apply",
                type: "button",
                variant: "primary",
                className: "min-w-0 flex-1 !min-h-0 !rounded-lg !py-1.5 !text-[11px] !font-semibold",
                onClick: applyPriceRange
              },
              "Apply"
            ),
            h(
              Button,
              {
                key: "clear",
                type: "button",
                variant: "ghost",
                className: "min-w-0 flex-1 !min-h-0 !rounded-lg !py-1.5 !text-[11px] !font-semibold",
                onClick: () => clearPriceRange()
              },
              "Clear"
            )
          ]),
          priceFilterCaption
            ? h(
                "p",
                { key: "cap", className: "mt-1 px-0.5 text-[9px] font-medium leading-tight text-sky-700 dark:text-sky-300" },
                `Active: ${priceFilterCaption}`
              )
            : null
        ]
        )
      )
    ].filter(Boolean)
  );
}

export function BuyerLayout({
  children,
  onOpenCart,
  title,
  hideSearch,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  shoppingAssistant = true,
  searchPlaceholder = "Search products, brands…",
  storefront = false,
  storefrontAsideProps = null
}) {
  const { dark, toggle } = useTheme();
  const { count } = useCart();
  const { accessToken, logout, user, setUser } = useAuth();
  const nav = useNavigate();
  const [asideOpen, setAsideOpen] = useState(false);

  const onLogout = async () => {
    await logout();
    nav("/login", { replace: true });
  };

  const submitSearch = () => {
    onSearchSubmit?.();
  };

  const headerCartBtn = h(
    "button",
    {
      key: "cart-hdr",
      type: "button",
      title: "Cart",
      "aria-label": `Cart${count > 0 ? `, ${count} items` : ""}`,
      className:
        "tap-target relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-700 transition hover:bg-sky-50 dark:text-slate-200 dark:hover:bg-white/10",
      onClick: () => onOpenCart()
    },
    [
      h(ShoppingCart, {
        key: "i",
        className: "h-[1.35rem] w-[1.35rem] shrink-0 text-sky-600 dark:text-sky-400"
      }),
      count > 0 &&
        h(
          "span",
          {
            key: "c",
            className:
              "absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] font-bold text-white"
          },
          count > 99 ? "99+" : String(count)
        )
    ].filter(Boolean)
  );

  const topNavLinks = [
    h(BuyerNavbarNavLink, {
      key: "dash",
      to: "/",
      end: true,
      icon: LayoutGrid,
      label: "Dashboard",
      activeWhen: ({ pathActive, loc }) => pathActive && !loc.hash
    }),
    h(BuyerNavbarNavLink, {
      key: "stores",
      to: "/browse-stores",
      icon: Building2,
      label: "Stores",
      activeWhen: ({ loc }) => loc.pathname === "/browse-stores"
    }),
    h(BuyerNavbarNavLink, { key: "ord", to: "/orders", icon: Package, label: "Orders" }),
    accessToken && h(BuyerNavbarNavLink, { key: "msg", to: "/messages", icon: MessageSquare, label: "Messages" }),
    accessToken && h(BuyerNavbarNavLink, { key: "rep", to: "/reports", icon: AlertTriangle, label: "Reports" }),
    h(BuyerNavbarNavLink, { key: "prof", to: "/profile", icon: User, label: "Profile" })
  ].filter(Boolean);

  const vendorPendingBanner =
    accessToken &&
    user?.role === "buyer" &&
    user?.vendorStatus === "pending" &&
    h(
      "div",
      {
        key: "vpend",
        className:
          "rounded-lg border border-amber-400/35 bg-amber-500/10 px-2 py-1 text-center text-[10px] font-medium text-amber-950 dark:text-amber-100 sm:text-xs"
      },
      "Vendor application pending review"
    );

  const riderPendingBanner =
    accessToken &&
    user?.role === "buyer" &&
    user?.riderApplicationStatus === "pending" &&
    h(
      "div",
      {
        key: "rpend",
        className:
          "rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-2 py-1 text-center text-[10px] font-medium text-emerald-950 dark:text-emerald-100 sm:text-xs"
      },
      "Rider application pending review"
    );

  const dismissRoleDemotionNotice = async () => {
    if (!accessToken) return;
    try {
      await apiFetch("/api/auth/ack-role-notice", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    } catch {
      /* still hide locally */
    }
    setUser((prev) => (prev ? { ...prev, roleDemotionNotice: null } : prev));
  };

  const roleDemotionBanner =
    accessToken &&
    user?.roleDemotionNotice?.message &&
    h(InlineNotice, {
      key: "role-demote",
      variant: "warning",
      className: "mb-3",
      onDismiss: () => void dismissRoleDemotionNotice()
    }, user.roleDemotionNotice.message);

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
    headerCartBtn,
    accessToken && h(NotificationBell, { key: "bell", to: "/notifications" }),
    profileChip,
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

  if (storefront && storefrontAsideProps) {
    const asideNode = h(BuyerStorefrontAside, {
      ...storefrontAsideProps,
      navigate: nav,
      onItemClick: () => setAsideOpen(false)
    });

    const sfNavLinksArr = [
      h(BuyerNavbarNavLink, {
        key: "sfd",
        labelOnMobile: true,
        to: "/",
        end: true,
        icon: LayoutGrid,
        label: "Dashboard",
        activeWhen: ({ pathActive, loc }) => pathActive && !loc.hash
      }),
      h(BuyerNavbarNavLink, {
        key: "sfs",
        labelOnMobile: true,
        to: "/browse-stores",
        icon: Building2,
        label: "Stores",
        activeWhen: ({ loc }) => loc.pathname === "/browse-stores"
      }),
      h(BuyerNavbarNavLink, { key: "sfo", labelOnMobile: true, to: "/orders", icon: Package, label: "Orders" }),
      accessToken && h(BuyerNavbarNavLink, { key: "sfm", labelOnMobile: true, to: "/messages", icon: MessageSquare, label: "Messages" }),
      accessToken && h(BuyerNavbarNavLink, { key: "sfr", labelOnMobile: true, to: "/reports", icon: AlertTriangle, label: "Reports" }),
      h(BuyerNavbarNavLink, {
        key: "sfp",
        labelOnMobile: true,
        to: "/profile",
        icon: User,
        label: "Profile"
      })
    ].filter(Boolean);

    const headerActionsSf = [
      h(ThemeToggleButton, { key: "th", dark, onToggle: toggle }),
      headerCartBtn,
      accessToken && h(NotificationBell, { key: "bell", to: "/notifications" }),
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

    return h(React.Fragment, null, [
      h(
        "div",
        {
          key: "shell-storefront",
          className: "flex min-h-screen flex-col bg-slate-100 dark:bg-night-950 dark:bg-mesh-dark"
        },
        [
          h(
            "header",
            {
              key: "hdr-sf",
              className:
                "sticky top-0 z-40 border-b border-slate-200/90 bg-white shadow-sm dark:border-white/10 dark:bg-night-900/95 dark:backdrop-blur-xl"
            },
            h("div", { className: "mx-auto flex w-full max-w-[1720px] flex-col gap-2 px-3 py-2 sm:gap-2.5 sm:px-5 sm:py-2.5 lg:px-8" }, [
              h(
                "div",
                {
                  key: "sf-row-toolbar",
                  className: "flex flex-wrap items-center gap-x-3 gap-y-2"
                },
                [
                  h("div", { key: "sf-left", className: "flex min-w-0 items-center gap-2" }, [
                    h(
                      "button",
                      {
                        key: "menu",
                        type: "button",
                        className:
                          "tap-target inline-flex rounded-xl p-2 text-slate-600 hover:bg-sky-50 lg:hidden dark:text-slate-200 dark:hover:bg-white/10",
                        "aria-expanded": asideOpen,
                        "aria-controls": "storefront-buyer-drawer",
                        "aria-label": "Open menu",
                        onClick: () => setAsideOpen((o) => !o)
                      },
                      h(Menu, { className: "h-5 w-5" })
                    ),
                    h(
                      Link,
                      {
                        key: "brand-sf",
                        to: "/",
                        className: "flex min-w-0 shrink-0 items-center gap-2",
                        onClick: () => setAsideOpen(false)
                      },
                      [
                        h(LogoMark, { key: "lm", className: "h-8 w-8 sm:h-9 sm:w-9" }),
                        h("div", { key: "titles", className: "min-w-0 leading-tight" }, [
                          h(
                            "span",
                            {
                              key: "brand-t",
                              className: "font-display text-base font-bold text-slate-900 dark:text-white sm:text-lg"
                            },
                            "SHOPIQGH"
                          ),
                          title
                            ? h(
                                "span",
                                {
                                  key: "sub",
                                  className:
                                    "ml-2 inline-block max-w-[10rem] truncate align-middle text-[10px] font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-400 sm:max-w-[16rem]"
                                },
                                title
                              )
                            : null
                        ])
                      ])
                  ]),
                  h(
                    "div",
                    { key: "sf-nav-wrap", className: "hidden min-w-0 flex-1 items-center justify-center lg:flex" },
                    h(
                      "nav",
                      { "aria-label": "Main", className: "min-w-0 w-full max-w-full" },
                      buyerTabsScrollWrap(sfNavLinksArr)
                    )
                  ),
                  h("div", { key: "sf-actions", className: "ml-auto flex flex-wrap items-center justify-end gap-1 sm:gap-2" }, headerActionsSf)
                ]
              ),
              roleDemotionBanner,
              vendorPendingBanner,
              riderPendingBanner,
              h(
                "nav",
                {
                  key: "sf-nav-m",
                  className: "pb-0.5 lg:hidden",
                  "aria-label": "Main"
                },
                buyerTabsScrollWrap(sfNavLinksArr)
              )
            ])
          ),
          h("div", { key: "sf-body", className: "relative mx-auto flex w-full max-w-[1720px] flex-1 min-h-0" }, [
            h(
              "aside",
              {
                key: "sf-aside-d",
                className:
                  "sticky top-[4.75rem] hidden h-[calc(100vh-4.75rem)] w-[13.5rem] shrink-0 overflow-y-auto border-r border-slate-200/90 bg-white dark:border-white/10 dark:bg-night-900/50 lg:flex"
              },
              asideNode
            ),
            asideOpen &&
              h(
                "button",
                {
                  key: "backdrop",
                  type: "button",
                  className:
                    "fixed inset-0 z-[48] bg-slate-900/45 backdrop-blur-[1px] lg:hidden",
                  "aria-label": "Close menu",
                  tabIndex: -1,
                  onClick: () => setAsideOpen(false)
                }),
            asideOpen &&
              h(
                "aside",
                {
                  id: "storefront-buyer-drawer",
                  key: "sf-draw",
                  className:
                    "fixed left-0 top-0 z-[49] flex h-[100dvh] w-[min(15.5rem,88vw)] flex-col border-r border-slate-200 bg-white pt-[env(safe-area-inset-top)] shadow-xl dark:border-white/10 dark:bg-night-950 lg:hidden",
                  role: "dialog",
                  "aria-modal": true,
                  "aria-label": "Shop menu"
                },
                [
                  h("div", { key: "dr-head", className: "flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5 dark:border-white/10" }, [
                    h("span", { key: "dr-title", className: "text-sm font-bold text-slate-900 dark:text-white" }, "Menu"),
                    h(
                      "button",
                      {
                        key: "dr-close",
                        type: "button",
                        className: "tap-target rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10",
                        "aria-label": "Close menu",
                        onClick: () => setAsideOpen(false)
                      },
                      h(X, { className: "h-5 w-5" })
                    )
                  ]),
                  h("div", { key: "dr-body", className: "min-h-0 flex-1 overflow-y-auto" }, asideNode)
                ]
              ),
            h("main", { key: "sf-main", className: "min-w-0 flex-1" }, children)
          ])
        ]
      ),
      shoppingAssistant !== false && h(ShoppingAssistantFAB, { key: "assist" })
    ]);
  }

  return h(React.Fragment, null, [
    h("div", { key: "shell", className: "flex min-h-screen flex-col bg-slate-100 dark:bg-night-950 dark:bg-mesh-dark" }, [
    h("div", { key: "main-wrap", className: "flex min-h-screen min-w-0 flex-1 flex-col" }, [
      h(
        "header",
        {
          key: "hdr",
          className:
            "sticky top-0 z-40 border-b border-white/10 bg-white/30 shadow-sm backdrop-blur-xl dark:bg-night-900/40"
        },
        h("div", { className: "flex w-full flex-col gap-1.5 px-4 py-1.5 sm:gap-2 sm:px-6 sm:py-2 lg:px-8" }, [
          h("div", { key: "row-1-wrap", className: "flex w-full min-w-0 flex-col gap-1.5 sm:gap-2" }, [
            h(
              "div",
              {
                key: "row-1",
                className: "flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-3"
              },
              [
                h(Link, { key: "brand", to: "/", className: "flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2" }, [
                  h(LogoMark, { key: "lm", className: "h-8 w-8 sm:h-9 sm:w-9" }),
                  h("div", { key: "titles", className: "min-w-0 leading-tight" }, [
                    h(
                      "span",
                      { key: "brand", className: "font-display text-base font-bold text-slate-900 dark:text-white sm:text-lg" },
                      "SHOPIQGH"
                    ),
                    title
                      ? h(
                          "span",
                          {
                            key: "subtitle",
                            className:
                              "ml-1 inline-block max-w-[8rem] truncate align-middle rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300 sm:ml-2 sm:max-w-[14rem] sm:px-2 sm:text-[10px]"
                          },
                          title
                        )
                      : null
                  ])
                ]),
                h(
                  "div",
                  {
                    key: "topnav-desk",
                    className: "hidden min-w-0 flex-1 items-center justify-center md:flex"
                  },
                  h(
                    "nav",
                    { "aria-label": "Main", className: "min-w-0 w-full max-w-full" },
                    buyerTabsScrollWrap(topNavLinks)
                  )
                ),
                h("div", { key: "actions", className: "ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1 sm:gap-2" }, headerActions)
              ]
            ),
            h(
              "nav",
              {
                key: "topnav-m",
                className: "w-full min-w-0 md:hidden",
                "aria-label": "Main"
              },
              buyerTabsScrollWrap(topNavLinks)
            )
          ]),
          roleDemotionBanner,
          vendorPendingBanner,
          riderPendingBanner,
          !hideSearch &&
            h("div", { key: "row-search", className: "flex flex-1 items-center gap-2" }, [
              h("div", { key: "search-wrap", className: "relative flex flex-1 items-center" }, [
                h(Search, {
                  key: "ic-search",
                  className: "pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
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
                  placeholder: searchPlaceholder,
                  className:
                    "!h-9 !min-h-[36px] !rounded-full !py-0 !pl-9 !pr-[4.25rem] !text-sm"
                }),
                h(
                  Button,
                  {
                    key: "submit",
                    variant: "primary",
                    className:
                      "!absolute right-1 top-1/2 !h-7 !min-h-0 -translate-y-1/2 !rounded-full !px-3 !py-0 !text-xs",
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
  ]),
  shoppingAssistant !== false && h(ShoppingAssistantFAB, { key: "assist" })
]);
}

function CategoryRow({ active, onSelect }) {
  const icons = {
    all: Store,
    food_drinks: Utensils,
    fashion_accessories: Shirt,
    electronics_gadgets: Cpu,
    beauty_personal_care: Sparkles,
    babies_infants: Baby,
    services: Wrench,
    books_academic: BookOpen,
    groceries_essentials: ShoppingBasket
  };
  return h(
    "div",
    { className: "no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" },
    withAllCategoryFirst(CATEGORIES).map((c) => {
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

function storefrontBadgeStack(p) {
  const badges = productStorefrontBadges(p);
  if (!badges.length) return null;
  return h(
    "div",
    {
      key: "sf-bdg",
      className: "pointer-events-none absolute left-2 top-2 z-10 flex max-w-[calc(100%-1rem)] flex-wrap gap-1"
    },
    badges.map((b) =>
      h(
        "span",
        {
          key: b.key,
          className: `rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase leading-tight tracking-wide shadow-sm ring-1 ring-black/10 ${b.className}`
        },
        b.label
      )
    )
  );
}

function MarketplaceFooter() {
  const { accessToken, user } = useAuth();
  const showVendorApply =
    accessToken && user?.role === "buyer" && !["pending", "approved"].includes(String(user?.vendorStatus ?? ""));
  const showCourierApply =
    accessToken && user?.role === "buyer" && String(user?.riderApplicationStatus || "") !== "pending";
  const showVendorNavLink = !accessToken || showVendorApply;
  const showCourierNavLink = !accessToken || showCourierApply;

  const linkCls =
    "block text-[11px] leading-snug text-slate-400 transition hover:text-slate-100 sm:text-xs";
  const headCls = "mb-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 sm:text-[11px]";

  const companyLinks = [
    { to: "/about", label: "About Us" },
    { to: "/support", label: "Contact Us" },
    ...(showVendorNavLink ? [{ to: "/apply-vendor", label: "Become a vendor" }] : []),
    ...(showCourierNavLink ? [{ to: "/apply-courier", label: "Become a rider" }] : []),
    { to: "/terms", label: "Terms & Conditions" },
    { to: "/terms", label: "Privacy Policy" }
  ];

  const linkCol = (key, title, items) =>
    h("nav", { key, className: "min-w-0", "aria-label": title }, [
      h("p", { key: "h", className: headCls }, title),
      h(
        "ul",
        { key: "ul", className: "space-y-1.5" },
        items.map((it) =>
          h("li", { key: `${it.to}-${it.label}` }, h(Link, { to: it.to, className: linkCls }, it.label))
        )
      )
    ]);

  const trustChip = (k, Icon, label) =>
    h(
      "div",
      {
        key: k,
        className:
          "inline-flex max-w-full items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 sm:gap-2 sm:px-2.5 sm:py-1.5"
      },
      [
        h(Icon, {
          className: "h-3.5 w-3.5 shrink-0 text-sky-400/90 sm:h-4 sm:w-4",
          "aria-hidden": true
        }),
        h("span", { className: "text-[10px] font-medium leading-tight text-slate-300 sm:text-[11px]" }, label)
      ]
    );

  return h(
    "footer",
    {
      className: "mt-16 border-t border-white/10 bg-slate-950 text-slate-400",
      role: "contentinfo"
    },
    h("div", { className: "mx-auto w-full max-w-[1720px] px-4 py-8 sm:px-6 lg:px-8" }, [
      h(
        "div",
        {
          key: "grid",
          className: "grid gap-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-12"
        },
        [
          linkCol("co", "Company", companyLinks),
          linkCol("cs", "Customer Support", [
            { to: "/support", label: "Help Center" },
            { to: "/support#faq", label: "FAQs" },
            { to: "/terms", label: "Returns & Refunds" },
            { to: "/support#report", label: "Report a Problem" }
          ]),
          h("div", { key: "trust", className: "sm:col-span-2 lg:col-span-1" }, [
            h("p", { key: "h", className: `${headCls} mb-3` }, "Trust badges"),
            h(
              "div",
              {
                key: "row",
                className: "flex flex-wrap gap-2"
              },
              [
                trustChip("t1", Lock, "Secure Payments"),
                trustChip("t2", BadgeCheck, "Verified Vendors"),
                trustChip("t3", Truck, "Fast Delivery"),
                trustChip("t4", Shield, "Buyer Protection")
              ]
            )
          ])
        ]
      ),
      h(
        "div",
        {
          key: "copy",
          className: "mt-8 border-t border-white/10 pt-5 text-center text-[10px] text-slate-500 sm:text-[11px]"
        },
        `© ${new Date().getFullYear()} ${SITE_NAME}. All rights reserved.`
      )
    ])
  );
}

export function CartDrawer({ open, onClose }) {
  const { items, subtotal, setQty, remove, clear, setCustomization } = useCart();
  const nav = useNavigate();
  const pricingOpts = useCheckoutPricingOptions();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const hasBlockedLine = items.some((p) => usesRequestInsteadOfCart(p));

  const breakdown =
    pricingOpts && subtotal > 0
      ? computeCheckoutBreakdown(
          subtotal,
          pricingOpts.commissionPercent,
          pricingOpts.paystackFeePercent,
          pricingOpts.paystackFeeFixedGhs
        )
      : null;

  const checkout = () => {
    setErr("");
    if (items.length === 0 || subtotal <= 0 || hasBlockedLine) return;
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
            items.map((p) => {
              const lk = p._lineKey || `${p.id}::`;
              const blocked = usesRequestInsteadOfCart(p);
              return h(GlassCard, { key: lk, className: "!p-3" }, [
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
                    h(
                      "p",
                      {
                        key: "price",
                        className: `mt-1 text-sm font-bold ${blocked ? "text-amber-700 dark:text-amber-200" : "text-sky-600 dark:text-sky-300"}`
                      },
                      blocked
                        ? isFoodCallToOrderCategory(p)
                          ? "Food: buy from the listing — remove to check out other items"
                          : "Services: contact vendor — remove to check out other items"
                        : formatGhc(
                            buyerDisplayPrice(cartLineSellerUnit(p), pricingOpts, Number(p.qty) || 1)
                          )
                    ),
                    !blocked &&
                      Array.isArray(p.selectedAddonLabels) &&
                      p.selectedAddonLabels.length > 0 &&
                      h(
                        "p",
                        { key: "addons", className: "mt-1 text-[11px] text-violet-800 dark:text-violet-200" },
                        [
                          h("span", { className: "font-semibold" }, "Options: "),
                          p.selectedAddonLabels.join(", ")
                        ]
                      ),
                    !blocked && supportsCartCustomizationNotes(p)
                      ? h("div", { key: "cust", className: "mt-2" }, [
                          h(
                            "label",
                            { key: "lb", className: "mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500" },
                            "Customization"
                          ),
                          h(TextArea, {
                            value: String(p.customization || ""),
                            onChange: (e) => setCustomization(lk, e.target.value),
                            rows: 2,
                            className: "!min-h-[72px] !rounded-xl !text-xs",
                            placeholder: "No wele, allergies, spice level…",
                            "aria-label": `Customization for ${p.name}`
                          })
                        ])
                      : null,
                    h("div", { key: "qty", className: "mt-2 flex items-center gap-2" }, [
                      h(
                        "button",
                        {
                          key: "dec",
                          type: "button",
                          className: "tap-target rounded-xl border border-white/15 p-2 hover:bg-white/10",
                          onClick: () => setQty(lk, p.qty - 1)
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
                            setQty(lk, p.qty + 1);
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
                          onClick: () => remove(lk)
                        },
                        "Remove"
                      )
                    ])
                  ])
                ])
              ]);
            })
          ]),
          err
            ? h(InlineNotice, { key: "err", variant: "error", className: "mt-3", onDismiss: () => setErr("") }, err)
            : null,
          h("div", { key: "totals", className: "mt-6 space-y-2 border-t border-white/10 pt-4 text-sm" }, [
            h("div", { key: "total", className: "flex justify-between text-lg font-bold text-slate-900 dark:text-white" }, [
              h("span", { key: "l" }, "Total"),
              h("span", { key: "v" }, formatGhc(breakdown ? breakdown.total : Math.ceil(subtotal)))
            ])
          ]),
          h(
            Button,
            {
              key: "checkout",
              className: "mt-3 w-full !rounded-2xl",
              onClick: checkout,
              loading,
              disabled: items.length === 0 || subtotal <= 0 || hasBlockedLine
            },
            [h("span", { key: "tx" }, "Proceed to checkout "), h(ChevronRight, { key: "ic", className: "h-4 w-4" })]
          )
        ]
      )
    ]
  );
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

export function CheckoutPage() {
  const { user, accessToken } = useAuth();
  const { items, subtotal } = useCart();
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [redeemPts, setRedeemPts] = useState(0);
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [dropoffLabel, setDropoffLabel] = useState("");
  const [dropoffLat, setDropoffLat] = useState(null);
  const [dropoffLng, setDropoffLng] = useState(null);
  const [locatingDropoff, setLocatingDropoff] = useState(false);
  const [dropoffHint, setDropoffHint] = useState("");
  const pricingOpts = useCheckoutPricingOptions();
  const hasBlockedLine = items.some((p) => usesRequestInsteadOfCart(p));
  const needsDelivery = cartRequiresDelivery(items);

  const breakdown =
    pricingOpts && subtotal > 0
      ? computeCheckoutBreakdown(
          subtotal,
          pricingOpts.commissionPercent,
          pricingOpts.paystackFeePercent,
          pricingOpts.paystackFeeFixedGhs
        )
      : null;
  const totalStr = formatGhc(breakdown ? breakdown.total : subtotal);
  const pointsBal = Math.max(0, Math.floor(Number(user?.rewardPoints) || 0));
  const maxRedeemPts = accessToken ? Math.min(pointsBal, Math.max(0, Math.floor(subtotal * 100))) : 0;
  const redeemGhs = redeemPts > 0 ? redeemPts / 100 : 0;

  const useMyDropoffLocation = () => {
    setDropoffHint("");
    if (!navigator.geolocation) {
      setDropoffHint("Location is not available in this browser.");
      return;
    }
    setLocatingDropoff(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDropoffLat(pos.coords.latitude);
        setDropoffLng(pos.coords.longitude);
        setLocatingDropoff(false);
        setDropoffHint("Location saved — riders can find you on the live map.");
      },
      () => {
        setLocatingDropoff(false);
        setDropoffHint("Could not get location. Allow GPS or enter your address below.");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  /**
   * Paystack guide flow: backend creates the session; frontend POSTs checkout then `{ email, amount, orderId[, guestSecret] }`.
   */
  const handlePayNow = async () => {
    setErr("");
    if (!items.length) {
      setErr("Your cart is empty.");
      return;
    }
    if (hasBlockedLine || !(subtotal > 0)) {
      setErr(
        hasBlockedLine
          ? "Request-only food or service items can’t use cart checkout — remove them or open each listing to send a request."
          : "Your cart has nothing to bill."
      );
      return;
    }
    if (!accessToken) {
      const em = String(guestEmail || "").trim();
      const ph = String(guestPhone || "").trim();
      if (!em.includes("@") || ph.replace(/\D/g, "").length < 8) {
        setErr("Enter a valid email and phone number so we can confirm your order.");
        return;
      }
    } else {
      const email = (user && user.email && String(user.email).trim()) || "";
      if (!email) {
        setErr("Add an email to your account before paying, or sign in with email.");
        return;
      }
    }
    const dropLabel = String(dropoffLabel || "").trim();
    if (needsDelivery) {
      if (!dropLabel) {
        setErr("Enter where we should deliver (hostel, hall, landmark, or address).");
        return;
      }
      if (dropoffLat == null || dropoffLng == null) {
        setErr('Tap "Use my location" so couriers can find you on the live delivery map.');
        return;
      }
    }
    setLoading(true);
    try {
      const checkoutBody = {
        items: items.map((p) => ({
          productId: p.id,
          quantity: p.qty,
          customization: supportsCartCustomizationNotes(p) ? String(p.customization || "").trim().slice(0, 280) : "",
          ...(Array.isArray(p.selectedAddonLabels) && p.selectedAddonLabels.length
            ? { selectedAddonLabels: p.selectedAddonLabels }
            : {})
        })),
        ...(needsDelivery
          ? {
              dropoffLabel: dropLabel,
              dropoffLatitude: dropoffLat,
              dropoffLongitude: dropoffLng
            }
          : {}),
        ...(accessToken && redeemPts > 0 ? { redeemPoints: redeemPts } : {}),
        ...(!accessToken
          ? {
              guestEmail: String(guestEmail || "").trim(),
              guestPhone: String(guestPhone || "").trim()
            }
          : {})
      };
      const hdr = {};
      if (accessToken) hdr.Authorization = `Bearer ${accessToken}`;
      const checkoutRes = await apiFetch("/api/orders/checkout", {
        method: "POST",
        headers: hdr,
        json: checkoutBody
      });
      const order = checkoutRes.order;
      const guestAccessSecret = checkoutRes.guestAccessSecret;
      if (guestAccessSecret && order?.id) {
        setGuestOrderSecret(order.id, guestAccessSecret);
      }
      const payEmail = accessToken
        ? (user && user.email && String(user.email).trim()) || ""
        : String(guestEmail || "").trim();
      const payJson = {
        email: payEmail,
        amount: Number(order.total),
        orderId: order.id,
        ...(guestAccessSecret ? { guestSecret: String(guestAccessSecret) } : {})
      };
      const payHdr = {};
      if (accessToken) payHdr.Authorization = `Bearer ${accessToken}`;
      const data = await apiFetch("/api/paystack/init", {
        method: "POST",
        headers: payHdr,
        json: payJson
      });
      const url = data.authorization_url || data.authorizationUrl;
      if (!url) {
        setErr("Paystack did not return a payment link.");
        setLoading(false);
        return;
      }
      window.location.href = url;
    } catch (ex) {
      const st = ex && typeof ex.status === "number" ? ex.status : 0;
      if (st === 403) {
        setErr(
          "You don’t have permission to check out with this login. Log out and sign in again, or use a buyer account."
        );
      } else {
        setErr(apiErrorMessage(ex, "Could not start payment."));
      }
      setLoading(false);
    }
  };

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
          className: "relative mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-4 sm:px-6 sm:py-6"
        },
        [
          h(
            "div",
            {
              key: "modal",
              className:
                "rounded-2xl border border-white/25 bg-white/95 p-4 shadow-glass backdrop-blur-xl dark:border-white/10 dark:bg-night-900/90 dark:shadow-black/40 sm:p-5"
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
            "Checkout"
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
      h("p", { key: "empty", className: "mt-4 text-center text-sm text-slate-600 dark:text-slate-300" }, "Your cart is empty."),
      h(Button, { key: "shop", className: "mt-4 w-full", onClick: () => nav("/") }, "Back to shop")
    ]);
  }

  return modalShell([
    h("div", { key: "hdr", className: "flex items-start justify-between gap-3" }, [
      h("div", { key: "titles" }, [
        h("h1", { key: "h1", className: "font-display text-xl font-bold text-slate-900 dark:text-white sm:text-2xl" }, "Checkout"),
        pricingOpts?.paystackOnly
          ? h(
              "p",
              { key: "note", className: "mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400" },
              "Pay with Paystack (card or Ghana MoMo)."
            )
          : h(
              "p",
              { key: "note", className: "mt-1 text-[11px] text-slate-500 dark:text-slate-400" },
              "Complete payment on the next screen."
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

    h(
      "div",
      { key: "lines", className: "mt-3 space-y-1.5 rounded-xl border border-white/15 bg-white/50 p-3 dark:bg-night-900/50" },
      [
        h("p", { key: "lab", className: "text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, "Your items"),
        ...items.map((p) => {
          const blocked = usesRequestInsteadOfCart(p);
          const lineTotal = blocked ? 0 : buyerDisplayPrice(cartLineSellerUnit(p), pricingOpts, Number(p.qty) || 1);
          return h(
            "div",
            {
              key: p._lineKey || p.id,
              className: "flex items-start justify-between gap-2 rounded-lg border border-white/10 bg-white/30 px-2 py-1.5 text-sm dark:bg-night-900/40"
            },
            [
              h("div", { key: "meta", className: "min-w-0 flex-1" }, [
                h("span", { className: "text-slate-800 dark:text-slate-200" }, [p.name || "Item", " ×", String(p.qty)]),
                Array.isArray(p.selectedAddonLabels) && p.selectedAddonLabels.length > 0
                  ? h(
                      "span",
                      { className: "mt-0.5 block text-xs text-violet-800 dark:text-violet-200" },
                      `Options: ${p.selectedAddonLabels.join(", ")}`
                    )
                  : null,
                String(p.customization || "").trim() && supportsCartCustomizationNotes(p)
                  ? h("span", { className: "mt-0.5 block text-xs text-violet-800 dark:text-violet-200" }, `Preferences: ${String(p.customization).trim()}`)
                  : null
              ]),
              !blocked
                ? h("span", { key: "amt", className: "shrink-0 font-semibold tabular-nums text-slate-900 dark:text-white" }, formatGhc(lineTotal))
                : null
            ]
          );
        })
      ]
    ),

    accessToken && (pointsBal > 0 || user?.firstOrderDiscountEligible)
      ? h("div", { key: "loyalty", className: "mt-3 space-y-2 rounded-xl border border-violet-400/25 bg-violet-500/5 p-3 dark:border-violet-400/20 dark:bg-violet-950/25" }, [
          user?.firstOrderDiscountEligible
            ? h(
                "p",
                { key: "first", className: "text-xs font-semibold text-violet-900 dark:text-violet-100" },
                "First order this week: 15% off merchandise is applied at payment."
              )
            : null,
          pointsBal > 0
            ? [
                h("p", { key: "bal", className: "text-xs text-slate-600 dark:text-slate-300" }, [
                  "Reward balance: ",
                  h("strong", { className: "text-slate-900 dark:text-white" }, `${pointsBal} pts`),
                  " (100 pts = GHS 1 off)"
                ]),
                h("div", { key: "redeem-row", className: "flex flex-wrap items-end gap-2" }, [
                  h(Field, { key: "rp", label: "Redeem points", className: "min-w-[8rem] flex-1" }, h(TextInput, {
                    type: "number",
                    min: 0,
                    max: maxRedeemPts,
                    value: String(redeemPts),
                    onChange: (e) => {
                      const n = Math.max(0, Math.min(maxRedeemPts, Math.floor(Number(e.target.value) || 0)));
                      setRedeemPts(n);
                    }
                  })),
                  h(
                    Button,
                    {
                      key: "max",
                      type: "button",
                      variant: "ghost",
                      className: "!text-xs",
                      onClick: () => setRedeemPts(maxRedeemPts)
                    },
                    "Use max"
                  )
                ]),
                redeemPts > 0
                  ? h(
                      "p",
                      { key: "off", className: "text-[11px] font-medium text-emerald-700 dark:text-emerald-300" },
                      `−${formatGhc(redeemGhs)} applied on the server when you pay.`
                    )
                  : null
              ]
            : null
        ])
      : null,

    h("div", { key: "total-row", className: "mt-3 border-t border-slate-200/80 pt-2.5 dark:border-white/10" }, [
      h("div", { className: "flex justify-between text-base font-bold text-slate-900 dark:text-white" }, [
        h("span", null, "Total"),
        h("span", null, totalStr)
      ]),
      redeemPts > 0
        ? h("p", { key: "redeem-note", className: "mt-1 text-xs text-slate-500 dark:text-slate-400" }, `Points discount (${redeemPts} pts) is calculated on Paystack amount.`)
        : null
    ]),

    !accessToken
      ? h("div", { key: "guest", className: "mt-3 space-y-2" }, [
          h(
            "p",
            { key: "gcap", className: "text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" },
            "Contact (guest)"
          ),
          h(Field, { key: "em", label: "Email" }, h(TextInput, {
              value: guestEmail,
              onChange: (e) => setGuestEmail(e.target.value),
              type: "email",
              autoComplete: "email"
            })),
          h(Field, { key: "ph", label: "Phone" }, h(TextInput, {
              value: guestPhone,
              onChange: (e) => setGuestPhone(e.target.value),
              type: "tel",
              autoComplete: "tel"
            })),
          h(
            "p",
            { key: "hint", className: "text-[11px] text-slate-500 dark:text-slate-400" },
            "For order updates. Sign in later to track under My orders."
          )
        ])
      : null,

    needsDelivery
      ? h("div", { key: "dropoff", className: "mt-3 space-y-2 rounded-xl border border-sky-500/25 bg-sky-500/5 p-3 dark:border-sky-400/20 dark:bg-sky-950/20" }, [
          h("p", { key: "dlab", className: "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-sky-800 dark:text-sky-200" }, [
            h(MapPin, { key: "ic", className: "h-3.5 w-3.5", "aria-hidden": true }),
            "Delivery drop-off"
          ]),
          h(Field, { key: "addr", label: "Where should we deliver?" }, h(TextInput, {
            value: dropoffLabel,
            onChange: (e) => setDropoffLabel(e.target.value),
            placeholder: "e.g. East Legon, Pent Hostel, Room 12"
          })),
          h(
            Button,
            {
              key: "loc",
              type: "button",
              variant: "ghost",
              className: "!w-full !justify-center !rounded-xl !border !border-sky-400/40 !text-xs !font-semibold",
              loading: locatingDropoff,
              onClick: useMyDropoffLocation
            },
            [h(Crosshair, { key: "ic", className: "h-4 w-4" }), locatingDropoff ? "Getting location…" : "Use my location"]
          ),
          dropoffLat != null && dropoffLng != null
            ? h(
                "p",
                { key: "ok", className: "text-[11px] font-medium text-emerald-700 dark:text-emerald-300" },
                "GPS pinned — shown on your live delivery map."
              )
            : null,
          dropoffHint
            ? h("p", { key: "hint", className: "text-[11px] text-amber-800 dark:text-amber-200" }, dropoffHint)
            : h(
                "p",
                { key: "sub", className: "text-[11px] text-slate-500 dark:text-slate-400" },
                "Required for courier tracking. Your rider sees this pin after payment."
              )
        ])
      : h(
          "div",
          {
            key: "onsite",
            className: "mt-3 rounded-xl border border-violet-500/25 bg-violet-500/5 p-3 dark:border-violet-400/20 dark:bg-violet-950/20"
          },
          [
            h("p", { key: "olab", className: "text-[10px] font-bold uppercase tracking-wide text-violet-800 dark:text-violet-200" }, "On-site service"),
            h(
              "p",
              { key: "ohint", className: "mt-1 text-[11px] leading-snug text-slate-600 dark:text-slate-300" },
              "No courier delivery — coordinate time and place with the provider after payment (use order messages if needed)."
            )
          ]
        ),

    err ? h(InlineNotice, { key: "err", variant: "error", className: "mt-3", onDismiss: () => setErr("") }, err) : null,

    h(Button, {
      key: "pay",
      className: "mt-4 w-full !rounded-2xl !py-3 text-base font-semibold",
      loading,
      onClick: handlePayNow
    }, "Pay now")
  ]);
}

export function SavedProductsPage() {
  const { accessToken } = useAuth();
  const nav = useNavigate();
  const [cartOpen, setCartOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const { toggleSaved } = useSavedProducts();
  const { add } = useCart();
  const pricingOpts = useCheckoutPricingOptions();

  const tryAddToCart = (p) => {
    if (!canAddProductToCart(p)) return;
    if (productShowsCustomizationUi(p) || productAddonDefs(p).length > 0) {
      nav(`/products/${p.id}`);
      return;
    }
    add(p, 1);
    setCartOpen(true);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr("");
    const hdr = {};
    if (accessToken) hdr.Authorization = `Bearer ${accessToken}`;
    apiFetch("/api/products/saves", { headers: hdr })
      .then((d) => {
        if (!cancelled) setProducts(d.products || []);
      })
      .catch((ex) => {
        if (!cancelled) {
          setErr(apiErrorMessage(ex, "Could not load saved items"));
          setProducts([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const onToggleSave = async (p) => {
    try {
      const saved = await toggleSaved(p.id);
      if (!saved) setProducts((prev) => prev.filter((x) => String(x.id) !== String(p.id)));
    } catch {
      /* ignore */
    }
  };

  return h(f, null, [
    h(
      BuyerLayout,
      {
        key: "layout",
        hideSearch: true,
        title: "Saved items",
        onOpenCart: () => setCartOpen(true)
      },
      h("div", { key: "main", className: "mx-auto w-full max-w-[1480px] px-4 py-8 pb-24 sm:px-6 lg:px-8" }, [
        h(Link, { key: "back", to: "/", className: "mb-6 inline-flex items-center gap-2 text-sm font-medium text-sky-600 hover:underline dark:text-sky-300" }, [
          h(ArrowLeft, { key: "ic", className: "h-4 w-4" }),
          h("span", { key: "tx" }, "Back to shop")
        ]),
        h("h1", { key: "h1", className: "mb-2 font-display text-2xl font-bold text-slate-900 dark:text-white" }, "Saved items"),
        h(
          "p",
          { key: "sub", className: "mb-8 text-sm text-slate-600 dark:text-slate-400" },
          "Listings you saved from SHOPIQGH. Available while browsing signed out too — we keep them under this browser’s session."
        ),
        err ? h(InlineNotice, { key: "e", variant: "error", className: "mb-4", onDismiss: () => setErr("") }, err) : null,
        loading
          ? h("p", { key: "ld", className: "text-slate-500" }, "Loading…")
          : products.length === 0
            ? h(
                "p",
                { key: "empty", className: "rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-10 text-center text-sm text-slate-600 dark:border-white/10 dark:bg-night-900/50 dark:text-slate-400" },
                "No saved items yet. Tap the heart on a product to save it here."
              )
            : h(
                "div",
                {
                  key: "grid",
                  className:
                    "grid grid-cols-3 gap-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5"
                },
                products.map((p) => {
                  const detailTo = `/products/${p.id}`;
                  const quoteCard = usesRequestInsteadOfCart(p);
                  const foodCard = isFoodCallToOrderCategory(p);
                  const listP = Number(p.price) || 0;
                  const cmpAt = Number(p.compareAtPrice);
                  const strikeCmp = Number.isFinite(cmpAt) && cmpAt > listP && listP >= 0;
                  const vendorNm =
                    p?.sellerPayment && typeof p.sellerPayment === "object" && String(p.sellerPayment.displayName || "").trim()
                      ? String(p.sellerPayment.displayName).trim()
                      : "Seller";
                  return h(
                    "div",
                    {
                      key: p.id,
                      className:
                        "group flex flex-col overflow-hidden rounded-xl border border-slate-200/95 bg-white p-2 shadow-sm transition hover:shadow-md dark:border-white/10 dark:bg-night-900/55 sm:p-4"
                    },
                    [
                      h("div", { key: "img", className: "relative" }, [
                        storefrontBadgeStack(p),
                        h(
                          Link,
                          {
                            key: "pic-l",
                            to: detailTo,
                            className: "block overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                          },
                          h(RefImage, {
                            key: "pic",
                            src: p.imageUrls?.[0],
                            n: refFromId(p.id),
                            alt: p.name,
                            className: "h-28 w-full object-cover transition duration-300 group-hover:scale-[1.02] sm:h-40 md:h-48"
                          })
                        )
                      ]),
                      h("div", { key: "meta", className: "mt-3 flex flex-1 flex-col" }, [
                        h("div", { key: "title-row", className: "flex items-start gap-1.5" }, [
                          h(
                            "div",
                            { key: "ttl", className: "min-w-0 flex-1" },
                            h(
                              Link,
                              {
                                key: "titles",
                                to: detailTo,
                                className: "min-w-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                              },
                              h("h3", { className: "line-clamp-2 text-xs font-semibold leading-snug text-slate-900 underline-offset-2 hover:underline dark:text-white sm:text-sm sm:text-[15px]" }, p.name)
                            )
                          ),
                          h(
                            "button",
                            {
                              key: "wish",
                              type: "button",
                              className:
                                "tap-target shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-500 dark:hover:bg-white/10",
                              "aria-label": "Remove from saved",
                              "aria-pressed": true,
                              onClick: (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onToggleSave(p);
                              }
                            },
                            h(Heart, { className: "h-5 w-5 fill-rose-500 text-rose-500" })
                          )
                        ]),
                        h("div", { key: "vendor", className: "mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5" }, [
                          h(Star, { key: "ic", className: "h-3.5 w-3.5 shrink-0 text-amber-400", "aria-hidden": true }),
                          h(
                            "span",
                            { key: "nm", className: "text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" },
                            vendorNm
                          )
                        ]),
                        quoteCard
                          ? h(
                              "p",
                              {
                                key: "svc-pr",
                                className:
                                  `mt-3 text-sm font-semibold leading-snug ${foodCard ? "text-violet-900 dark:text-violet-50" : "text-amber-800 dark:text-amber-100"}`
                              },
                              foodCard ? "Buy" : "See listing for pricing & scope"
                            )
                          : h("div", { key: "prices", className: "mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1" }, [
                              strikeCmp
                                ? h(
                                    "span",
                                    {
                                      key: "strike",
                                      className: "text-xs font-semibold text-slate-400 line-through dark:text-slate-500"
                                    },
                                    formatGhc(cmpAt)
                                  )
                                : null,
                              h(
                                "span",
                                { key: "list", className: "text-sm font-extrabold text-sky-700 sm:text-lg dark:text-sky-200" },
                                formatGhc(buyerDisplayPrice(listP, pricingOpts, 1))
                              )
                            ]),
                        h(
                          Button,
                          {
                            key: "add",
                            variant: "ghost",
                            className:
                              "mt-2 w-full !justify-center !rounded-xl border border-sky-500/60 !bg-transparent !text-xs !font-semibold !text-sky-700 hover:!bg-sky-50 sm:mt-4 sm:!text-sm dark:border-sky-400/45 dark:!text-sky-100 dark:hover:!bg-sky-950/35",
                            type: "button",
                            disabled: !quoteCard && (p.stock ?? 0) <= 0,
                            onClick: () => {
                              if (quoteCard) {
                                nav(detailTo);
                                return;
                              }
                              tryAddToCart(p);
                            }
                          },
                          [
                            quoteCard ? null : h(ShoppingCart, { key: "ic", className: "h-4 w-4" }),
                            h(
                              "span",
                              { key: "tx" },
                              quoteCard
                                ? foodCard
                                  ? "Place Order"
                                  : "View listing"
                                : (p.stock ?? 0) <= 0
                                  ? "Out of stock"
                                  : "Buy"
                            )
                          ].filter(Boolean)
                        )
                      ])
                    ]
                  );
                })
              )
      ])
    ),
    h(CartDrawer, { key: "cart", open: cartOpen, onClose: () => setCartOpen(false) })
  ]);
}

export function ShopPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [cat, setCat] = useState("all");
  const [fil, setFil] = useState("all");
  const [cartOpen, setCartOpen] = useState(false);
  const [queryInput, setQueryInput] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [minPriceIn, setMinPriceIn] = useState("");
  const [maxPriceIn, setMaxPriceIn] = useState("");
  const [minPriceQ, setMinPriceQ] = useState(null);
  const [maxPriceQ, setMaxPriceQ] = useState(null);
  const [products, setProducts] = useState([]);
  const [listErr, setListErr] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [recRows, setRecRows] = useState([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recErr, setRecErr] = useState("");
  const [recentProducts, setRecentProducts] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const { add } = useCart();
  const { accessToken } = useAuth();
  const { isSaved, toggleSaved } = useSavedProducts();
  const nav = useNavigate();

  useEffect(() => {
    const raw = (searchParams.get("cat") || "").trim().toLowerCase();
    if (!raw || raw === "all") return;
    if (CATEGORIES.some((c) => c.id === raw)) setCat(raw);
  }, [searchParams]);

  useEffect(() => {
    const raw = (searchParams.get("fil") || "").trim().toLowerCase();
    if (!raw) return;
    if (FILTERS.some((f) => f.id === raw)) setFil(raw);
  }, [searchParams]);

  const tryAddToCart = (p) => {
    if (!canAddProductToCart(p)) return;
    if (productShowsCustomizationUi(p) || productAddonDefs(p).length > 0) {
      nav(`/products/${p.id}`);
      return;
    }
    add(p, 1);
    setCartOpen(true);
  };

  useEffect(() => {
    const t = setTimeout(() => setSearchQ(queryInput.trim()), 350);
    return () => clearTimeout(t);
  }, [queryInput]);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const headers = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    // Non-critical data: defer slightly so first catalog paint is faster.
    timer = window.setTimeout(() => {
      if (cancelled) return;
      setRecLoading(true);
      setRecErr("");
      apiFetch("/api/products/recommended?limit=8", { headers })
        .then((d) => {
          if (cancelled) return;
          setRecRows(Array.isArray(d.rows) ? d.rows : []);
        })
        .catch((ex) => {
          if (!cancelled) setRecErr(apiErrorMessage(ex, "Could not load recommendations"));
        })
        .finally(() => {
          if (!cancelled) setRecLoading(false);
        });
    }, 280);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      setRecentProducts([]);
      return undefined;
    }
    let cancelled = false;
    let timer = 0;

    // Defer this secondary rail to avoid competing with first product fetch.
    timer = window.setTimeout(() => {
      if (cancelled) return;
      setRecentLoading(true);
      apiFetch("/api/products/recently-viewed", { headers: { Authorization: `Bearer ${accessToken}` } })
        .then((d) => {
          if (!cancelled) setRecentProducts(Array.isArray(d.products) ? d.products : []);
        })
        .catch(() => {
          if (!cancelled) setRecentProducts([]);
        })
        .finally(() => {
          if (!cancelled) setRecentLoading(false);
        });
    }, 450);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [accessToken]);

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    const params = new URLSearchParams();
    if (cat !== "all") params.set("category", cat);
    if (searchQ) params.set("q", searchQ);
    if (minPriceQ != null && Number.isFinite(minPriceQ)) params.set("minPrice", String(minPriceQ));
    if (maxPriceQ != null && Number.isFinite(maxPriceQ)) params.set("maxPrice", String(maxPriceQ));
    const qs = params.toString();
    apiFetch(`/api/products${qs ? `?${qs}` : ""}`)
      .then((d) => {
        if (!cancelled) setProducts(d.products || []);
      })
      .catch((ex) => {
        if (!cancelled) {
          setListErr(apiErrorMessage(ex, "Could not load products"));
          setProducts([]);
        }
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cat, searchQ, minPriceQ, maxPriceQ]);

  const applyPriceRange = () => {
    const minRaw = parseFloat(String(minPriceIn).trim());
    const maxRaw = parseFloat(String(maxPriceIn).trim());
    setMinPriceQ(Number.isFinite(minRaw) && minRaw >= 0 ? minRaw : null);
    setMaxPriceQ(Number.isFinite(maxRaw) && maxRaw >= 0 ? maxRaw : null);
  };

  const clearPriceRange = () => {
    setMinPriceIn("");
    setMaxPriceIn("");
    setMinPriceQ(null);
    setMaxPriceQ(null);
  };

  const priceFilterCaption =
    minPriceQ != null || maxPriceQ != null
      ? [
          minPriceQ != null && Number.isFinite(minPriceQ) ? `from ${formatGhc(minPriceQ)}` : null,
          maxPriceQ != null && Number.isFinite(maxPriceQ) ? `up to ${formatGhc(maxPriceQ)}` : null
        ]
          .filter(Boolean)
          .join(" · ")
      : "";

  const applyBrowseFilters = useCallback(
    (list) => sortProductsByBrowseFilter((list || []).filter((p) => productMatchesFilter(p, fil)), fil),
    [fil]
  );

  const filtered = useMemo(() => applyBrowseFilters(products), [products, applyBrowseFilters]);

  const filterRecRow = useCallback(
    (row, categoryId, browseFil) => {
      if (!row) return null;
      let rowProducts = Array.isArray(row.products) ? row.products : [];
      if (categoryId && categoryId !== "all") {
        rowProducts = rowProducts.filter((p) => normalizeProductCategoryId(p.category) === categoryId);
      }
      rowProducts = sortProductsByBrowseFilter(
        rowProducts.filter((p) => productMatchesFilter(p, browseFil)),
        browseFil
      );
      return rowProducts.length ? { ...row, products: rowProducts } : null;
    },
    []
  );

  const { topRecRows, greatValueRow } = useMemo(() => {
    const rows = Array.isArray(recRows) ? recRows : [];
    let greatValue = null;
    const top = [];
    for (const row of rows) {
      if (row.id === "great_value" || row.title === "Great value") greatValue = row;
      else if (row.id === "top_reviewed" || row.title === "Best reviewed") continue;
      else top.push(row);
    }
    const catId = cat === "all" ? "all" : cat;
    return {
      topRecRows: top.map((r) => filterRecRow(r, catId, fil)).filter(Boolean),
      greatValueRow: filterRecRow(greatValue, catId, fil)
    };
  }, [recRows, cat, fil, filterRecRow]);

  const recentFiltered = useMemo(() => applyBrowseFilters(recentProducts), [recentProducts, applyBrowseFilters]);

  const setFilAndUrl = useCallback(
    (next) => {
      const id = String(next || "all");
      setFil(id);
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (!id || id === "all") p.delete("fil");
          else p.set("fil", id);
          return p;
        },
        { replace: true }
      );
      if (id !== "all") {
        requestAnimationFrame(() => {
          const grid = document.getElementById("buyer-shop-grid");
          if (grid) grid.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    },
    [setSearchParams]
  );

  const { browseLead, browseRest } = useMemo(() => {
    const lead = filtered.slice(0, BROWSE_ROWS_BEFORE_GREAT_VALUE);
    return { browseLead: lead, browseRest: filtered.slice(lead.length) };
  }, [filtered]);

  const renderBrowseCard = (p) =>
    h(BrowseMenuItemCard, {
      key: p.id,
      product: p,
      isSaved,
      toggleSaved,
      onAddToCart: tryAddToCart,
      onNavigate: (to) => nav(to)
    });

  return h(f, null, [
    h(
      BuyerLayout,
      {
        key: "layout",
        hideSearch: true,
        storefront: true,
        storefrontAsideProps: {
          cat,
          setCat,
          fil,
          setFil: setFilAndUrl,
          minPriceIn,
          maxPriceIn,
          setMinPriceIn,
          setMaxPriceIn,
          applyPriceRange,
          clearPriceRange,
          priceFilterCaption
        },
        onOpenCart: () => setCartOpen(true)
      },
      h("div", { key: "main", className: "relative w-full max-w-[1480px] px-4 py-6 pb-24 sm:px-6 lg:py-8 lg:pl-5 lg:pr-10 xl:mx-auto" }, [
      h(RefImage, {
        key: "bg-blur",
        n: 4,
        alt: "",
        className:
          "pointer-events-none absolute left-0 right-0 top-0 -z-10 h-44 w-full rounded-3xl object-cover opacity-[0.14] blur-2xl dark:opacity-[0.1]"
      }),
      h("div", { key: "hero-stack", className: "relative z-[2] mb-4 w-full space-y-3" }, [
        h("div", { key: "shop-hero-search", className: "w-full max-w-xl lg:max-w-2xl" }, [
          h("div", { className: "relative" }, [
            h(Search, {
              key: "ic",
              className: "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-500 dark:text-sky-400"
            }),
            h(TextInput, {
              key: "q",
              "aria-label": "Search products and services",
              value: queryInput,
              onChange: (e) => setQueryInput(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setSearchQ(queryInput.trim());
                }
              },
              placeholder: "Search for products, services…",
              className:
                "!h-9 !min-h-[36px] !rounded-2xl !border-slate-300/70 !bg-white/90 !py-0 !pl-10 !pr-[4.5rem] !text-sm shadow-inner dark:!border-white/10 dark:!bg-night-950/70"
            }),
            h(
              Button,
              {
                key: "go",
                variant: "primary",
                type: "button",
                className:
                  "!absolute right-1 top-1/2 !h-7 !min-h-0 -translate-y-1/2 !rounded-xl !px-3 !py-0 !text-xs",
                onClick: () => setSearchQ(queryInput.trim())
              },
              "Search"
            )
          ])
        ]),
        h(ShopHomePromoCarousel, { key: "shop-promo" })
      ]),
      accessToken && (recentLoading || recentFiltered.length > 0)
        ? h(
            "section",
            {
              key: "recent-rail",
              id: "buyer-recently-viewed",
              className: "mb-8 scroll-mt-28 sm:scroll-mt-32",
              "aria-label": "Recently viewed"
            },
            [
              recentLoading && !recentFiltered.length
                ? h("p", { key: "rv-load", className: "mb-3 text-sm text-slate-500 dark:text-slate-400" }, "Loading recently viewed…")
                : h(ShopHomeRecommendationRow, {
                    key: "rv-row",
                    row: { id: "recently_viewed", title: "Recently viewed", products: recentFiltered }
                  })
            ]
          )
        : null,
      h(ShopHomeRecommendationRails, { key: "shop-rec", rows: topRecRows, loading: recLoading, err: recErr }),
      listErr
        ? h(InlineNotice, { key: "list-err", variant: "error", className: "mb-4", onDismiss: () => setListErr("") }, listErr)
        : null,
      h(
        "section",
        {
          key: "browse",
          id: "buyer-shop-grid",
          className: "scroll-mt-28 sm:scroll-mt-32",
          "aria-label": "Product catalog"
        },
        [
          h(
            "h2",
            { key: "feat-h2", className: "mb-1 font-display text-xl font-bold text-slate-900 dark:text-white sm:text-2xl" },
            fil !== "all"
              ? browseFilterSectionTitle(fil)
              : cat === "all"
                ? "Browse menu items"
                : CATEGORY_LABELS[cat] || "Browse listings"
          ),
          h(
            "p",
            { key: "feat-sub", className: "mb-4 text-sm text-slate-500 dark:text-slate-400" },
            fil === "sales"
              ? "Deals, flash sales, and compare-at markdowns — biggest discounts first."
              : fil === "new"
                ? "Listings added in the last 7 days."
                : fil === "popular"
                  ? "Trending from sales, views, and reviews this week."
                  : cat === "all"
                    ? "From local restaurants and stores — tap a name for the full menu, or open a dish to order."
                    : `Active listings in ${CATEGORY_LABELS[cat] || cat} — open an item to view details or add to cart.`
          ),
          listLoading &&
            h("p", { key: "list-load", className: "mb-4 text-sm text-slate-500 dark:text-slate-400" }, "Loading products…"),
          browseLead.length > 0
            ? h(
                "div",
                { key: "product-grid-lead", className: browseMenuGridClassName() },
                browseLead.map(renderBrowseCard)
              )
            : null,
          greatValueRow
            ? h(ShopHomeRecommendationRow, {
                key: "great-value-inline",
                row: greatValueRow,
                className: "my-8"
              })
            : null,
          browseRest.length > 0
            ? h(
                "div",
                { key: "product-grid-rest", className: browseMenuGridClassName() },
                browseRest.map(renderBrowseCard)
              )
            : null,
          !listLoading && filtered.length === 0
            ? h(
                "p",
                { key: "empty", className: "mb-4 text-sm text-slate-500 dark:text-slate-400" },
                fil !== "all"
                  ? browseFilterEmptyHint(fil)
                  : cat !== "all"
                    ? `No active listings in ${CATEGORY_LABELS[cat] || cat} yet. Sellers must publish with that category (e.g. baby items under Groceries won’t appear here until recategorized). Try All or another category.`
                    : browseFilterEmptyHint("all")
              )
            : null,
          h(MarketplaceFooter, { key: "site-footer" })
        ]
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
          "fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-xl shadow-sky-900/30 sm:hidden",
        onClick: () => setCartOpen(true)
      },
      [h(ShoppingCart, { key: "i", className: "h-5 w-5" }), h("span", { key: "t" }, "Cart")]
    )
  ]);
}

export function ProfilePage() {
  const [cartOpen, setCartOpen] = useState(false);
  const nav = useNavigate();
  const { confirm, alert, toast } = useNotice();
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
  const [referral, setReferral] = useState(null);

  useEffect(() => {
    if (!accessToken) {
      setReferral(null);
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

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;
    apiFetch("/api/auth/referral", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => {
        if (!cancelled) setReferral(d);
      })
      .catch(() => {
        if (!cancelled) setReferral(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const copyReferralLink = async () => {
    const url = referral?.shareUrl || "";
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast("Invite link copied", { variant: "success" });
    } catch {
      window.prompt("Copy your invite link:", url);
    }
  };

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
      setSaveErr(apiErrorMessage(ex, "Upload failed"));
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
      setSaveErr(apiErrorMessage(ex, "Could not remove photo"));
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
      setSaveErr(apiErrorMessage(ex, "Save failed"));
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
      setSaveErr(apiErrorMessage(ex, "Could not delete account"));
    } finally {
      setDeleting(false);
    }
  };

  return h(f, null, [
    h(
      BuyerLayout,
      { key: "layout", onOpenCart: () => setCartOpen(true), hideSearch: true },
      h("div", { key: "main", className: "w-full px-4 py-10 sm:px-6 lg:px-8" }, [
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
      referral && accessToken
        ? h(GlassPanel, { key: "referral", className: "mb-6 !border-violet-400/25 !bg-violet-500/5" }, [
            h("div", { className: "flex items-start gap-3" }, [
              h(
                "div",
                {
                  className:
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-600/20 text-violet-700 dark:text-violet-200"
                },
                h(Gift, { className: "h-5 w-5", "aria-hidden": true })
              ),
              h("div", { className: "min-w-0 flex-1" }, [
                h("h2", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, "Invite friends"),
                h(
                  "p",
                  { className: "mt-1 text-sm text-slate-600 dark:text-slate-300" },
                  `Share your link — you both get ${referral.rewardPointsEach || 1000} points (≈ GHS ${referral.rewardGhsEach ?? 10}) when they complete their first order.`
                ),
                h("p", { className: "mt-2 font-mono text-sm font-bold text-violet-800 dark:text-violet-200" }, referral.code),
                h("p", { className: "mt-1 text-xs text-slate-500 dark:text-slate-400" }, `${referral.inviteSignups ?? 0} friend${referral.inviteSignups === 1 ? "" : "s"} signed up with your code`)
              ])
            ]),
            h(
              Button,
              {
                key: "copy-ref",
                type: "button",
                variant: "primary",
                className: "mt-4 w-full gap-2 sm:w-auto",
                onClick: copyReferralLink
              },
              [h(Copy, { className: "h-4 w-4" }), "Copy invite link"]
            )
          ])
        : null,
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

function paymentMethodLabel(method) {
  if (method === "momo") return "Mobile money";
  if (method === "bank") return "Bank card";
  if (method === "stripe") return "Stripe";
  if (method === "paystack") return "Paystack";
  return method ? String(method) : "—";
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
        h("div", { className: "mt-3 rounded-xl border border-white/10 bg-white/30 p-3 dark:bg-night-900/30" }, [
          h("p", { className: "text-[10px] font-bold uppercase tracking-wide text-slate-500" }, "Items"),
          ...items.map((it, idx) =>
            h("div", { key: `${it.productId || it.name}-${idx}`, className: "mt-2 text-sm" }, [
              h("span", null, `${it.name} ×${it.quantity ?? 1}`),
              it.buyerNote ? h("p", { className: "mt-0.5 text-xs text-violet-800 dark:text-violet-100" }, `Notes: ${it.buyerNote}`) : null
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

/** Help & support — contact marketplace admin (in-app messages + optional email from platform settings). */
export function BuyerHelpSupportPage() {
  const { accessToken, user } = useAuth();
  const nav = useNavigate();
  const [cartOpen, setCartOpen] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [cfgErr, setCfgErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/platform/config")
      .then((d) => {
        if (!cancelled) setCfg(d);
      })
      .catch((ex) => {
        if (!cancelled) setCfgErr(apiErrorMessage(ex, "Could not load contact options"));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const siteName = cfg?.siteName || SITE_NAME;
  const supportEmail = (cfg?.supportEmail || "").trim();

  return h(f, null, [
    h(
      BuyerLayout,
      {
        key: "layout",
        onOpenCart: () => setCartOpen(true),
        hideSearch: true,
        title: "Help & support"
      },
      h("div", { key: "main", className: "mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 lg:px-8" }, [
        h(
          Link,
          {
            key: "back",
            to: "/",
            className: "mb-6 inline-flex items-center gap-2 text-sm font-medium text-sky-600 hover:underline dark:text-sky-300"
          },
          [h(ArrowLeft, { className: "h-4 w-4" }), h("span", null, "Back to shop")]
        ),
        h("h1", { className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, "Help & support"),
        h(
          "p",
          { className: "mt-2 text-sm text-slate-600 dark:text-slate-300" },
          `Questions, payments, or safety issues? ${siteName} admins are here to help.`
        ),
        cfgErr &&
          h(InlineNotice, { key: "ce", variant: "error", className: "mt-6", onDismiss: () => setCfgErr("") }, cfgErr),
        h(GlassPanel, { key: "faq", id: "faq", className: "mt-6 scroll-mt-28 !border-white/10" }, [
          h("h2", { className: "font-semibold text-slate-900 dark:text-white" }, "FAQs"),
          h(
            "ul",
            { className: "mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300" },
            [
              h(
                "li",
                null,
                "How do I get help with an order? Sign in and use Messages, or use the contact options on this page."
              ),
              h(
                "li",
                null,
                "How do refunds and returns work? See Terms — refunds follow the marketplace’s dispute and refund rules."
              )
            ]
          )
        ]),
        h(GlassPanel, { key: "msg", className: "mt-4 !border-sky-500/25" }, [
          h("div", { className: "flex items-start gap-3" }, [
            h(Headphones, { className: "mt-0.5 h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" }),
            h("div", { className: "min-w-0 flex-1" }, [
              h("h2", { className: "font-semibold text-slate-900 dark:text-white" }, `Message ${SUPPORT_LABEL}`),
              h(
                "p",
                { className: "mt-1 text-sm text-slate-600 dark:text-slate-300" },
                "Chat with an admin for account help, disputes, and general questions. Support appears in your messages list."
              ),
              accessToken && user?.role === "buyer"
                ? h(
                    Button,
                    { key: "open-msg", type: "button", className: "mt-4 !rounded-xl", onClick: () => nav("/messages") },
                    "Open messages"
                  )
                : h("div", { key: "guest", className: "mt-4" }, [
                    h(
                      Button,
                      {
                        key: "li",
                        type: "button",
                        variant: "primary",
                        className: "!rounded-xl",
                        onClick: () => nav("/login", { state: { from: "/support" } })
                      },
                      "Sign in to message support"
                    ),
                    h(
                      "p",
                      { className: "mt-2 text-xs text-slate-500 dark:text-slate-400" },
                      "We connect your conversation to your account so staff can help you safely."
                    )
                  ])
            ])
          ])
        ]),
        supportEmail
          ? h(GlassPanel, { key: "em", className: "mt-4 !border-white/10" }, [
              h("div", { className: "flex items-start gap-3" }, [
                h(Mail, { className: "mt-0.5 h-5 w-5 shrink-0 text-slate-500 dark:text-slate-400" }),
                h("div", { className: "min-w-0 flex-1" }, [
                  h("h2", { className: "font-semibold text-slate-900 dark:text-white" }, "Email the team"),
                  h("p", { className: "mt-1 text-sm text-slate-600 dark:text-slate-300" }, "Prefer email? Reach the address configured by your marketplace operator."),
                  h(
                    "a",
                    {
                      href: `mailto:${supportEmail}`,
                      className:
                        "mt-3 inline-flex max-w-full break-all text-sm font-medium text-sky-600 hover:underline dark:text-sky-300"
                    },
                    supportEmail
                  )
                ])
              ])
            ])
          : null,
        h(GlassPanel, { key: "rep", id: "report", className: "mt-4 scroll-mt-28 !border-white/10" }, [
          h("div", { className: "flex items-start gap-3" }, [
            h(AlertTriangle, { className: "mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" }),
            h("div", { className: "min-w-0 flex-1" }, [
              h("h2", { className: "font-semibold text-slate-900 dark:text-white" }, "Report a listing or order problem"),
              h(
                "p",
                { className: "mt-1 text-sm text-slate-600 dark:text-slate-300" },
                "Use Reports when you need to flag a specific product or order for moderation."
              ),
              accessToken && user?.role === "buyer"
                ? h(
                    Link,
                    {
                      key: "to-rep",
                      to: "/reports",
                      className: "mt-3 inline-block text-sm font-medium text-sky-600 hover:underline dark:text-sky-300"
                    },
                    "Go to reports →"
                  )
                : h(
                    "p",
                    { className: "mt-2 text-xs text-slate-500 dark:text-slate-400" },
                    "Sign in to submit a report from your account."
                  )
            ])
          ])
        ])
      ])
    ),
    h(CartDrawer, { key: "cart", open: cartOpen, onClose: () => setCartOpen(false) })
  ]);
}

export function BuyerMessagesPage() {
  const [cartOpen, setCartOpen] = useState(false);
  const { accessToken } = useAuth();
  const [searchParams] = useSearchParams();
  const peerFromQuery = searchParams.get("peer") || "";
  const productFromQuery = searchParams.get("product") || "";
  const productNameFromQuery = searchParams.get("productName") || "";
  const [threads, setThreads] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [replyByPeer, setReplyByPeer] = useState({});
  const [sending, setSending] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const selectPeerOnLoadRef = useRef(true);
  const openedListingRef = useRef(false);
  const prefillDoneRef = useRef(false);

  useEffect(() => {
    selectPeerOnLoadRef.current = true;
    openedListingRef.current = false;
    prefillDoneRef.current = false;
  }, [peerFromQuery, productFromQuery]);

  const loadThreads = useCallback(() => {
    if (!accessToken) return Promise.resolve();
    return apiFetch("/api/conversations", {
      headers: { Authorization: `Bearer ${accessToken}` }
    }).then((d) => setThreads(Array.isArray(d?.threads) ? d.threads : []));
  }, [accessToken]);

  const ensureListingThread = useCallback(async () => {
    const peer = String(peerFromQuery || "").trim();
    if (!accessToken || !peer) return null;
    const json = productFromQuery ? { productId: productFromQuery } : {};
    const d = await apiFetch(`/api/conversations/by-peer/${encodeURIComponent(peer)}/open-listing`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      json
    });
    const thread = d?.thread;
    if (!thread?.peerUserId) return null;
    setThreads((prev) => {
      const pid = String(thread.peerUserId);
      const rest = prev.filter((t) => String(t.peerUserId) !== pid);
      return [thread, ...rest];
    });
    setActiveId(String(thread.peerUserId));
    setMobileShowChat(true);
    return thread;
  }, [accessToken, peerFromQuery, productFromQuery]);

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr("");
    (async () => {
      await loadThreads();
      if (cancelled) return;
      const peer = String(peerFromQuery || "").trim();
      if (peer && !openedListingRef.current) {
        openedListingRef.current = true;
        try {
          await ensureListingThread();
        } catch (ex) {
          if (!cancelled) setErr(apiErrorMessage(ex, "Could not open seller chat"));
        }
      }
    })()
      .catch((ex) => {
        if (!cancelled) setErr(apiErrorMessage(ex, "Could not load messages"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, loadThreads, peerFromQuery, productFromQuery, ensureListingThread]);

  useEffect(() => {
    const peer = String(peerFromQuery || "").trim();
    const pname = String(productNameFromQuery || "").trim();
    if (!peer || !pname || prefillDoneRef.current) return;
    prefillDoneRef.current = true;
    setReplyByPeer((prev) => ({
      ...prev,
      [peer]: `Hi, I have a question about "${pname}": `
    }));
  }, [peerFromQuery, productNameFromQuery]);

  useEffect(() => {
    if (!threads.length) {
      if (!peerFromQuery) setActiveId(null);
      return;
    }
    const ids = threads.map((t) => String(t.peerUserId));
    if (selectPeerOnLoadRef.current && peerFromQuery && ids.includes(String(peerFromQuery))) {
      setActiveId(String(peerFromQuery));
      setMobileShowChat(true);
      selectPeerOnLoadRef.current = false;
      return;
    }
    selectPeerOnLoadRef.current = false;
    setActiveId((cur) => (cur && ids.includes(String(cur)) ? cur : String(threads[0].peerUserId)));
  }, [threads, activeId, peerFromQuery]);

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
    if (containsContactSharing(text)) {
      setErr(CONTACT_SHARING_BLOCKED_MESSAGE);
      return;
    }
    setErr("");
    setSending(pid);
    const thread = threads.find((t) => String(t.peerUserId) === pid);
    const isListingThread =
      String(pid) === String(peerFromQuery || "") ||
      String(thread?.itemSummary || "").startsWith("About:") ||
      String(thread?.itemSummary || "").includes("listing");
    const json = { text };
    if (isListingThread) {
      json.context = "listing";
      if (productFromQuery) json.productId = productFromQuery;
    }
    try {
      await apiFetch(`/api/conversations/by-peer/${encodeURIComponent(pid)}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json
      });
      setReplyByPeer((prev) => ({ ...prev, [pid]: "" }));
      await loadThreads();
    } catch (ex) {
      setErr(apiErrorMessage(ex, "Could not send reply"));
    } finally {
      setSending(null);
    }
  };

  const renderBubble = (m, idx) => {
    const mine = m.senderLabel === "You";
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
            className: `flex max-h-[40vh] shrink-0 flex-col border-white/10 md:max-h-none md:h-auto md:w-[min(100%,17rem)] md:max-w-[40%] md:border-r ${
              mobileShowChat ? "max-md:hidden" : "max-md:flex min-h-0"
            }`
          },
          [
            h("div", { key: "conv-h", className: "shrink-0 border-b border-white/10 px-4 py-3" }, [
              h("h2", { className: "text-base font-semibold text-slate-900 dark:text-white" }, "Chats"),
              h("p", { className: "mt-0.5 text-xs text-slate-500 dark:text-slate-400" }, "Sellers you’ve messaged or ordered from — plus SHOPIQGH Support for account help.")
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
      h("div", { key: "main", className: "flex w-full flex-col px-4 py-6 pb-24 sm:px-6 lg:px-8" }, [
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
              "Order chats show here when you buy. If your marketplace has an admin, SHOPIQGH Support appears first for safety and account help."
            )
          ]),
        chatShell
      ])
    ),
    h(CartDrawer, { key: "cart", open: cartOpen, onClose: () => setCartOpen(false) })
  ]);
}

export function BuyerNotificationsPage() {
  const [cartOpen, setCartOpen] = useState(false);
  return h(f, null, [
    h(
      BuyerLayout,
      {
        key: "layout",
        onOpenCart: () => setCartOpen(true),
        hideSearch: true,
        title: "Notifications"
      },
      h(NotificationsContent, {
        ordersLink: "/orders",
        backLink: "/",
        backLabel: "Shop"
      })
    ),
    h(CartDrawer, { key: "cart", open: cartOpen, onClose: () => setCartOpen(false) })
  ]);
}

export function BuyerOrdersPage() {
  const [cartOpen, setCartOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const { accessToken } = useAuth();
  const { add } = useCart();
  const nav = useNavigate();
  const { toast, confirm } = useNotice();
  const [orders, setOrders] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [reviewModal, setReviewModal] = useState(null);
  const [receiptOrder, setReceiptOrder] = useState(null);
  const [cancellingId, setCancellingId] = useState("");
  const [reorderingId, setReorderingId] = useState("");
  const [trackModalOpen, setTrackModalOpen] = useState(false);
  const [trackPresetOrderId, setTrackPresetOrderId] = useState(null);
  const closeReviewModal = useCallback(() => setReviewModal(null), []);

  const reorderOrder = async (order) => {
    if (!accessToken || !order?.id) return;
    setReorderingId(order.id);
    try {
      const data = await apiFetch(`/api/orders/${order.id}/reorder-items`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const lines = Array.isArray(data.lines) ? data.lines : [];
      if (!lines.length) {
        toast("No items from this order are available to buy right now.", { variant: "warn" });
        return;
      }
      for (const row of lines) {
        if (row.product) add(row.product, row.quantity || 1, row.customization || "");
      }
      toast(`Added ${lines.length} item${lines.length === 1 ? "" : "s"} to your cart.`, { variant: "success" });
      setCartOpen(true);
    } catch (ex) {
      toast(apiErrorMessage(ex, "Could not reorder."), { variant: "error" });
    } finally {
      setReorderingId("");
    }
  };

  const cancelOrder = async (order) => {
    if (!accessToken || !order?.id) return;
    if (!["pending_payment", "awaiting_vendor_payment"].includes(order.status)) return;
    const ok = await confirm(
      order.status === "awaiting_vendor_payment"
        ? "You sent payment details but no seller has confirmed receipt yet. Cancelling now stops the order — if any vendor already received your money you'll need to contact them directly."
        : "This order hasn't been paid yet. Cancelling will remove it from sellers' queues.",
      { title: "Cancel this order?", confirmLabel: "Yes, cancel order", cancelLabel: "Keep order" }
    );
    if (!ok) return;
    setCancellingId(order.id);
    try {
      const { order: updated } = await apiFetch(`/api/orders/${order.id}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: {}
      });
      setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, ...updated } : o)));
      toast("Order cancelled.", { variant: "success" });
    } catch (ex) {
      toast(apiErrorMessage(ex, "Could not cancel order"), { variant: "error" });
    } finally {
      setCancellingId("");
    }
  };

  const deleteOrder = async (order) => {
    if (!accessToken || !order?.id) return;
    if (order.status !== "cancelled") return;
    const ok = await confirm(
      "Permanently removes this cancelled order from your list. This cannot be undone.",
      { title: "Remove from my orders?", confirmLabel: "Yes, remove", cancelLabel: "Keep" }
    );
    if (!ok) return;
    try {
      await apiFetch(`/api/orders/${order.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
      toast("Order removed.", { variant: "success" });
    } catch (ex) {
      toast(apiErrorMessage(ex, "Could not remove order"), { variant: "error" });
    }
  };

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
        if (!cancelled) setErr(apiErrorMessage(ex, "Could not load orders"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const trackUrlFlag = searchParams.get("track");
  useEffect(() => {
    if (!(trackUrlFlag === "1" || String(trackUrlFlag || "").toLowerCase() === "true")) return;
    if (!accessToken || loading) return;
    setTrackPresetOrderId(null);
    setTrackModalOpen(true);
    setSearchParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete("track");
        return n;
      },
      { replace: true }
    );
  }, [trackUrlFlag, accessToken, loading, setSearchParams]);

  const openOrderId = (searchParams.get("openOrder") || "").trim();

  useEffect(() => {
    if (!openOrderId || loading || orders.length === 0) return;
    const t = window.setTimeout(() => {
      const el = document.getElementById(`order-card-${openOrderId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => window.clearTimeout(t);
  }, [openOrderId, loading, orders]);

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
        .filter(
          (o) =>
            ["paid", "processing", "sent_for_delivery", "delivered"].includes(o.status) &&
            (o.refundStatus || "none") !== "refunded"
        )
        .reduce((sum, o) => sum + (Number(o.total) || 0), 0),
    [orders]
  );
  const hasDeliverableOrders = useMemo(
    () =>
      orders.some(
        (o) =>
          !isOnsiteOrder(o) &&
          ["paid", "processing", "sent_for_delivery", "delivered"].includes(o.status)
      ),
    [orders]
  );

  return h(f, null, [
    h(
      BuyerLayout,
      { key: "layout", onOpenCart: () => setCartOpen(true), hideSearch: true, title: "My orders" },
      h("div", { key: "main", className: "mx-auto w-full max-w-5xl px-4 py-8 pb-24 sm:px-6 lg:px-8" }, [
      h("h2", { key: "h2", className: "sr-only" }, "Your orders"),
      h(
        "p",
        { key: "hint", className: "mb-4 text-sm text-slate-600 dark:text-slate-400" },
        "After payment, tap Rate next to an item to leave a star rating and optional review here — no need to open the product page."
      ),
      accessToken &&
        !loading &&
        !err &&
        hasDeliverableOrders &&
        h(GlassCard, {
          key: "track-invite",
          className:
            "mb-4 !border-violet-400/35 !bg-gradient-to-br from-violet-100/90 via-white to-white !p-4 dark:!from-violet-950/50 dark:!via-night-950/90 dark:!to-night-950"
        }, [
          h("div", { className: "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" }, [
            h("div", { key: "txt", className: "flex min-w-0 flex-1 gap-3" }, [
              h(
                "div",
                {
                  className:
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-violet-600 text-white shadow-lg shadow-violet-900/25"
                },
                h(Truck, { className: "h-6 w-6", "aria-hidden": true })
              ),
              h("div", { className: "min-w-0" }, [
                h("p", { className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, "Track your delivery"),
                h(
                  "p",
                  { className: "mt-1 text-sm text-slate-600 dark:text-slate-400" },
                  "Live map with courier GPS (when shared), drop-off marker, ETA, and a clear timeline."
                )
              ])
            ]),
            h(Button, {
              key: "go",
              type: "button",
              variant: "primary",
              className:
                "!h-11 !rounded-full !px-6 !text-[15px] !font-semibold shadow-lg shadow-sky-600/25 sm:shrink-0",
              onClick: () => {
                setTrackPresetOrderId(null);
                setTrackModalOpen(true);
              }
            }, [h(Navigation, { key: "i", className: "mr-2 h-4 w-4" }), " Track order"])
          ])
        ]),
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
        h(GlassPanel, { key: "orders-list", className: "mb-4 !border-sky-500/20 !p-3 sm:!p-4" }, [
          h("h3", { className: "text-sm font-semibold text-slate-900 dark:text-white" }, "Payment history"),
          h(
            "p",
            { className: "mt-0.5 max-w-xl text-[11px] leading-snug text-slate-500 dark:text-slate-400" },
            "Status, items, ratings. Receipt = full payment details when available."
          ),
          h(
            "div",
            { className: "mt-2 space-y-2" },
            ordersSorted.map((o) => {
              const lines = o.items || [];
              const canRate =
                rateableStatuses.includes(o.status) && (o.refundStatus || "none") !== "refunded";
              const hasReceiptMeta = !!(o.paymentMethod || o.paymentReference || o.paymentDetails);
              const summaryLine = hasReceiptMeta
                ? `${paymentMethodLabel(o.paymentMethod)} · ${formatGhc(o.total || 0)}`
                : formatGhc(o.total || 0);
              return h(
                "div",
                {
                  id: `order-card-${o.id}`,
                  key: `ord-${o.id}`,
                  className: `rounded-lg border border-white/10 bg-white/30 dark:bg-night-900/30 ${
                    openOrderId && String(o.id) === openOrderId ? "ring-2 ring-sky-500/70" : ""
                  }`
                },
                h("div", { className: "flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 sm:px-3" }, [
                  h("div", { className: "min-w-0 flex-1" }, [
                    h("p", { className: "font-mono text-[10px] text-slate-500 dark:text-slate-400" }, `#${String(o.id).slice(-8)}`),
                    h("p", { className: "mt-0.5 text-xs font-medium leading-tight text-slate-800 dark:text-slate-100" }, summaryLine),
                    h(
                      "p",
                      {
                        className: `mt-0.5 inline-flex rounded-full px-1.5 py-px text-[9px] font-semibold leading-tight ${buyerOrderFulfillmentPillClass(o)}`
                      },
                      formatOrderFulfillmentLabel(o)
                    )
                  ]),
                  hasReceiptMeta
                    ? h(Button, {
                        variant: "ghost",
                        className: "!h-8 !shrink-0 !gap-1 !rounded-lg !px-2 !py-0 !text-[11px]",
                        type: "button",
                        onClick: () => setReceiptOrder(o)
                      }, [
                        h(ReceiptText, { key: "ic", className: "h-3.5 w-3.5" }),
                        h("span", { key: "tx" }, "Receipt")
                      ])
                    : null
                ].filter(Boolean)),
                h(
                  "div",
                  {
                    key: "act",
                    className: "flex flex-wrap items-center gap-1.5 border-t border-white/10 px-2.5 py-1.5 sm:px-3"
                  },
                  [
                    ["pending_payment", "awaiting_vendor_payment"].includes(o.status)
                      ? h(
                          "button",
                          {
                            key: "cancel",
                            type: "button",
                            disabled: cancellingId === o.id,
                            onClick: () => cancelOrder(o),
                            className:
                              "inline-flex min-h-[32px] items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white/60 px-2.5 text-[11px] font-semibold text-slate-700 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-night-900/40 dark:text-slate-200 dark:hover:border-rose-400/40 dark:hover:bg-rose-950/30 dark:hover:text-rose-200"
                          },
                          [
                            h(X, { key: "i", className: "h-3.5 w-3.5" }),
                            h("span", { key: "l" }, cancellingId === o.id ? "Cancelling…" : "Cancel order")
                          ]
                        )
                      : null,
                    o.status === "cancelled"
                      ? h(
                          "button",
                          {
                            key: "del",
                            type: "button",
                            onClick: () => deleteOrder(o),
                            className:
                              "inline-flex min-h-[32px] items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white/60 px-2.5 text-[11px] font-semibold text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-white/10 dark:bg-night-900/40 dark:text-slate-400 dark:hover:border-rose-400/40 dark:hover:bg-rose-950/30 dark:hover:text-rose-200"
                          },
                          [
                            h(Trash2, { key: "i", className: "h-3.5 w-3.5" }),
                            h("span", { key: "l" }, "Remove from list")
                          ]
                        )
                      : null,
                    h(
                      Link,
                      {
                        key: "rep",
                        to: `/reports?order=${encodeURIComponent(String(o.id))}`,
                        className:
                          "inline-flex min-h-[32px] items-center justify-center rounded-lg border border-rose-500/60 bg-white/50 px-2.5 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-50 dark:border-rose-400/45 dark:bg-night-900/40 dark:text-rose-200 dark:hover:bg-rose-950/30"
                      },
                      "Report an issue"
                    ),
                    ["paid", "processing", "sent_for_delivery", "delivered", "cancelled"].includes(o.status)
                      ? h(
                          "button",
                          {
                            key: "reo",
                            type: "button",
                            disabled: reorderingId === o.id,
                            onClick: () => reorderOrder(o),
                            className:
                              "inline-flex min-h-[32px] items-center justify-center rounded-lg bg-purple-700 px-2.5 text-[11px] font-semibold text-white shadow shadow-purple-900/25 transition hover:bg-purple-800 disabled:opacity-60 dark:bg-purple-600 dark:hover:bg-purple-500"
                          },
                          reorderingId === o.id ? "Adding…" : "Reorder"
                        )
                      : null
                  ].filter(Boolean)
                ),
                lines.length > 0 &&
                  h("div", { className: "border-t border-white/10 px-2.5 py-2 sm:px-3" }, [
                    h("p", { className: "mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, "Items"),
                    ...lines.map((it) =>
                      h(
                        "div",
                        {
                          key: `${o.id}-${it.productId || it.name}`,
                          className:
                            "mb-1 flex flex-wrap items-center justify-between gap-1.5 border-b border-white/5 pb-1 last:mb-0 last:border-0 last:pb-0"
                        },
                        [
                          h(
                            "div",
                            { key: "nm", className: "min-w-0 flex-1" },
                            [
                              h(
                                "span",
                                { className: "block text-xs leading-snug text-slate-800 dark:text-slate-100" },
                                `${it.name} ×${it.quantity ?? 1}`
                              ),
                              it.buyerNote
                                ? h(
                                    "span",
                                    { className: "mt-0.5 block text-[10px] leading-snug text-violet-800 dark:text-violet-200/90" },
                                    `Notes: ${String(it.buyerNote)}`
                                  )
                                : null
                            ].filter(Boolean)
                          ),
                          canRate && it.productId
                            ? h(
                                "button",
                                {
                                  type: "button",
                                  className:
                                    "shrink-0 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-500/25 dark:text-sky-300",
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
                              ? h("span", { className: "text-[11px] text-slate-500" }, "Pay to rate")
                              : null
                        ].filter(Boolean)
                      )
                    )
                  ]),
                ["paid", "processing", "sent_for_delivery", "delivered"].includes(o.status) &&
                  !isOnsiteOrder(o)
                  ? h(
                      "div",
                      {
                        key: "dl-teaser",
                        className:
                          "border-t border-white/10 bg-gradient-to-r from-violet-500/[0.05] via-transparent to-sky-500/[0.05] px-2.5 py-1.5 sm:px-3"
                      },
                      [
                        h("div", { className: "flex flex-wrap items-center justify-between gap-2" }, [
                          h("div", { className: "min-w-0 flex-1" }, [
                            h(
                              "p",
                              {
                                className:
                                  "text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                              },
                              "Live GPS · opens when courier shares"
                            ),
                            h(
                              "p",
                              { className: "mt-px line-clamp-1 text-[10px] leading-tight text-slate-600 dark:text-slate-400" },
                              "Map + timeline in tracker."
                            )
                          ]),
                          h(Button, {
                            type: "button",
                            variant: "primary",
                            className:
                              "!h-8 !rounded-lg !gap-1 !px-2.5 !text-[11px] !font-semibold shadow shadow-sky-800/15",
                            onClick: () => {
                              setTrackPresetOrderId(String(o.id));
                              setTrackModalOpen(true);
                            }
                          }, [
                            h(Navigation, { key: "n", className: "h-3.5 w-3.5" }),
                            "Track"
                          ])
                        ])
                      ]
                    )
                  : null
              );
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
    receiptOrder && h(BuyerReceiptModal, { key: "receipt-modal", order: receiptOrder, onClose: () => setReceiptOrder(null) }),
    h(TrackOrderModal, {
      key: "track-order-modal",
      open: trackModalOpen,
      onClose: () => {
        setTrackModalOpen(false);
        setTrackPresetOrderId(null);
      },
      orders: orders.filter((o) => !isOnsiteOrder(o)),
      initialOrderId: trackPresetOrderId
    })
  ]);
}

export function PaymentSuccessPage() {
  const [params] = useSearchParams();
  const { accessToken } = useAuth();
  const { clear: clearCart } = useCart();
  const cartClearedRef = useRef(false);
  const orderId = params.get("orderId") || "";
  const paystackRef = params.get("reference") || params.get("trxref") || "";
  const [phase, setPhase] = useState("loading");
  const [order, setOrder] = useState(null);
  const [pollErr, setPollErr] = useState("");

  /** Paid orders shouldn’t keep line items in the client cart (localStorage). */
  useEffect(() => {
    if (cartClearedRef.current) return;
    if (phase !== "confirmed" && phase !== "waiting_vendor") return;
    cartClearedRef.current = true;
    clearCart();
    if (accessToken) {
      apiFetch("/api/cart/snapshot", {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: { items: [] }
      }).catch(() => {});
    }
  }, [phase, clearCart, accessToken]);

  useEffect(() => {
    if (!orderId) {
      setPhase("no_ref");
      return;
    }

    const guestSecret = getGuestOrderSecret(orderId);

    if (!accessToken && !guestSecret) {
      setPhase("no_auth");
      return;
    }

    const buildHeaders = () => {
      const h = {};
      if (accessToken) h.Authorization = `Bearer ${accessToken}`;
      else if (guestSecret) h["X-Guest-Order-Secret"] = guestSecret;
      return h;
    };

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 150;

    const paidLike = (s) => ["paid", "processing", "sent_for_delivery", "delivered"].includes(s);

    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const d = await apiFetch(`/api/orders/${orderId}`, {
          headers: buildHeaders()
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
          setPollErr(apiErrorMessage(ex, "Could not verify order"));
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

    let intervalId;
    (async () => {
      try {
        if (paystackRef) {
          await apiFetch(`/api/paystack/verify/${encodeURIComponent(paystackRef)}`, {
            headers: buildHeaders()
          });
        } else {
          await apiFetch("/api/payments/paystack/verify", {
            method: "POST",
            headers: buildHeaders(),
            json: accessToken ? { orderId } : { orderId, guestSecret }
          });
        }
        if (!cancelled && !cartClearedRef.current) {
          cartClearedRef.current = true;
          clearCart();
        }
      } catch {
        /* Non-Paystack flow or already finalized */
      }
      if (cancelled) return;
      const done0 = await tick();
      if (cancelled || done0) return;
      intervalId = setInterval(async () => {
        if (cancelled) {
          clearInterval(intervalId);
          return;
        }
        const done = await tick();
        if (done) clearInterval(intervalId);
      }, 3000);
    })();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [orderId, accessToken, paystackRef, clearCart]);

  const sellers = order?.sellerContacts || [];
  const confirmed = new Set(order?.confirmedSellerIds || []);
  const paidViaCardGateway = order && ["paystack", "stripe"].includes(order.paymentMethod);

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
          accessToken && h(Link, { to: "/orders", className: "inline-block" }, h(Button, { className: "!rounded-full" }, "My orders")),
          h(Link, { to: "/", className: "inline-block" }, h(Button, { variant: "ghost", className: "!rounded-full" }, "Shop"))
        ])
      ],
      phase === "no_auth" && [
        h("h1", { key: "h1", className: "font-display text-xl font-bold text-slate-900 dark:text-white" }, "Can’t verify this order here"),
        h(
          "p",
          { key: "p", className: "mt-3 text-sm text-slate-600 dark:text-slate-400" },
          "Guest checkout stores a private key in this browser. Open this page from the same device you used to pay, or sign in with the email you used at checkout."
        ),
        h("div", { key: "nav", className: "mt-6 flex flex-wrap justify-center gap-3" }, [
          h(Link, { to: "/login", className: "inline-block" }, h(Button, { className: "!rounded-full" }, "Log in")),
          h(Link, { to: "/", className: "inline-block" }, h(Button, { variant: "ghost", className: "!rounded-full" }, "Shop"))
        ])
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
        h(
          "p",
          { key: "p", className: "mt-2 text-slate-600 dark:text-slate-300" },
          paidViaCardGateway
            ? "Your card payment was received and your order is confirmed."
            : "Your order is confirmed — the seller(s) acknowledged payment."
        ),
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
          accessToken && h(Link, { to: "/orders", className: "inline-block" }, h(Button, { variant: "ghost", className: "!rounded-full" }, "View my orders")),
          h(Link, { to: "/", className: "inline-block" }, h(Button, { className: "!rounded-full" }, "Back to shop"))
        ]),
      ["waiting_vendor", "pending_gateway", "loading"].includes(phase) &&
        h("div", { key: "nav-pend", className: "mt-6 flex flex-wrap items-center justify-center gap-3" }, [
          accessToken && h(Link, { to: "/orders", className: "inline-block" }, h(Button, { variant: "ghost", className: "!rounded-full" }, "My orders")),
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
