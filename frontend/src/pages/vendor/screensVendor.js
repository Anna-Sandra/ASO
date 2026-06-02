import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Box,
  CalendarClock,
  Camera,
  ChevronLeft,
  ChevronRight,
  Building2,
  CreditCard,
  LayoutDashboard,
  Smartphone,
  LineChart,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  Percent,
  PlusCircle,
  Send,
  Settings,
  ShoppingCart,
  Sparkles,
  Star,
  Trash2,
  X
} from "lucide-react";
import { useAuth, useNotice, useTheme } from "context";
import { NotificationBell, NotificationsContent } from "pages/notifications/screensNotifications";
import { apiFetch, apiUploadBookPdf, apiUploadProductImages, apiUploadProfileImage, deleteAuthenticatedAccount, apiErrorMessage } from "services/api";
import { trackVendorAnalyticsEvent, VendorRevenueLineChart } from "components/charts/vendorCharts";
import { VendorDashboardBody } from "pages/vendor/VendorDashboardBody";
import {
  CATEGORY_LABELS,
  PRODUCT_CATEGORY_VALUES,
  isFoodCallToOrderCategory,
  productCategoryForBusinessType,
  refFromId,
  storeUsesMenuSections
} from "config/catalog";
import { MARKETPLACE_SUBCATEGORY_OPTIONS } from "config/marketplaceSubcategories";
import { useVendorStorePicker } from "hooks/useVendorStorePicker";
import { resolveMenuSectionIdForStore } from "utils/vendorStore";
import {
  buildCategoryAttributesPayload,
  validateCategoryAttributesForPublish,
  emptyAttrsForCategory,
  getListingMeta,
  listingEditPageHeading,
  mergeAttrsFromServer,
  renderListingCategoryFields
} from "config/listingCategoryFields";
import { LISTING_STOCK_WHEN_AVAILABLE } from "config/listingStock";
import { formatGhc } from "utils/money";
import { containsContactSharing, CONTACT_SHARING_BLOCKED_MESSAGE } from "utils/contactSharingGuard";
import { formatOrderFulfillmentLabel } from "utils/orderStatusDisplay";
import { h, f } from "utils/h";
import {
  Badge,
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
} from "components/ui";

/** Must match backend `MAX_PRODUCT_GALLERY_IMAGES` in `backend/src/config/productLimits.ts`. */
const MAX_PRODUCT_IMAGES = 500;
/** Must match backend `MAX_PRODUCT_IMAGES_PER_UPLOAD`. */
const UPLOAD_IMAGES_CHUNK = 40;
function vendorAddonPriceLabel(kind) {
  return kind === "remove" ? "Discount when removed (GHS, 0 or negative)" : "Extra charge (GHS)";
}

function vendorAddonsPayload(addons) {
  return addons
    .map((a) => {
      const kind = a.kind === "remove" ? "remove" : "add";
      const raw = Number(a.priceDelta) || 0;
      return {
        label: String(a.label || "").trim(),
        kind,
        priceDelta: kind === "add" ? Math.max(0, raw) : Math.min(0, raw)
      };
    })
    .filter((a) => a.label);
}

function vendorFormatAddonRow(a) {
  const kind = a.kind === "remove" ? "remove" : "add";
  const d = Number(a.priceDelta) || 0;
  const prefix = kind === "remove" ? "Remove · " : "Add · ";
  if (d === 0) return `${prefix}${a.label} (no price change)`;
  if (d > 0) return `${prefix}${a.label} +${formatGhc(d)}`;
  return `${prefix}${a.label} ${formatGhc(d)}`;
}

function vendorListingAddonsBlock(
  h,
  Field,
  TextInput,
  meta,
  addons,
  setAddons,
  addonKind,
  setAddonKind,
  addonLabel,
  setAddonLabel,
  addonPrice,
  setAddonPrice
) {
  if (!meta.showAddons) return null;
  const isRemove = addonKind === "remove";
  return h(
    "div",
    { key: "addons-section", className: "space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-white/10" },
    [
      h("div", { key: "addon-header" }, [
        h("h3", { key: "addon-title", className: "text-sm font-semibold text-slate-900 dark:text-white" }, meta.addonsLabel || "Customization options"),
        h(
          "p",
          { key: "addon-hint", className: "mt-1 text-xs text-slate-500 dark:text-slate-400" },
          meta.addonsHint || "Buyers tap to add extras or remove ingredients on the product page; price updates automatically."
        )
      ]),
      addons.length > 0
        ? h(
            "div",
            { key: "addon-list", className: "space-y-2" },
            addons.map((a, i) =>
              h(
                "div",
                {
                  key: `addon-${i}`,
                  className: "flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/5"
                },
                [
                  h("span", { key: "lbl", className: "text-sm text-slate-800 dark:text-slate-200" }, vendorFormatAddonRow(a)),
                  h(
                    "button",
                    {
                      key: "rm",
                      type: "button",
                      onClick: () => setAddons((prev) => prev.filter((_, j) => j !== i)),
                      className: "text-xs font-medium text-rose-500 hover:text-rose-700"
                    },
                    "Delete"
                  )
                ]
              )
            )
          )
        : null,
      h("div", { key: "kind-row", className: "flex flex-wrap gap-2" }, [
        h(
          "button",
          {
            key: "kind-add",
            type: "button",
            onClick: () => setAddonKind("add"),
            className: `rounded-full px-3 py-1.5 text-xs font-semibold ${
              !isRemove
                ? "bg-sky-600 text-white"
                : "border border-slate-200 bg-white text-slate-600 dark:border-white/15 dark:bg-night-900 dark:text-slate-300"
            }`
          },
          "Add extra"
        ),
        h(
          "button",
          {
            key: "kind-remove",
            type: "button",
            onClick: () => setAddonKind("remove"),
            className: `rounded-full px-3 py-1.5 text-xs font-semibold ${
              isRemove
                ? "bg-rose-600 text-white"
                : "border border-slate-200 bg-white text-slate-600 dark:border-white/15 dark:bg-night-900 dark:text-slate-300"
            }`
          },
          "Remove ingredient"
        )
      ]),
      h("div", { key: "addon-add", className: "flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-2" }, [
        h(
          "div",
          { key: "lbl-w", className: "min-w-0 flex-1" },
          h(
            Field,
            { key: "addon-lbl-field", label: isRemove ? "Ingredient to remove" : "Extra name" },
            h(TextInput, {
              value: addonLabel,
              onChange: (e) => setAddonLabel(e.target.value),
              placeholder: isRemove ? "e.g. Wele, Shito, Onions" : "e.g. Extra chicken, Avocado"
            })
          )
        ),
        h(
          "div",
          { key: "pr-w", className: "w-full sm:w-44" },
          h(
            Field,
            { key: "addon-price-field", label: vendorAddonPriceLabel(addonKind) },
            h(TextInput, {
              type: "number",
              step: "0.01",
              value: addonPrice,
              onChange: (e) => setAddonPrice(e.target.value),
              placeholder: isRemove ? "0 or -2" : "0"
            })
          )
        ),
        h(
          "button",
          {
            key: "addon-add-btn",
            type: "button",
            onClick: () => {
              const lbl = addonLabel.trim();
              if (!lbl) return;
              const kind = isRemove ? "remove" : "add";
              const raw = Number(addonPrice) || 0;
              const priceDelta = kind === "add" ? Math.max(0, raw) : Math.min(0, raw);
              setAddons((prev) => [...prev, { label: lbl, kind, priceDelta }]);
              setAddonLabel("");
              setAddonPrice("");
            },
            className: "mb-1 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 sm:shrink-0"
          },
          "Add option"
        )
      ])
    ]
  );
}

/**
 * Avatar letter: display name first, else email local-part.
 * @param {{ displayName?: string; email?: string; phone?: string } | null | undefined} u
 */
function vendorAvatarInitial(u) {
  if (!u) return "V";
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
  return "V";
}

function vendorUserAvatarNode(u, { sizeClass = "h-8 w-8", initialTextClass = "text-sm" } = {}) {
  const src = u?.profileImageUrl && String(u.profileImageUrl).trim();
  if (src) {
    return h("img", { src, alt: "", className: `${sizeClass} shrink-0 rounded-full object-cover` });
  }
  return h(
    "span",
    {
      className: `flex ${sizeClass} shrink-0 items-center justify-center rounded-full bg-sky-600 ${initialTextClass} font-bold text-white`
    },
    vendorAvatarInitial(u)
  );
}

/** Hint + dropdown lead option — avoids showing fashion/food examples on electronics & other hubs. */
function marketplaceSubcategoryVendorCopy(category) {
  const hints = {
    food_drinks:
      "Buyers often search dishes or formats (“jollof platter”, “waakye lunch”, “smoothie”). Match the closest type so Marketplace search finds you.",
    fashion_accessories:
      "Buyers often search pieces (“sandals”, “ankara dresses”, “laptop tote”). Pick the closest fit for this listing.",
    electronics_gadgets:
      "Buyers often search gadgets (“Samsung phone”, “gaming pad”, “Type-C cable”, “Bluetooth speaker”). Pick the closest electronics bucket for this listing.",
    beauty_personal_care:
      "Buyers often search products (“hair oil”, “face serum”, “nail polish”). Pick the closest beauty or grooming type.",
    groceries_essentials:
      "Buyers often search packs (“vegetable oil 5L”, “indomie carton”, “detergent”). Pick the closest grocery type.",
    services:
      "Buyers often search by service (“Waec tutoring”, “event photos”, “phone screen repair”). Pick the closest fit.",
    books_academic:
      "Buyers often search formats (“Level 400 textbook bundle”, “novdec pack”, “exercise books”). Pick the closest type.",
    babies_infants:
      "Buyers often search essentials (“feeding bottles”, “newborn diapers”, “stroller”). Pick the closest infant category."
  };
  const placeholders = {
    food_drinks: "Choose food or drink sub-type (recommended)",
    fashion_accessories: "Choose fashion / accessory sub-type (recommended)",
    electronics_gadgets: "Choose electronics sub-type — phones, laptops, audio… (recommended)",
    beauty_personal_care: "Choose beauty sub-type — skin, hair, makeup… (recommended)",
    groceries_essentials: "Choose grocery sub-type — grains, drinks, hygiene… (recommended)",
    services: "Choose service sub-type (recommended)",
    books_academic: "Choose books / stationery sub-type (recommended)",
    babies_infants: "Choose baby / infant sub-type (recommended)"
  };
  const hint =
    hints[category] ||
    "Marketplace search uses this with your title. Pick the option that best describes what you are listing.";
  const placeholder =
    placeholders[category] || "Choose the closest listing sub-type (recommended)";
  return { hint, placeholder };
}

function vendorMarketSubcategorySelect(h, Field, SelectInput, category, subcategory, setSubcategory) {
  const rows = MARKETPLACE_SUBCATEGORY_OPTIONS[category] || [];
  const { hint, placeholder } = marketplaceSubcategoryVendorCopy(category);
  return h(Field, {
    key: "fld-market-subcategory",
    label: "Shopping sub-category"
  }, h("div", { className: "space-y-2" }, [
    h("p", { key: "h", className: "text-xs text-slate-500 dark:text-slate-400" }, hint),
    h(SelectInput, { value: subcategory, onChange: (e) => setSubcategory(e.target.value) }, [
      h("option", { key: "__", value: "" }, placeholder),
      ...rows.map((r) => h("option", { key: r.value, value: r.value }, r.label))
    ])
  ]));
}

function vendorStockAvailabilityControl(h, Field, meta, inStock, setInStock) {
  return h(
    Field,
    { key: "fld-avail", label: meta.stockLabel || "Availability" },
    h("div", { className: "space-y-2" }, [
      h("label", { className: "flex cursor-pointer items-center gap-2.5" }, [
        h("input", {
          type: "checkbox",
          checked: inStock,
          onChange: (e) => setInStock(e.target.checked),
          className: "h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 dark:border-white/20 dark:bg-night-950"
        }),
        h("span", { className: "text-sm font-medium text-slate-800 dark:text-slate-100" }, "In stock — available to buy")
      ]),
      h(
        "p",
        { className: "text-xs text-slate-500 dark:text-slate-400" },
        "Uncheck when sold out or you are not offering this listing right now. Buyers cannot add out-of-stock items to cart."
      )
    ])
  );
}

function VendorProductPhotos({ accessToken, imageList, setImageList, setErr, label = "Product photos", hintTail = "" }) {
  const fileInputId = useId().replace(/:/g, "");
  const [carouselIdx, setCarouselIdx] = useState(0);
  const thumbStripRef = useRef(null);

  useEffect(() => {
    setCarouselIdx((i) => {
      if (imageList.length === 0) return 0;
      return Math.min(Math.max(0, i), imageList.length - 1);
    });
  }, [imageList]);

  useEffect(() => {
    const strip = thumbStripRef.current;
    if (!strip || imageList.length < 2) return;
    const el = strip.querySelector(`button[data-tidx="${carouselIdx}"]`);
    try {
      el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    } catch {
      el?.scrollIntoView({ inline: "center", block: "nearest" });
    }
  }, [carouselIdx, imageList.length]);

  const onPick = async (e) => {
    setErr("");
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length || !accessToken) return;
    const room = MAX_PRODUCT_IMAGES - imageList.length;
    if (room <= 0) {
      setErr(`You can add at most ${MAX_PRODUCT_IMAGES} images per product.`);
      return;
    }
    const queue = files.slice(0, room);
    try {
      const allUrls = [];
      for (let i = 0; i < queue.length; i += UPLOAD_IMAGES_CHUNK) {
        const chunk = queue.slice(i, i + UPLOAD_IMAGES_CHUNK);
        const data = await apiUploadProductImages(chunk, accessToken);
        const urls = data.urls || [];
        allUrls.push(...urls);
      }
      setImageList((prev) => [...prev, ...allUrls]);
    } catch (ex) {
      setErr(apiErrorMessage(ex, "Upload failed"));
    }
  };
  const remove = (idx) =>
    setImageList((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next;
    });

  const goPrev = () => {
    if (imageList.length < 2) return;
    setCarouselIdx((i) => (i - 1 + imageList.length) % imageList.length);
  };
  const goNext = () => {
    if (imageList.length < 2) return;
    setCarouselIdx((i) => (i + 1) % imageList.length);
  };

  const hint = `Add many photos (JPEG, PNG, WebP, or GIF — max 5 MB each, up to ${MAX_PRODUCT_IMAGES} per product). Large selections upload in batches. They appear on the buyer storefront.${hintTail || ""}`;

  return h(Field, { label }, h("div", { className: "space-y-3" }, [
    h("p", { key: "ph-hint", className: "text-xs text-slate-500 dark:text-slate-400" }, hint),
    h("div", { key: "row", className: "flex flex-wrap items-center gap-2" }, [
      h("input", {
        key: "inp",
        id: fileInputId,
        type: "file",
        accept: "image/jpeg,image/png,image/webp,image/gif",
        multiple: true,
        className: "sr-only",
        onChange: onPick
      }),
      h(
        "label",
        {
          key: "lbl",
          htmlFor: fileInputId,
          className:
            "tap-target inline-flex cursor-pointer items-center justify-center rounded-2xl border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-500/20 dark:text-sky-200 dark:hover:bg-sky-500/15"
        },
        "Choose images"
      ),
      h("span", { key: "count", className: "text-xs text-slate-500 dark:text-slate-400" }, `${imageList.length} / ${MAX_PRODUCT_IMAGES}`)
    ]),
    imageList.length > 0
      ? h("div", { key: "gallery", className: "space-y-3" }, [
          h("div", { key: "hero", className: "relative overflow-hidden rounded-2xl border border-white/10 bg-slate-100/40 dark:bg-night-900/40" }, [
            h("img", {
              key: `hero-${carouselIdx}`,
              src: imageList[carouselIdx],
              alt: "",
              className: "aspect-[4/3] w-full object-cover sm:aspect-[16/10]"
            }),
            h(
              "button",
              {
                key: "rm-hero",
                type: "button",
                className:
                  "absolute right-2 top-2 rounded-full bg-night-950/80 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-600",
                onClick: () => remove(carouselIdx)
              },
              "Remove"
            ),
            imageList.length > 1
              ? h(f, { key: "nav" }, [
                  h(
                    "button",
                    {
                      key: "prev",
                      type: "button",
                      onClick: goPrev,
                      className:
                        "absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-md backdrop-blur hover:bg-white dark:bg-night-950/90 dark:text-white dark:hover:bg-night-900",
                      "aria-label": "Previous image"
                    },
                    h(ChevronLeft, { className: "h-6 w-6" })
                  ),
                  h(
                    "button",
                    {
                      key: "next",
                      type: "button",
                      onClick: goNext,
                      className:
                        "absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-md backdrop-blur hover:bg-white dark:bg-night-950/90 dark:text-white dark:hover:bg-night-900",
                      "aria-label": "Next image"
                    },
                    h(ChevronRight, { className: "h-6 w-6" })
                  ),
                  h(
                    "div",
                    {
                      key: "ctr",
                      className:
                        "absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-night-950/75 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur"
                    },
                    `${carouselIdx + 1} / ${imageList.length}`
                  )
                ])
              : null
          ]),
          imageList.length > 1
            ? h(
                "div",
                { key: "thumbs-wrap", className: "relative" },
                h(
                  "ul",
                  {
                    key: "thumbs",
                    ref: thumbStripRef,
                    className:
                      "no-scrollbar flex gap-2 overflow-x-auto scroll-smooth pb-1 pt-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                    role: "tablist",
                    "aria-label": "Product photo thumbnails"
                  },
                  imageList.map((url, idx) =>
                    h(
                      "li",
                      { key: `${url}-${idx}`, className: "relative shrink-0" },
                      h(
                        "button",
                        {
                          type: "button",
                          role: "tab",
                          "data-tidx": idx,
                          "aria-selected": idx === carouselIdx,
                          onClick: () => setCarouselIdx(idx),
                          className: `block overflow-hidden rounded-xl border-2 transition ${
                            idx === carouselIdx
                              ? "border-sky-500 ring-2 ring-sky-500/40"
                              : "border-transparent opacity-80 hover:opacity-100"
                          }`
                        },
                        h("img", {
                          src: url,
                          alt: "",
                          className: "h-16 w-16 object-cover sm:h-20 sm:w-20"
                        })
                      ),
                      h(
                        "button",
                        {
                          key: "rmb",
                          type: "button",
                          className:
                            "absolute right-0.5 top-0.5 rounded bg-night-950/75 px-1 py-0.5 text-[9px] font-semibold text-white hover:bg-rose-600",
                          onClick: (ev) => {
                            ev.stopPropagation();
                            remove(idx);
                          }
                        },
                        "×"
                      )
                    )
                  )
                )
              )
            : null
        ])
      : null
  ].filter(Boolean)));
}

function VendorBookPdfRow({ accessToken, pdfUrl, onPdfUrlChange, setErr }) {
  const inputId = useId().replace(/:/g, "");
  const pick = async (e) => {
    setErr("");
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file || !accessToken) return;
    try {
      const data = await apiUploadBookPdf(file, accessToken);
      if (data && data.url) onPdfUrlChange(String(data.url));
    } catch (ex) {
      setErr(apiErrorMessage(ex, "PDF upload failed"));
    }
  };
  return h(Field, { label: "PDF companion (optional)" }, h("div", { className: "space-y-2" }, [
    h(
      "p",
      { key: "h", className: "text-xs text-slate-500 dark:text-slate-400" },
      "Sell or bundle a syllabus pack, worksheet set, or reading PDF. Maximum 15 MB. Only PDF."
    ),
    h("div", { key: "r", className: "flex flex-wrap items-center gap-2" }, [
      h("input", {
        key: "in",
        id: inputId,
        type: "file",
        accept: "application/pdf",
        className: "sr-only",
        onChange: pick
      }),
      h(
        "label",
        {
          key: "lb",
          htmlFor: inputId,
          className:
            "tap-target inline-flex cursor-pointer items-center justify-center rounded-2xl border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-500/20 dark:text-sky-200 dark:hover:bg-sky-500/15"
        },
        "Upload PDF"
      ),
      pdfUrl
        ? h(
            Button,
            {
              key: "clr",
              type: "button",
              variant: "ghost",
              className: "!min-h-[36px] !px-3 !py-1.5 !text-xs",
              onClick: () => onPdfUrlChange("")
            },
            "Remove PDF"
          )
        : null
    ]),
    h(TextInput, {
      key: "url",
      value: pdfUrl || "",
      onChange: (e) => onPdfUrlChange(e.target.value),
      placeholder: "Or paste a hosted PDF URL"
    }),
    pdfUrl
      ? h(
          "a",
          {
            key: "open",
            href: pdfUrl,
            target: "_blank",
            rel: "noreferrer",
            className: "inline-block text-sm font-medium text-sky-600 underline hover:text-sky-500 dark:text-sky-300"
          },
          "Open current PDF"
        )
      : null
  ].filter(Boolean)));
}

function NavItem({ to, icon: Icon, children, badge, end }) {
  return h(NavLink, {
    to,
    end: Boolean(end),
    className: ({ isActive }) =>
      `flex items-center justify-between gap-2 rounded-2xl px-3 py-2.5 text-sm font-medium transition sm:px-4 sm:text-base ${
        isActive
          ? "bg-gradient-to-r from-sky-600/90 to-blue-700/90 text-white shadow-lg shadow-sky-900/30"
          : "text-slate-700 hover:bg-white/40 dark:text-slate-200 dark:hover:bg-white/10"
      }`,
    children: ({ isActive }) =>
      h(f, null, [
        h("span", { key: "left", className: "flex items-center gap-2" }, [
          h(Icon, { key: "ic", className: `h-4 w-4 sm:h-5 sm:w-5 ${isActive ? "text-white" : ""}` }),
          h("span", { key: "tx" }, children)
        ]),
        badge != null &&
          badge > 0 &&
          h(
            "span",
            {
              key: "badge",
              className: `rounded-full px-2 py-0.5 text-[10px] font-bold ${
                isActive ? "bg-white/20 text-white" : "bg-amber-400/20 text-amber-800 dark:text-amber-200"
              }`
            },
            String(badge)
          )
      ])
  });
}

/** Match API enums even if a legacy payload used spaces or different casing. */
function normalizeOrderStatus(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

export function VendorShell() {
  const { dark, toggle } = useTheme();
  const { user, accessToken, logout, setUser } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [orderBadge, setOrderBadge] = useState(0);
  const [showOfflineInquiries, setShowOfflineInquiries] = useState(false);

  /** Keep payout banner in sync with `/api/auth/me` (login payload used to omit Paystack flags). */
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    apiFetch("/api/auth/me", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => {
        if (!cancelled && d?.user) setUser(d.user);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [accessToken, setUser]);

  const refreshOrderBadge = () => {
    if (!accessToken || user?.role !== "seller") {
      setOrderBadge(0);
      return;
    }
    apiFetch("/api/vendor/orders", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => {
        const list = d.orders || [];
        const n = list.filter((o) =>
          ["pending_payment", "awaiting_vendor_payment", "paid", "processing", "sent_for_delivery"].includes(o.status)
        ).length;
        setOrderBadge(n);
      })
      .catch(() => setOrderBadge(0));
  };

  useEffect(() => {
    refreshOrderBadge();
    const onVis = () => {
      if (document.visibilityState === "visible") refreshOrderBadge();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [accessToken, user?.role]);

  useEffect(() => {
    if (!accessToken || user?.role !== "seller") {
      setShowOfflineInquiries(false);
      return;
    }
    let cancelled = false;
    apiFetch("/api/service-inquiries/seller/eligible", {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
      .then((d) => {
        if (!cancelled) setShowOfflineInquiries(!!d?.eligible);
      })
      .catch(() => {
        if (!cancelled) setShowOfflineInquiries(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, user?.role]);

  const onLogout = async () => {
    await logout();
    nav("/login", { replace: true });
  };

  const sidebar = h(
    "aside",
    {
      className: `fixed inset-y-0 left-0 z-40 flex h-[100dvh] max-h-[100dvh] w-60 max-w-[85vw] flex-col overflow-y-auto border-r border-white/10 bg-white/35 p-4 shadow-2xl backdrop-blur-2xl transition-transform dark:bg-night-900/50 lg:max-w-none lg:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      }`
    },
    [
      h("div", { key: "mobile-head", className: "mb-6 flex items-center justify-between gap-2 lg:hidden" }, [
        h("span", { key: "label", className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, "Menu"),
        h(
          "button",
          {
            key: "close",
            type: "button",
            className: "tap-target rounded-xl p-2 hover:bg-white/10",
            onClick: () => setOpen(false)
          },
          h(X, { className: "h-5 w-5" })
        )
      ]),
      h("div", { key: "main-title", className: "mb-6 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400" }, "Main"),
      h("nav", { key: "main-nav", className: "space-y-1" }, [
        h(NavItem, { key: "n-dash", to: "/vendor/dashboard", icon: LayoutDashboard }, "Dashboard"),
        h(NavItem, { key: "n-onb", to: "/vendor/onboarding", icon: Sparkles }, "Get started"),
        h(NavItem, { key: "n-str", to: "/vendor/stores", icon: Building2 }, "Stores"),
        h(NavItem, { key: "n-promo", to: "/vendor/promotions", icon: Percent }, "Deals & offers"),
        h(NavItem, { key: "n-prod", to: "/vendor/products", icon: Box, end: true }, "My products"),
        h(NavItem, { key: "n-add", to: "/vendor/products/new", icon: PlusCircle }, "Add product"),
        h(NavItem, { key: "n-orders", to: "/vendor/orders", icon: ShoppingCart, badge: orderBadge }, "Orders"),
        h(NavItem, { key: "n-msg", to: "/vendor/messages", icon: MessageSquare }, "Messages"),
        showOfflineInquiries
          ? h(NavItem, { key: "n-svc", to: "/vendor/service-inquiries", icon: CalendarClock }, "Service requests")
          : null,
        h(NavItem, { key: "n-rep", to: "/vendor/reports", icon: AlertTriangle }, "Reports")
      ]),
      h("div", { key: "ins-title", className: "mb-2 mt-6 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400" }, "Insights"),
      h("nav", { key: "ins-nav", className: "space-y-1" }, [
        h(NavItem, { key: "n-reviews", to: "/vendor/reviews", icon: Star }, "Reviews")
      ]),
      h("div", { key: "set-title", className: "mb-2 mt-6 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400" }, "Settings"),
      h("nav", { key: "set-nav", className: "space-y-1" }, [
        h(NavItem, { key: "n-settings", to: "/vendor/settings", icon: Settings }, "Store settings")
      ]),
      h("div", { key: "sidebar-spacer", className: "min-h-0 flex-1" }),
      h(
        GlassCard,
        { key: "hub-card", className: "mt-auto !border-sky-500/20 !bg-gradient-to-br !from-sky-900/80 !to-night-950 !p-4" },
        [
          h("p", { key: "t", className: "text-xs font-bold uppercase tracking-wide text-sky-200" }, "Vendor hub"),
          h("p", { key: "d", className: "mt-1 text-xs text-white/80" }, "Manage listings, orders, and payouts from one place.")
        ]
      )
    ]
  );

  return h("div", { className: "min-h-screen bg-slate-100 dark:bg-night-950 dark:bg-mesh-dark" }, [
    open &&
      h("button", {
        key: "overlay",
        type: "button",
        className: "fixed inset-0 z-30 bg-slate-950/50 backdrop-blur-sm lg:hidden",
        onClick: () => setOpen(false),
        "aria-label": "Close menu"
      }),
    h("div", { key: "layout", className: "flex min-h-screen" }, [
      h("div", { key: "sidebar-gutter", className: "w-0 shrink-0 lg:w-60", "aria-hidden": true }),
      sidebar,
      h("div", { key: "content-wrap", className: "flex min-h-screen min-w-0 flex-1 flex-col" }, [
        h(
          "header",
          {
            key: "header",
            className:
              "sticky top-0 z-20 border-b border-white/10 bg-white/30 px-4 py-3 backdrop-blur-xl dark:bg-night-900/40 sm:px-6"
          },
          h("div", { key: "header-inner", className: "mx-auto flex max-w-7xl items-center justify-between gap-3" }, [
            h(
              "button",
              {
                key: "menu-btn",
                type: "button",
                className: "tap-target rounded-2xl border border-white/15 p-2 lg:hidden",
                onClick: () => setOpen(true)
              },
              h(Menu, { className: "h-5 w-5" })
            ),
            h("div", { key: "brand", className: "flex items-center gap-2" }, [
              h(LogoMark, { key: "logo", className: "h-9 w-9" }),
              h("span", { key: "name", className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, "SHOPIQGH"),
              h(
                "span",
                {
                  key: "badge",
                  className:
                    "hidden rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-900 dark:text-amber-200 sm:inline"
                },
                "Vendor"
              )
            ]),
            h("div", { key: "actions", className: "flex items-center gap-2 sm:gap-3" }, [
              h(ThemeToggleButton, { key: "theme", dark, onToggle: toggle }),
              h(NotificationBell, { key: "bell", to: "/vendor/notifications" }),
              h(
                "div",
                {
                  key: "user-chip",
                  className:
                    "flex min-w-0 max-w-[min(12rem,38vw)] items-center gap-2 rounded-2xl border border-white/10 bg-white/20 px-2.5 py-1.5 sm:max-w-[14rem] sm:px-3 dark:bg-white/5",
                  title: user?.displayName || user?.email || "Vendor"
                },
                [
                  h("div", { key: "avatar", className: "shrink-0" }, vendorUserAvatarNode(user, { sizeClass: "h-8 w-8" })),
                  h(
                    "span",
                    {
                      key: "display",
                      className: "min-w-0 truncate text-xs font-medium text-slate-800 dark:text-slate-100 sm:text-sm"
                    },
                    user?.displayName || user?.email || "Vendor"
                  )
                ]
              ),
              h(
                "button",
                {
                  key: "hdr-logout",
                  type: "button",
                  onClick: onLogout,
                  className:
                    "tap-target flex shrink-0 items-center gap-1.5 rounded-2xl border border-white/10 bg-white/10 px-2.5 py-2 text-xs font-medium text-slate-700 hover:border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:text-rose-300",
                  title: "Log out",
                  "aria-label": "Log out"
                },
                [
                  h(LogOut, { key: "lo-ic", className: "h-4 w-4 sm:h-5 sm:w-5" }),
                  h("span", { key: "lo-tx", className: "hidden sm:inline" }, "Log out")
                ]
              )
            ])
          ])
        ),
        h("main", { key: "main", className: "mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6" }, [
          user?.role === "seller" && user?.vendorBilling && !user.vendorBilling.canOperate
            ? h(
                InlineNotice,
                {
                  key: "subscription-banner",
                  variant: "warning",
                  title: "Seller subscription required",
                  className: "mb-5"
                },
                h("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" }, [
                  h("p", { key: "blurb", className: "min-w-0" }, user.vendorBilling.message),
                  h(
                    Link,
                    { key: "set", to: "/vendor/settings#vendor-seller-subscription", className: "shrink-0" },
                    h(Button, { className: "!min-h-10 w-full !px-4 !py-2.5 !text-sm sm:w-auto" }, "Subscribe now")
                  )
                ])
              )
            : user?.role === "seller" &&
                user?.vendorBilling?.phase === "launch_trial" &&
                user.vendorBilling.daysLeftInTrial != null
              ? h(
                  InlineNotice,
                  {
                    key: "trial-banner",
                    variant: "info",
                    title: "Free seller trial",
                    className: "mb-5"
                  },
                  user.vendorBilling.message
                )
              : null,
          user?.role === "seller" && !user?.paystackPayoutRegistered
            ? h(
                InlineNotice,
                {
                  key: "paystack-banner",
                  variant: "warning",
                  title: "Register Paystack payouts",
                  className: "mb-5"
                },
                h("div", { className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" }, [
                  h(
                    "p",
                    { key: "blurb", className: "min-w-0" },
                    "Link where you receive payouts (MoMo wallet or bank account) in Store settings. Buyers can pay by card or MoMo at checkout — that is separate from your payout link."
                  ),
                  h(
                    Link,
                    { key: "set", to: "/vendor/settings#vendor-paystack-payouts", className: "shrink-0" },
                    h(Button, { className: "!min-h-10 w-full !px-4 !py-2.5 !text-sm sm:w-auto" }, "Register in Store settings")
                  )
                ])
              )
            : null,
          h(Outlet, { key: "out" })
        ])
      ])
    ])
  ]);
}

function KpiIcon({ name }) {
  const map = {
    wallet: Package,
    package: Box,
    "shopping-bag": ShoppingCart,
    star: Star
  };
  const Icon = map[name] || BarChart3;
  return h(
    "div",
    {
      className:
        "flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-600 dark:text-sky-300"
    },
    h(Icon, { className: "h-5 w-5" })
  );
}

function dashboardGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function VendorDashboardPage() {
  const { accessToken, user } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [allOrders, setAllOrders] = useState([]);
  const [myProducts, setMyProducts] = useState([]);
  const [err, setErr] = useState("");
  const [storeCount, setStoreCount] = useState(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    apiFetch("/api/businesses/mine", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => {
        if (!cancelled) setStoreCount(Array.isArray(d.businesses) ? d.businesses.length : 0);
      })
      .catch(() => {
        if (!cancelled) setStoreCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    trackVendorAnalyticsEvent(accessToken, { type: "dashboard_view" });
    let cancelled = false;
    setErr("");
    Promise.all([
      apiFetch("/api/vendor/analytics?days=30", { headers: { Authorization: `Bearer ${accessToken}` } }),
      apiFetch("/api/vendor/orders", { headers: { Authorization: `Bearer ${accessToken}` } }),
      apiFetch("/api/products/mine", { headers: { Authorization: `Bearer ${accessToken}` } })
    ])
      .then(([a, o, p]) => {
        if (cancelled) return;
        setErr("");
        setAnalytics(a);
        setAllOrders(o.orders || []);
        setMyProducts(p.products || []);
      })
      .catch((ex) => {
        if (!cancelled) setErr(apiErrorMessage(ex, "Failed to load dashboard"));
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const kpis = useMemo(() => {
    if (!analytics) return [];
    return [
      { label: "Active listings", value: String(analytics.productCount ?? 0), delta: "Products", icon: "package" },
      { label: "Orders (paid+)", value: String(analytics.orderCount ?? 0), delta: "All time", icon: "shopping-bag" },
      { label: "Revenue", value: formatGhc(analytics.revenue || 0), delta: "All time", icon: "wallet" },
      { label: "Reviews", value: String(analytics.reviewCount ?? 0), delta: "On your products", icon: "star" }
    ];
  }, [analytics]);

  const greet = user?.displayName?.trim() || user?.email?.split("@")[0] || "there";

  return h(f, null, [
    err
      ? h(InlineNotice, { key: "err", variant: "error", className: "mb-4", onDismiss: () => setErr("") }, err)
      : null,
    storeCount !== null && storeCount === 0 &&
      h(
        InlineNotice,
        { key: "onb", variant: "info", className: "mb-4", title: "Create your first storefront" },
        h("div", { className: "text-sm" }, [
          h("p", { key: "a" }, "SHOPIQGH works best when you add a business profile before listings — category hubs and /store/your-slug link to it."),
          h(
            Link,
            {
              key: "b",
              to: "/vendor/onboarding",
              className: "mt-2 inline-block font-semibold text-sky-700 underline dark:text-sky-300"
            },
            "Open the guided setup →"
          )
        ])
      ),
    !analytics && !err && h("p", { key: "loading", className: "mb-4 text-sm text-slate-500 dark:text-slate-400" }, "Loading dashboard…"),
    h("div", { key: "hero", className: "mb-6 flex flex-wrap items-center justify-between gap-3" }, [
      h("div", { key: "hero-copy" }, [
        h(
          "h1",
          { key: "title", className: "font-display text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl" },
          `${dashboardGreeting()}, ${greet}! 👋`
        ),
        h(
          "p",
          { key: "subtitle", className: "mt-1 text-sm text-slate-600 dark:text-slate-400" },
          "Here's what's happening with your store today."
        )
      ]),
      h(
        Link,
        { key: "add-link", to: "/vendor/products/new" },
        h(Button, { className: "!rounded-full" }, [h(PlusCircle, { key: "ic", className: "h-4 w-4" }), h("span", { key: "tx" }, "Add product")])
      )
    ]),
    h("div", { key: "kpis", className: "mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" }, [
      kpis.map((k) =>
        h(GlassCard, { key: k.label }, [
          h("div", { key: "row", className: "flex items-start justify-between gap-3" }, [
            h("div", { key: "copy" }, [
              h("p", { key: "lb", className: "text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, k.label),
              h("p", { key: "val", className: "mt-2 text-2xl font-bold text-slate-900 dark:text-white" }, k.value),
              h("p", { key: "dl", className: "mt-1 text-xs font-medium text-emerald-500 dark:text-emerald-400" }, k.delta)
            ]),
            h(KpiIcon, { key: "ic", name: k.icon })
          ])
        ])
      )
    ]),
    analytics ? h(VendorDashboardBody, { key: "dash-body", analytics, allOrders, myProducts }) : null
  ]);
}

function productStatusTone(st) {
  if (st === "active") return "success";
  if (st === "draft") return "warn";
  if (st === "pending_approval") return "warn";
  if (st === "rejected") return "danger";
  return "neutral";
}

function formatProductStatus(st) {
  if (st === "pending_approval") return "Pending review";
  if (st === "rejected") return "Rejected";
  if (st === "active") return "Live";
  if (st === "draft") return "Draft";
  return st || "—";
}

export function VendorProductsPage() {
  const { accessToken } = useAuth();
  const { alert, confirm } = useNotice();
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!accessToken) return;
    setErr("");
    setLoading(true);
    apiFetch("/api/products/mine", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => setRows(d.products || []))
      .catch((ex) => setErr(apiErrorMessage(ex, "Failed to load")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    trackVendorAnalyticsEvent(accessToken, { type: "products_list_view" });
  }, [accessToken]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((p) => p.name?.toLowerCase().includes(t) || p.category?.toLowerCase().includes(t));
  }, [rows, q]);

  const del = async (id) => {
    if (!accessToken) return;
    const ok = await confirm("Delete this product? You can’t undo this.", {
      title: "Remove listing?",
      confirmLabel: "Delete",
      cancelLabel: "Keep"
    });
    if (!ok) return;
    try {
      await apiFetch(`/api/products/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
      load();
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Delete failed"), { variant: "error", title: "Couldn’t delete" });
    }
  };

  return h(f, null, [
    err ? h(InlineNotice, { key: "err", variant: "error", className: "mb-4", onDismiss: () => setErr("") }, err) : null,
    h("div", { key: "hdr-row", className: "mb-6 flex flex-wrap items-center justify-between gap-3" }, [
      h("h1", { className: "flex items-center gap-2 font-display text-2xl font-bold text-slate-900 dark:text-white" }, [
        h(Box, { className: "h-7 w-7 text-sky-400" }),
        "My products"
      ]),
      h("div", { className: "flex flex-1 flex-wrap items-center gap-2 sm:flex-initial" }, [
        h(TextInput, {
          placeholder: "Search products…",
          className: "!min-w-[200px] flex-1 sm:max-w-xs",
          value: q,
          onChange: (e) => setQ(e.target.value)
        }),
        h(Link, { key: "add-new", to: "/vendor/products/new" }, h(Button, { className: "!rounded-full" }, [h(PlusCircle, { key: "pic", className: "h-4 w-4" }), "Add product"]))
      ])
    ]),
    loading ? h("p", { key: "loading", className: "mb-4 text-sm text-slate-500" }, "Loading…") : null,
    h(GlassCard, { key: "table-wrap", className: "!overflow-x-auto !p-0" }, h("table", { className: "w-full min-w-[640px] text-left text-sm" }, [
      h("thead", { className: "border-b border-white/10 bg-white/20 text-xs uppercase text-slate-500 dark:bg-white/5 dark:text-slate-400" }, h("tr", null, [
        h("th", { key: "h-prod", className: "px-4 py-3" }, "Product"),
        h("th", { key: "h-cat", className: "px-4 py-3" }, "Category"),
        h("th", { key: "h-price", className: "px-4 py-3" }, "Price"),
        h("th", { key: "h-stock", className: "px-4 py-3" }, "Availability"),
        h("th", { key: "h-st", className: "px-4 py-3" }, "Status"),
        h("th", { key: "h-act", className: "px-4 py-3" }, "Actions")
      ])),
      h(
        "tbody",
        { className: "divide-y divide-white/10" },
        filtered.map((row, i) =>
          h("tr", { key: row.id || `product-${i}`, className: "hover:bg-white/10" }, [
            h("td", { key: "c-name", className: "px-4 py-3" }, h("div", { className: "flex items-center gap-3" }, [
              h(RefImage, {
                key: "img",
                src: row.imageUrls?.[0],
                n: refFromId(row.id),
                alt: row.name,
                className: "h-10 w-10 rounded-lg object-cover"
              }),
              h("span", { key: "nm", className: "font-medium text-slate-900 dark:text-white" }, row.name)
            ])),
            h("td", { key: "c-cat", className: "px-4 py-3 text-slate-600 dark:text-slate-300" }, CATEGORY_LABELS[row.category] || row.category),
            h("td", { key: "c-price", className: "px-4 py-3 font-semibold text-slate-900 dark:text-white" }, row.category === "services" ? "Quote on request" : isFoodCallToOrderCategory(row) ? "Buy" : formatGhc(row.price)),
            h(
              "td",
              { key: "c-stock", className: "px-4 py-3" },
              Number(row.stock) > 0 ? "In stock" : "Out of stock"
            ),
            h("td", { key: "c-st", className: "px-4 py-3" }, h(Badge, { tone: productStatusTone(row.status) }, formatProductStatus(row.status))),
            h("td", { key: "c-act", className: "px-4 py-3" }, h("div", { className: "flex flex-wrap gap-2" }, [
              h(
                Button,
                {
                  key: "edit",
                  variant: "ghost",
                  className: "!min-h-[36px] !px-3 !py-2 !text-xs",
                  type: "button",
                  onClick: () => nav(`/vendor/products/${row.id}`)
                },
                "Edit"
              ),
              h(
                Button,
                {
                  key: "del",
                  variant: "danger",
                  className: "!min-h-[36px] !px-3 !py-2 !text-xs",
                  type: "button",
                  onClick: () => del(row.id)
                },
                "Delete"
              )
            ]))
          ])
        )
      )
    ]))
  ]);
}

function renderVendorStoreFields(h, opts) {
  const {
    Field,
    SelectInput,
    Link,
    businesses,
    storesLoading,
    businessId,
    selectBusiness,
    menuSections,
    menuSectionId,
    setMenuSectionId,
    onCategorySync
  } = opts;
  if (storesLoading) {
    return [
      h("p", { key: "stores-load", className: "text-sm text-slate-500 dark:text-slate-400" }, "Loading your stores…")
    ];
  }
  if (!businesses.length) {
    return [
      h(
        "div",
        {
          key: "no-store",
          className:
            "rounded-2xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/40 dark:text-amber-100"
        },
        [
          "Listings only appear on your store when linked to a store profile. ",
          h(Link, { to: "/vendor/stores", className: "font-semibold underline" }, "Create a store")
        ]
      )
    ];
  }
  const selected =
    businesses.find((b) => b.id === businessId) || (businesses.length === 1 ? businesses[0] : null);
  const isFood = storeUsesMenuSections(selected?.businessType);
  const storeFieldLabel = isFood ? "Store menu" : "Store";
  const autoLinkHint = isFood
    ? " — new dishes are added to this menu automatically."
    : " — new listings are added to this store automatically.";
  const nodes = [
    businesses.length === 1
      ? h(
          Field,
          { key: "fld-store", label: storeFieldLabel },
          h(
            "p",
            { className: "text-sm text-slate-700 dark:text-slate-300" },
            [
              h("span", { className: "font-semibold" }, selected?.name || selected?.slug || "Your store"),
              autoLinkHint
            ]
          )
        )
      : h(
          Field,
          { key: "fld-store", label: storeFieldLabel },
          h(
            SelectInput,
            {
              value: businessId || businesses[0]?.id || "",
              onChange: (e) => selectBusiness(e.target.value, onCategorySync)
            },
            businesses.map((b) => h("option", { key: b.id, value: b.id }, b.name || b.slug || "Store"))
          )
        )
  ];
  if (isFood && menuSections.length) {
    nodes.push(
      h(
        Field,
        { key: "fld-menu-sec", label: "Menu section (optional)" },
        h(
          SelectInput,
          { value: menuSectionId, onChange: (e) => setMenuSectionId(e.target.value) },
          [
            h("option", { key: "none", value: "" }, "No section"),
            ...menuSections.map((s) => h("option", { key: s.id, value: s.id }, s.title || "Section"))
          ]
        )
      )
    );
  }
  return nodes;
}

const STANDARD_PRODUCT_TAGS = new Set(["popular", "sale"]);

/** @returns {string[]} */
function buildVendorSubmitTags(showTags, { tagPopular, tagSale, extraCsv }) {
  if (!showTags) return [];
  const list = [];
  if (tagPopular) list.push("popular");
  if (tagSale) list.push("sale");
  String(extraCsv || "")
    .split(",")
    .map((s) =>
      String(s)
        .trim()
        .toLowerCase()
        .slice(0, 32)
    )
    .filter(Boolean)
    .forEach((t) => {
      if (t === "new" || STANDARD_PRODUCT_TAGS.has(t)) return;
      list.push(t);
    });
  return [...new Set(list)].slice(0, 10);
}

/** @param {string[]} tagsArray */
function promoTagCheckboxState(tagsArray) {
  const arr = (tagsArray || []).map((x) => String(x).trim().toLowerCase()).filter((t) => t && t !== "new");
  return {
    tagPopular: arr.includes("popular"),
    tagSale: arr.includes("sale"),
    tagExtras: arr.filter((t) => !STANDARD_PRODUCT_TAGS.has(t)).join(", ")
  };
}

/** @param {typeof import("../utils/h").h} h */
function vendorListingTagField(h, Field, TextInput, { tagPopular, setTagPopular, tagSale, setTagSale, tagExtras, setTagExtras }) {
  const chk = (key, checked, lab, setter) =>
    h("label", { key, className: "flex cursor-pointer items-center gap-2 text-sm text-slate-800 dark:text-slate-100" }, [
      h("input", { type: "checkbox", checked, onChange: (e) => setter(e.target.checked) }),
      lab
    ]);
  return h(Field, { key: "fld-tags", label: "Storefront badges (optional)" }, [
    h(
      "p",
      { key: "tg-h", className: "mb-3 text-xs text-slate-500 dark:text-slate-400" },
      "Shoppers see a New ribbon automatically for 7 days after you publish a listing — you cannot pin New longer. Choose Popular or Sale below if you want extra badges."
    ),
    h("div", { key: "tg-row", className: "mb-3 flex flex-wrap gap-x-5 gap-y-2" }, [
      chk("tg-pop", tagPopular, "Popular", setTagPopular),
      chk("tg-sale", tagSale, "Sale", setTagSale)
    ]),
    h("p", { key: "tg-xlb", className: "mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500" }, "Other tags"),
    h(TextInput, {
      key: "tg-x",
      value: tagExtras,
      onChange: (e) => setTagExtras(e.target.value),
      placeholder: "Optional — comma-separated, e.g. organic, bestseller",
      className: "mt-1"
    })
  ]);
}

export function VendorAddProductPage() {
  const { accessToken } = useAuth();
  const nav = useNavigate();
  const storePicker = useVendorStorePicker(accessToken);
  const {
    businesses,
    storesLoading,
    businessId,
    selectBusiness,
    menuSections,
    menuSectionId,
    setMenuSectionId,
    selectedBusiness
  } = storePicker;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("food_drinks");
  const [price, setPrice] = useState("");
  const [addons, setAddons] = useState([]);
  const [addonKind, setAddonKind] = useState("add");
  const [addonLabel, setAddonLabel] = useState("");
  const [addonPrice, setAddonPrice] = useState("");
  const [inStock, setInStock] = useState(true);
  const [subcategory, setSubcategory] = useState("");
  const [tagPopular, setTagPopular] = useState(false);
  const [tagSale, setTagSale] = useState(false);
  const [tagExtras, setTagExtras] = useState("");
  const [attrs, setAttrs] = useState(() => emptyAttrsForCategory("food_drinks"));
  const [imageList, setImageList] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const meta = useMemo(() => getListingMeta(category), [category]);

  const syncCategoryFromStore = useCallback((cat) => {
    setCategory(cat);
    setAttrs(emptyAttrsForCategory(cat));
    setAddons([]);
    setSubcategory("");
  }, []);

  useEffect(() => {
    if (!selectedBusiness) return;
    const cat = productCategoryForBusinessType(selectedBusiness.businessType);
    setCategory(cat);
    setAttrs(emptyAttrsForCategory(cat));
    setAddons([]);
    setSubcategory("");
  }, [selectedBusiness?.id, selectedBusiness?.businessType]);

  useEffect(() => {
    setAttrs(emptyAttrsForCategory(category));
    setAddons([]);
    setSubcategory("");
  }, [category]);

  const submit = async (asDraft) => {
    setErr("");
    if (!accessToken) return;
    const m = getListingMeta(category);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErr(`${m.nameLabel} is required.`);
      return;
    }
    const linkedStoreId = businessId || businesses[0]?.id || "";
    let priceNum = 0;
    if (!m.hidePrice) {
      priceNum = Number(price);
      if (!Number.isFinite(priceNum) || priceNum <= 0) {
        setErr("Enter a valid price greater than zero.");
        return;
      }
    }
    if (!asDraft && !subcategory.trim()) {
      setErr(
        "Choose a shopping sub-category for this listing — it connects your item to Marketplace search (beyond the broad category)."
      );
      return;
    }
    if (!asDraft) {
      const attrErr = validateCategoryAttributesForPublish(category, attrs, { publishing: true });
      if (attrErr) {
        setErr(attrErr);
        return;
      }
    }
    setLoading(true);
    try {
      const tagList = buildVendorSubmitTags(m.showTags, {
        tagPopular,
        tagSale,
        extraCsv: tagExtras
      });
      const urls = imageList.slice(0, MAX_PRODUCT_IMAGES);
      const nextStatus = asDraft ? "draft" : "active";
      const attrsPayload = buildCategoryAttributesPayload(category, attrs);
      const addonsPayload = m.showAddons ? vendorAddonsPayload(addons) : [];
      const body = {
        name: trimmedName,
        description: description.trim(),
        category,
        subcategory: subcategory.trim() ? subcategory.trim() : null,
        price: priceNum,
        compareAtPrice: null,
        stock: inStock ? LISTING_STOCK_WHEN_AVAILABLE : 0,
        status: nextStatus,
        tags: tagList,
        imageUrls: urls,
        ...(m.showAddons ? { addons: addonsPayload } : {}),
        ...(Object.keys(attrsPayload).length ? { categoryAttributes: attrsPayload } : {}),
        ...(linkedStoreId ? { businessId: linkedStoreId } : {}),
        ...(() => {
          const sid = resolveMenuSectionIdForStore(
            menuSectionId,
            menuSections,
            selectedBusiness?.businessType
          );
          return sid ? { menuSectionId: sid } : {};
        })()
      };
      if (!asDraft && urls.length === 0) {
        setErr(m.isService ? "Add at least one portfolio image before publishing." : "Add at least one product photo before publishing.");
        setLoading(false);
        return;
      }
      await apiFetch("/api/products", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: body
      });
      const returnSlug = selectedBusiness?.slug || storePicker.storeSlugParam;
      nav(returnSlug ? `/vendor/stores/${encodeURIComponent(returnSlug)}#store-menu` : "/vendor/products");
    } catch (ex) {
      setErr(apiErrorMessage(ex, "Could not create product"));
    } finally {
      setLoading(false);
    }
  };

  const priceStockRow = h("div", { key: "row-price-stock", className: "grid grid-cols-1 gap-4 sm:grid-cols-2" }, [
    h(Field, { key: "fld-price", label: "Price (Ghc)" }, h(TextInput, { type: "number", step: "0.01", value: price, onChange: (e) => setPrice(e.target.value), placeholder: "18.99" })),
    vendorStockAvailabilityControl(h, Field, meta, inStock, setInStock)
  ]);

  const catFieldsNodes = renderListingCategoryFields(h, {
    Field,
    TextInput,
    TextArea,
    SelectInput,
    category,
    attrs,
    setAttrs
  });

  const innerFields = [
    ...renderVendorStoreFields(h, {
      Field,
      SelectInput,
      Link,
      businesses,
      storesLoading,
      businessId,
      selectBusiness,
      menuSections,
      menuSectionId,
      setMenuSectionId,
      onCategorySync: syncCategoryFromStore
    }),
    selectedBusiness
      ? h(
          "p",
          {
            key: "cat-hint",
            className: "text-xs text-slate-500 dark:text-slate-400"
          },
          `Listing category for this store: ${CATEGORY_LABELS[category] || category}.`
        )
      : h(
          Field,
          { key: "fld-cat", label: "Listing category" },
          h(
            SelectInput,
            { value: category, onChange: (e) => setCategory(e.target.value) },
            PRODUCT_CATEGORY_VALUES.map((c) => h("option", { key: c, value: c }, CATEGORY_LABELS[c] || c))
          )
        ),
    meta.isService
      ? h(
          "div",
          {
            key: "svc-intro",
            className:
              "rounded-2xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/40 dark:text-amber-100"
          },
          "You're creating a service listing — graphic design, hair, typing, laundry, photography, tutoring, etc. Set a base price and optional add-ons; buyers check out on-platform and can message you for details."
        )
      : null,
    category === "food_drinks" && meta.hidePrice
      ? h(
          "div",
          {
            key: "food-intro",
            className:
              "rounded-2xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-500/35 dark:bg-emerald-950/40 dark:text-emerald-100"
          },
          "Food & drinks use call-to-order on the shop: no list price or inventory count here. Set prep time and availability in the fields below; buyers reach you from the listing to confirm price and pickup or delivery."
        )
      : null,
    vendorMarketSubcategorySelect(h, Field, SelectInput, category, subcategory, setSubcategory),
    h(Field, { key: "fld-name", label: meta.nameLabel }, h(TextInput, { value: name, onChange: (e) => setName(e.target.value), placeholder: meta.namePlaceholder })),
    h(Field, { key: "fld-desc", label: meta.descLabel }, h(TextArea, { value: description, onChange: (e) => setDescription(e.target.value), placeholder: meta.descPlaceholder }))
  ].filter(Boolean);

  if (!meta.hidePrice && category !== "groceries_essentials") innerFields.push(priceStockRow);
  const addonBlockAdd = vendorListingAddonsBlock(
    h,
    Field,
    TextInput,
    meta,
    addons,
    setAddons,
    addonKind,
    setAddonKind,
    addonLabel,
    setAddonLabel,
    addonPrice,
    setAddonPrice
  );
  if (addonBlockAdd) innerFields.push(addonBlockAdd);
  innerFields.push(...catFieldsNodes);
  if (!meta.hidePrice && category === "groceries_essentials") innerFields.push(priceStockRow);
  if (category === "books_academic") {
    innerFields.push(
      h(VendorBookPdfRow, {
        key: "pdf",
        accessToken,
        pdfUrl: attrs.pdfUrl || "",
        onPdfUrlChange: (v) => setAttrs((prev) => ({ ...prev, pdfUrl: v })),
        setErr
      })
    );
  }
  if (meta.showTags) {
    innerFields.push(
      vendorListingTagField(h, Field, TextInput, {
        tagPopular,
        setTagPopular,
        tagSale,
        setTagSale,
        tagExtras,
        setTagExtras
      })
    );
  }
  innerFields.push(
    h(VendorProductPhotos, {
      key: "photos",
      accessToken,
      imageList,
      setImageList,
      setErr,
      label: meta.photosLabel,
      hintTail: meta.photosHintTail
    })
  );

  const publishAside = [
    h("p", { className: "text-xs text-slate-500 dark:text-slate-400" }, `${meta.publishBlurb}${meta.draftHelp ? ` ${meta.draftHelp}` : ""}`)
  ];

  return h(f, null, [
    err ? h(InlineNotice, { key: "err", variant: "error", className: "mb-4", onDismiss: () => setErr("") }, err) : null,
    h("div", { key: "add-hdr", className: "mb-6 flex flex-wrap items-center justify-between gap-3" }, [
      h("h1", { className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, meta.pageHeading),
      h(Link, { to: "/vendor/products" }, h(Button, { variant: "ghost", className: "!rounded-full" }, "← Back to products"))
    ]),
    h("div", { key: "add-grid", className: "grid grid-cols-1 gap-6 lg:grid-cols-3" }, [
      h("div", { key: "add-main", className: "space-y-6 lg:col-span-2" }, [
        h(GlassPanel, { key: "add-details" }, [
          h("h2", { className: "mb-4 font-semibold text-slate-900 dark:text-white" }, meta.formPanelTitle),
          h("div", { className: "space-y-4" }, innerFields)
        ])
      ]),
      h("div", { key: "add-side", className: "space-y-6" }, [
        h(GlassPanel, { key: "add-publish" }, [
          h("h2", { className: "mb-2 font-semibold text-slate-900 dark:text-white" }, meta.publishTitle),
          ...publishAside,
          h(
            Button,
            {
              className: "mt-4 w-full",
              loading,
              type: "button",
              onClick: () => submit(false)
            },
            meta.isService ? "Submit service for review" : "Submit for review"
          ),
          h(
            Button,
            { variant: "ghost", className: "mt-2 w-full", type: "button", disabled: loading, onClick: () => submit(true) },
            "Save as draft"
          )
        ])
      ])
    ])
  ]);
}

export function VendorEditProductPage() {
  const { productId } = useParams();
  const { accessToken } = useAuth();
  const nav = useNavigate();
  const storePicker = useVendorStorePicker(accessToken);
  const {
    businesses,
    storesLoading,
    businessId,
    setBusinessId,
    selectBusiness,
    menuSections,
    menuSectionId,
    setMenuSectionId,
    selectedBusiness
  } = storePicker;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("food_drinks");
  const [price, setPrice] = useState("");
  const [addons, setAddons] = useState([]);
  const [addonKind, setAddonKind] = useState("add");
  const [addonLabel, setAddonLabel] = useState("");
  const [addonPrice, setAddonPrice] = useState("");
  const [inStock, setInStock] = useState(true);
  const [subcategory, setSubcategory] = useState("");
  const [status, setStatus] = useState("draft");
  const [serverStatus, setServerStatus] = useState(null);
  const [rejectionReason, setRejectionReason] = useState(null);
  const [tagPopular, setTagPopular] = useState(false);
  const [tagSale, setTagSale] = useState(false);
  const [tagExtras, setTagExtras] = useState("");
  const [attrs, setAttrs] = useState(() => emptyAttrsForCategory("food_drinks"));
  const [imageList, setImageList] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const meta = useMemo(() => getListingMeta(category), [category]);

  const syncCategoryFromStore = useCallback((cat) => {
    setCategory(cat);
    setAttrs(emptyAttrsForCategory(cat));
    setAddons([]);
    setSubcategory("");
  }, []);

  useEffect(() => {
    if (!accessToken || !productId) return;
    trackVendorAnalyticsEvent(accessToken, { type: "product_edit_view", productId });
  }, [accessToken, productId]);

  useEffect(() => {
    if (!accessToken || !productId) return;
    let cancelled = false;
    apiFetch(`/api/products/${productId}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => {
        if (cancelled || !d.product) return;
        const p = d.product;
        const cat = p.category || "food_drinks";
        setName(p.name || "");
        setDescription(p.description || "");
        setCategory(cat);
        setPrice(String(p.price ?? ""));
        setInStock(Number(p.stock) > 0);
        setSubcategory(typeof p.subcategory === "string" ? p.subcategory : "");
        setServerStatus(p.status || "draft");
        setRejectionReason(p.rejectionReason || null);
        if (p.status === "active" || p.status === "pending_approval") {
          setStatus("active");
        } else {
          setStatus("draft");
        }
        const promo = promoTagCheckboxState(p.tags || []);
        setTagPopular(promo.tagPopular);
        setTagSale(promo.tagSale);
        setTagExtras(promo.tagExtras);
        setAttrs(mergeAttrsFromServer(cat, p.categoryAttributes));
        setAddons(Array.isArray(p.addons) ? vendorAddonsPayload(p.addons) : []);
        setImageList(Array.isArray(p.imageUrls) ? [...p.imageUrls] : []);
        if (p.businessId) setBusinessId(String(p.businessId));
        if (p.menuSectionId) setMenuSectionId(String(p.menuSectionId));
      })
      .catch((ex) => {
        if (!cancelled) setErr(apiErrorMessage(ex, "Failed to load"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, productId]);

  const onCategoryPick = (e) => {
    const c = e.target.value;
    setCategory(c);
    setAttrs(emptyAttrsForCategory(c));
    setAddons([]);
    setSubcategory("");
  };

  const save = async () => {
    setErr("");
    if (!accessToken || !productId) return;
    const linkedStoreId = businessId || businesses[0]?.id || "";
    const m = getListingMeta(category);
    setSaving(true);
    try {
      const tagList = buildVendorSubmitTags(m.showTags, {
        tagPopular,
        tagSale,
        extraCsv: tagExtras
      });
      const urls = imageList.slice(0, MAX_PRODUCT_IMAGES);
      if (status === "active" && urls.length === 0) {
        setErr(m.isService ? "Add at least one portfolio image before setting status to Active." : "Add at least one product photo before setting status to Active.");
        setSaving(false);
        return;
      }
      if (status === "active" && !subcategory.trim()) {
        setErr(
          'Choose a shopping sub-category — required on Active listings so Marketplace keyword search matches your item type.'
        );
        setSaving(false);
        return;
      }
      if (status === "active") {
        const attrErr = validateCategoryAttributesForPublish(category, attrs, { publishing: true });
        if (attrErr) {
          setErr(attrErr);
          setSaving(false);
          return;
        }
      }
      let patchPrice = 0;
      if (!m.hidePrice) {
        patchPrice = Number(price);
        if (!Number.isFinite(patchPrice) || patchPrice <= 0) {
          setErr("Enter a valid price greater than zero.");
          setSaving(false);
          return;
        }
      }
      const addonsPayload = m.showAddons ? vendorAddonsPayload(addons) : [];
      await apiFetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: {
          name: name.trim(),
          description: description.trim(),
          category,
          subcategory: subcategory.trim() ? subcategory.trim() : null,
          price: patchPrice,
          compareAtPrice: null,
          stock: inStock ? LISTING_STOCK_WHEN_AVAILABLE : 0,
          status,
          tags: tagList,
          imageUrls: urls,
          ...(m.showAddons ? { addons: addonsPayload } : {}),
          categoryAttributes: buildCategoryAttributesPayload(category, attrs),
          businessId: linkedStoreId || null,
          menuSectionId: resolveMenuSectionIdForStore(menuSectionId, menuSections, selectedBusiness?.businessType) ?? null
        }
      });
      const returnSlug = selectedBusiness?.slug || storePicker.storeSlugParam;
      nav(returnSlug ? `/vendor/stores/${encodeURIComponent(returnSlug)}#store-menu` : "/vendor/products");
    } catch (ex) {
      setErr(apiErrorMessage(ex, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const priceStockRow = h("div", { key: "row-price-stock", className: "grid grid-cols-1 gap-4 sm:grid-cols-2" }, [
    h(Field, { key: "fld-price", label: "Price (Ghc)" }, h(TextInput, { type: "number", step: "0.01", value: price, onChange: (e) => setPrice(e.target.value) })),
    vendorStockAvailabilityControl(h, Field, meta, inStock, setInStock)
  ]);

  const catFieldsNodes = renderListingCategoryFields(h, {
    Field,
    TextInput,
    TextArea,
    SelectInput,
    category,
    attrs,
    setAttrs
  });

  const innerFields = [
    ...renderVendorStoreFields(h, {
      Field,
      SelectInput,
      Link,
      businesses,
      storesLoading,
      businessId,
      selectBusiness,
      menuSections,
      menuSectionId,
      setMenuSectionId,
      onCategorySync: syncCategoryFromStore
    }),
    selectedBusiness
      ? h(
          "p",
          {
            key: "cat-hint-edit",
            className: "text-xs text-slate-500 dark:text-slate-400"
          },
          `Listing category for this store: ${CATEGORY_LABELS[category] || category}.`
        )
      : h(
          Field,
          { key: "fld-cat", label: "Listing category" },
          h(
            SelectInput,
            { value: category, onChange: onCategoryPick },
            PRODUCT_CATEGORY_VALUES.map((c) => h("option", { key: c, value: c }, CATEGORY_LABELS[c] || c))
          )
        ),
    meta.isService
      ? h(
          "div",
          {
            key: "svc-intro-edit",
            className:
              "rounded-2xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/40 dark:text-amber-100"
          },
          "This is a service listing — set your base price and optional add-ons. Buyers can check out on SHOPIQGH and message you for details."
        )
      : null,
    category === "food_drinks" && meta.hidePrice
      ? h(
          "div",
          {
            key: "food-intro-edit",
            className:
              "rounded-2xl border border-emerald-400/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-500/35 dark:bg-emerald-950/40 dark:text-emerald-100"
          },
          "Food & drinks are call-to-order: list price and stock are not shown to buyers. Use prep time and availability below; buyers contact you to order."
        )
      : null,
    vendorMarketSubcategorySelect(h, Field, SelectInput, category, subcategory, setSubcategory),
    h(Field, { key: "fld-name", label: meta.nameLabel }, h(TextInput, { value: name, onChange: (e) => setName(e.target.value), placeholder: meta.namePlaceholder })),
    h(Field, { key: "fld-desc", label: meta.descLabel }, h(TextArea, { value: description, onChange: (e) => setDescription(e.target.value), placeholder: meta.descPlaceholder }))
  ].filter(Boolean);

  if (!meta.hidePrice && category !== "groceries_essentials") innerFields.push(priceStockRow);
  const addonBlockAdd = vendorListingAddonsBlock(
    h,
    Field,
    TextInput,
    meta,
    addons,
    setAddons,
    addonKind,
    setAddonKind,
    addonLabel,
    setAddonLabel,
    addonPrice,
    setAddonPrice
  );
  if (addonBlockAdd) innerFields.push(addonBlockAdd);
  innerFields.push(...catFieldsNodes);
  if (!meta.hidePrice && category === "groceries_essentials") innerFields.push(priceStockRow);
  if (category === "books_academic") {
    innerFields.push(
      h(VendorBookPdfRow, {
        key: "pdf",
        accessToken,
        pdfUrl: attrs.pdfUrl || "",
        onPdfUrlChange: (v) => setAttrs((prev) => ({ ...prev, pdfUrl: v })),
        setErr
      })
    );
  }
  if (meta.showTags) {
    innerFields.push(
      vendorListingTagField(h, Field, TextInput, {
        tagPopular,
        setTagPopular,
        tagSale,
        setTagSale,
        tagExtras,
        setTagExtras
      })
    );
  }

  innerFields.push(
    ...[
      rejectionReason && serverStatus === "rejected"
        ? h(InlineNotice, { key: "rej", variant: "warning", className: "mb-2", size: "sm" }, [
            h("strong", { key: "t" }, "Listing rejected. "),
            h("span", { key: "r" }, String(rejectionReason))
          ])
        : null,
      serverStatus === "pending_approval"
        ? h(
            "p",
            { key: "pend", className: "mb-2 text-sm text-amber-800 dark:text-amber-200" },
            "This listing is waiting for admin approval. You can save as draft to withdraw, or keep it submitted."
          )
        : null,
      h(
        Field,
        { key: "fld-st", label: "Status" },
        h(f, { key: "st" }, [
          h(SelectInput, { value: status, onChange: (e) => setStatus(e.target.value) }, [
            h("option", { value: "draft" }, "Draft (not in shop)"),
            h("option", { value: "active" }, serverStatus === "active" ? "Live in shop" : "Submit / stay submitted for review")
          ]),
          h(
            "p",
            { key: "h", className: "mt-2 text-xs text-slate-500 dark:text-slate-400" },
            serverStatus === "active"
              ? "While live, changing the title, description, price, images, category, tags, or category-specific details removes the item from the shop until an admin re-approves. Stock-only changes stay live."
              : "“Submit for review” means the listing must be approved before buyers see it in the shop."
          )
        ])
      ),
      h(VendorProductPhotos, {
        key: "photos",
        accessToken,
        imageList,
        setImageList,
        setErr,
        label: meta.photosLabel,
        hintTail: meta.photosHintTail
      })
    ].filter(Boolean)
  );

  const publishAside = `${meta.publishBlurb}${meta.draftHelp ? ` ${meta.draftHelp}` : ""}`;

  if (loading) return h("p", { className: "text-slate-500" }, "Loading product…");

  return h(f, null, [
    err ? h(InlineNotice, { key: "err", variant: "error", className: "mb-4", onDismiss: () => setErr("") }, err) : null,
    h("div", { key: "edit-hdr", className: "mb-6 flex flex-wrap items-center justify-between gap-3" }, [
      h(
        "h1",
        { className: "font-display text-2xl font-bold text-slate-900 dark:text-white" },
        listingEditPageHeading(category)
      ),
      h(Link, { to: "/vendor/products" }, h(Button, { variant: "ghost", className: "!rounded-full" }, "← Back"))
    ]),
    h("div", { key: "edit-grid", className: "grid grid-cols-1 gap-6 lg:grid-cols-3" }, [
      h(
        "div",
        { key: "edit-main", className: "space-y-6 lg:col-span-2" },
        h(GlassPanel, { key: "edit-panel" }, [
          h("h2", { className: "mb-4 font-semibold text-slate-900 dark:text-white" }, meta.formPanelTitle),
          h("div", { key: "edit-fields", className: "space-y-4" }, innerFields)
        ])
      ),
      h("div", { key: "edit-side", className: "space-y-6" }, [
        h(GlassPanel, { key: "save-side" }, [
          h("h2", { className: "mb-2 font-semibold text-slate-900 dark:text-white" }, "Save listing"),
          h("p", { className: "text-xs text-slate-500 dark:text-slate-400" }, publishAside),
          h(Button, { className: "mt-4 w-full", type: "button", onClick: save, loading: saving }, "Save changes")
        ])
      ])
    ])
  ]);
}

function VendorCourierAssign({ accessToken, orderId, onAssigned }) {
  const { toast } = useNotice();
  const [riders, setRiders] = useState([]);
  const [loadingRiders, setLoadingRiders] = useState(false);
  const [selectedRiderId, setSelectedRiderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState("");

  const loadRiders = useCallback(() => {
    if (!accessToken) return;
    setLoadingRiders(true);
    setLoadErr("");
    apiFetch("/api/deliveries/riders/available", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => setRiders(Array.isArray(d.riders) ? d.riders : []))
      .catch((ex) => setLoadErr(apiErrorMessage(ex, "Could not load riders")))
      .finally(() => setLoadingRiders(false));
  }, [accessToken]);

  const assign = async () => {
    const id = selectedRiderId.trim();
    if (!accessToken || !id) return;
    setBusy(true);
    try {
      await apiFetch(`/api/deliveries/order/${orderId}/assign-rider`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: { riderUserId: id }
      });
      toast("Rider assigned for this order.", { variant: "success" });
      setSelectedRiderId("");
      onAssigned?.();
    } catch (ex) {
      toast(apiErrorMessage(ex, "Could not assign rider"), { variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  return h(
    "details",
    {
      className:
        "max-w-[min(100%,22rem)] rounded-lg border border-sky-400/25 bg-sky-500/[0.07] [&_summary::-webkit-details-marker]:hidden dark:border-sky-500/30 dark:bg-sky-950/30",
      onToggle: (e) => {
        if (e.target.open && !riders.length && !loadingRiders) loadRiders();
      }
    },
    [
      h(
        "summary",
        {
          className:
            "cursor-pointer list-none rounded-lg px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-sky-800 hover:bg-sky-500/10 dark:text-sky-100 dark:hover:bg-sky-500/10"
        },
        "Assign rider →"
      ),
      h("div", { className: "space-y-2 border-t border-sky-400/15 px-2 py-2 dark:border-white/10" }, [
        loadingRiders
          ? h("p", { key: "load", className: "text-[11px] text-slate-500 dark:text-slate-400" }, "Loading available riders…")
          : loadErr
            ? h("p", { key: "err", className: "text-[11px] font-medium text-rose-600 dark:text-rose-300" }, loadErr)
            : riders.length === 0
              ? h("p", { key: "empty", className: "text-[11px] text-slate-500 dark:text-slate-400" }, "No couriers available yet. Ask admin to add riders.")
              : h(
                  "div",
                  { key: "list", className: "max-h-40 space-y-1 overflow-y-auto pr-0.5" },
                  riders.map((r) => {
                    const sel = selectedRiderId === r.id;
                    return h(
                      "button",
                      {
                        key: r.id,
                        type: "button",
                        onClick: () => setSelectedRiderId(r.id),
                        className: `flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition ${
                          sel
                            ? "border-sky-500 bg-sky-500/15 ring-1 ring-sky-400/40 dark:border-sky-400 dark:bg-sky-950/50"
                            : "border-slate-200/80 bg-white/70 hover:border-sky-300 dark:border-white/10 dark:bg-night-900/60"
                        }`
                      },
                      [
                        h(
                          "span",
                          {
                            className: `flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                              sel
                                ? "border-sky-600 bg-sky-600 text-white"
                                : "border-slate-300 bg-white dark:border-white/20 dark:bg-night-950"
                            }`
                          },
                          sel ? "✓" : ""
                        ),
                        h("span", { className: "min-w-0 flex-1" }, [
                          h("span", { className: "block truncate text-xs font-semibold text-slate-900 dark:text-white" }, r.displayName || "Courier"),
                          h(
                            "span",
                            { className: "block truncate text-[10px] text-slate-500 dark:text-slate-400" },
                            [r.vehicleType || "Courier", r.activeDeliveries ? ` · ${r.activeDeliveries} active` : " · Available"].join("")
                          )
                        ])
                      ]
                    );
                  })
                ),
        h(
          Button,
          {
            key: "go",
            type: "button",
            className: "!min-h-[32px] w-full !text-xs",
            disabled: busy || !selectedRiderId,
            loading: busy,
            onClick: assign
          },
          "Assign selected rider"
        )
      ])
    ]
  );
}

export function VendorOrdersPage() {
  const { accessToken, user } = useAuth();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const { alert, confirm } = useNotice();
  const [orders, setOrders] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!accessToken) return;
    apiFetch("/api/vendor/orders", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => setOrders(d.orders || []))
      .catch((ex) => setErr(apiErrorMessage(ex, "Failed to load")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    trackVendorAnalyticsEvent(accessToken, { type: "orders_view" });
  }, [accessToken]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [accessToken]);

  const openOrderId = (searchParams.get("openOrder") || "").trim();

  useEffect(() => {
    if (!openOrderId || loading || orders.length === 0) return;
    const t = window.setTimeout(() => {
      const el = document.getElementById(`vendor-order-row-${openOrderId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => window.clearTimeout(t);
  }, [openOrderId, loading, orders]);

  const updateStatus = async (orderId, status) => {
    if (!accessToken) return;
    try {
      await apiFetch(`/api/vendor/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: { status }
      });
      load();
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Update failed"), { variant: "error", title: "Status update" });
    }
  };

  const confirmPayment = async (orderId) => {
    if (!accessToken) return;
    try {
      await apiFetch(`/api/vendor/orders/${orderId}/confirm-payment-received`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      load();
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Could not confirm"), { variant: "error", title: "Payment confirmation" });
    }
  };

  const deleteOrder = async (orderId) => {
    if (!accessToken) return;
    const agreed = await confirm(
      "This permanently removes the order for you and the buyer. For unpaid checkouts, use this instead of a separate cancel step.",
      { title: "Delete this order?", confirmLabel: "Delete", cancelLabel: "Keep" }
    );
    if (!agreed) return;
    try {
      await apiFetch(`/api/orders/${orderId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      load();
    } catch (ex) {
      await alert(apiErrorMessage(ex, "Could not delete"), { variant: "error", title: "Delete order" });
    }
  };

  return h(f, null, [
    err
      ? h(InlineNotice, { key: "err", variant: "error", className: "mb-4", onDismiss: () => setErr("") }, err)
      : null,
    h("div", { key: "head", className: "mb-6 flex flex-wrap items-center justify-between gap-3" }, [
      h("h1", { className: "flex items-center gap-2 font-display text-2xl font-bold text-slate-900 dark:text-white" }, [
        h(ShoppingCart, { className: "h-7 w-7 text-sky-400" }),
        "Order management"
      ])
    ]),
    h(
      "p",
      {
        key: "vendor-orders-hint",
        className: "mb-4 text-xs text-slate-500 dark:text-slate-400"
      },
      "For off-platform (MoMo/bank) payments, confirm when money hits your account — stock only releases after every seller on that order has confirmed. Message buyers from Messages in the sidebar."
    ),
    loading && h("p", { className: "mb-4 text-sm text-slate-600 dark:text-slate-400" }, "Loading…"),
    h(GlassCard, { key: "table-card", className: "!overflow-x-auto !p-0" }, h("table", { className: "table-fixed w-full min-w-[920px] text-left text-sm" }, [
      h(
        "colgroup",
        { key: "cols" },
        [0, 1, 2, 3, 4, 5].map((i) => h("col", { key: i, style: { width: `${100 / 6}%` } }))
      ),
      h(
        "thead",
        { className: "border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400" },
        h("tr", null, ["Order", "Buyer line", "Your total", "Status", "Next step", "Actions"].map((c, i, arr) =>
          h(
            "th",
            {
              key: c,
              className: [
                "px-3 py-3.5 font-semibold tracking-wide",
                i === arr.length - 1
                  ? "sticky right-0 z-30 min-w-[10.5rem] border-l border-slate-200 bg-slate-50 shadow-[-10px_0_18px_-10px_rgba(15,23,42,0.18)] dark:border-white/10 dark:bg-night-900 dark:shadow-[-10px_0_24px_-10px_rgba(0,0,0,0.55)]"
                  : ""
              ]
                .filter(Boolean)
                .join(" ")
            },
            c
          )
        ))
      ),
      h(
        "tbody",
        { className: "divide-y divide-slate-100 dark:divide-white/10" },
        orders.map((o) => {
          const status = normalizeOrderStatus(o.status);
          const lines = o.items || [];
          const line = lines[0];
          const lineLabel =
            lines.length === 0
              ? "—"
              : lines.length === 1
                ? `${line.name} ×${line.quantity}`
                : `${lines.length} line items`;
          const myEarn =
            o.vendorSellerProceeds != null && Number.isFinite(o.vendorSellerProceeds)
              ? o.vendorSellerProceeds
              : lines.reduce((s, it) => s + (Number(it.sellerProceeds) || 0), 0);
          return h(
            "tr",
            {
              id: `vendor-order-row-${o.id}`,
              key: o.id,
              className: `group hover:bg-slate-50/90 dark:hover:bg-white/5 ${
                openOrderId && String(o.id) === openOrderId ? "bg-sky-50/90 ring-2 ring-inset ring-sky-400/50 dark:bg-sky-950/40" : ""
              }`
            },
            h(
              "td",
              { className: "min-w-0 px-3 py-2.5 align-middle whitespace-nowrap font-mono text-xs text-slate-700 dark:text-slate-300" },
              `#${o.id.slice(-8)}`
            ),
            h(
              "td",
              { className: "min-w-0 px-3 py-2.5 align-middle break-words leading-snug text-slate-800 dark:text-slate-100" },
              lineLabel
            ),
            h("td", { className: "min-w-0 whitespace-nowrap px-3 py-2.5 align-middle font-semibold text-emerald-600 dark:text-emerald-400" }, formatGhc(myEarn)),
            h("td", { className: "min-w-0 px-3 py-2.5 align-middle" }, h(Badge, { tone: "neutral" }, formatOrderFulfillmentLabel(o))),
            h(
              "td",
              { className: "min-w-0 px-3 py-2.5 align-middle" },
              h("div", { className: "flex flex-col gap-1.5" }, [
                h(
                  "div",
                  { className: "flex flex-wrap items-center gap-1.5" },
                  [
                    status === "awaiting_vendor_payment" &&
                      !(o.confirmedSellerIds || []).includes(user?.id) &&
                      h(
                        Button,
                        {
                          key: "pay-ok",
                          variant: "primary",
                          className: "!min-h-[32px] !px-2.5 !py-1 !text-xs",
                          type: "button",
                          onClick: () => confirmPayment(o.id)
                        },
                        "Confirm received payment"
                      ),
                    status === "awaiting_vendor_payment" &&
                      (o.confirmedSellerIds || []).includes(user?.id) &&
                      h(
                        "span",
                        {
                          key: "pay-wait",
                          className: "max-w-[14rem] text-[11px] leading-snug text-emerald-700 dark:text-emerald-400"
                        },
                        "You confirmed · waiting others"
                      ),
                    status === "paid" &&
                      h(
                        Button,
                        {
                          key: "proc",
                          variant: "ghost",
                          className:
                            "!min-h-[32px] !px-2.5 !py-1 !text-xs border border-slate-200/90 bg-white/80 text-slate-800 hover:bg-slate-50 dark:border-transparent dark:bg-transparent dark:text-slate-100 dark:hover:bg-white/10",
                          type: "button",
                          onClick: () => updateStatus(o.id, "processing")
                        },
                        "Mark processing"
                      ),
                    status === "processing" &&
                      h(
                        Button,
                        {
                          key: "sent_for_delivery",
                          variant: "ghost",
                          className:
                            "!min-h-[32px] !px-2.5 !py-1 !text-xs border border-slate-200/90 bg-white/80 text-slate-800 hover:bg-slate-50 dark:border-transparent dark:bg-transparent dark:text-slate-100 dark:hover:bg-white/10",
                          type: "button",
                          onClick: () => updateStatus(o.id, "sent_for_delivery")
                        },
                        "Sent for delivery"
                      ),
                    status === "sent_for_delivery" &&
                      h(
                        Button,
                        {
                          key: "del",
                          variant: "ghost",
                          className:
                            "!min-h-[32px] !px-2.5 !py-1 !text-xs border border-slate-200/90 bg-white/80 text-slate-800 hover:bg-slate-50 dark:border-transparent dark:bg-transparent dark:text-slate-100 dark:hover:bg-white/10",
                          type: "button",
                          onClick: () => updateStatus(o.id, "delivered")
                        },
                        "Delivered"
                      ),
                    h(Button, {
                      key: "to-msg",
                      variant: "ghost",
                      className:
                        "!min-h-[32px] !inline-flex !px-2.5 !py-1 !text-xs !text-sky-700 hover:!bg-sky-50 hover:!text-sky-800 dark:!text-sky-400 dark:hover:!bg-white/10 dark:hover:!text-sky-300",
                      type: "button",
                      onClick: () =>
                        nav(
                          o.buyerContact?.id
                            ? `/vendor/messages?peer=${encodeURIComponent(String(o.buyerContact.id))}`
                            : "/vendor/messages"
                        )
                    }, [
                      h(MessageSquare, { key: "ic-m", className: "h-3.5 w-3.5 shrink-0" }),
                      h("span", { key: "l-m", className: "ml-1" }, "Message")
                    ])
                  ].filter(Boolean)
                ),
                ["paid", "processing", "sent_for_delivery"].includes(status)
                  ? h(VendorCourierAssign, {
                      key: `cc-${o.id}`,
                      accessToken,
                      orderId: o.id,
                      onAssigned: load
                    })
                  : null
              ].filter(Boolean))
            ),
            h(
              "td",
              {
                className:
                  "min-w-0 px-3 py-2.5 align-middle sticky right-0 z-20 min-w-[10.5rem] border-l border-slate-200 bg-white shadow-[-10px_0_18px_-10px_rgba(15,23,42,0.14)] group-hover:bg-slate-50 dark:border-white/10 dark:bg-night-950 dark:shadow-[-10px_0_24px_-10px_rgba(0,0,0,0.45)] dark:group-hover:bg-night-900/95"
              },
              (() => {
                const actionEls = [
                  ["paid", "processing", "awaiting_vendor_payment"].includes(status) &&
                    h(Button, {
                      key: "cxl",
                      variant: "danger",
                      className: "!min-h-[34px] w-full !px-2.5 !py-1.5 !text-xs sm:w-auto",
                      type: "button",
                      onClick: () => updateStatus(o.id, "cancelled")
                    }, "Cancel order"),
                  ["pending_payment", "cancelled"].includes(status) &&
                    h(Button, {
                      key: "row-del",
                      variant: "ghost",
                      className:
                        "!min-h-[36px] w-full !px-3 !py-2 !text-xs !font-semibold !text-rose-800 !ring-2 !ring-rose-400/55 !bg-rose-50 hover:!bg-rose-100 hover:!ring-rose-500/70 sm:w-auto dark:!text-rose-200 dark:!ring-rose-500/50 dark:!bg-rose-950/50 dark:hover:!bg-rose-950/70",
                      type: "button",
                      onClick: () => deleteOrder(o.id)
                    }, [h(Trash2, { className: "h-3.5 w-3.5 shrink-0" }), h("span", { className: "ml-1" }, "Delete")])
                ].filter(Boolean);
                return actionEls.length
                  ? h("div", { className: "flex flex-col items-stretch gap-1.5 sm:flex-row sm:flex-wrap sm:items-center" }, actionEls)
                  : h(
                      "span",
                      { className: "block text-xs leading-snug text-slate-500 dark:text-slate-400" },
                      "No actions for this status."
                    );
              })()
            )
          );
        })
      )
    ]))
  ]);
}

export function VendorMessagesPage() {
  const { accessToken } = useAuth();
  const [searchParams] = useSearchParams();
  const peerFromQuery = searchParams.get("peer");
  const [threads, setThreads] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [replyByPeer, setReplyByPeer] = useState({});
  const [sending, setSending] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const selectPeerOnLoadRef = useRef(true);

  useEffect(() => {
    selectPeerOnLoadRef.current = true;
  }, [peerFromQuery]);

  const loadThreads = useCallback(() => {
    if (!accessToken) return Promise.resolve();
    return apiFetch("/api/conversations?as=seller", {
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
        if (!cancelled) setErr(apiErrorMessage(ex, "Could not load messages"));
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
    if (selectPeerOnLoadRef.current && peerFromQuery && ids.includes(String(peerFromQuery))) {
      setActiveId(String(peerFromQuery));
      setMobileShowChat(true);
      selectPeerOnLoadRef.current = false;
      return;
    }
    selectPeerOnLoadRef.current = false;
    setActiveId((cur) => (cur && ids.includes(String(cur)) ? cur : String(threads[0].peerUserId)));
  }, [threads, peerFromQuery]);

  const activeThread = useMemo(
    () => threads.find((t) => String(t.peerUserId) === String(activeId)) || null,
    [threads, activeId]
  );

  const threadPreview = useCallback((t) => {
    const msgs = t.messages || [];
    if (!msgs.length) return "No messages yet — you can write first.";
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
    try {
      await apiFetch(`/api/conversations/by-peer/${encodeURIComponent(pid)}/messages?as=seller`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: { text }
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
          h("p", { className: "text-[11px] font-semibold uppercase tracking-wide opacity-80" }, m.senderLabel || (mine ? "You" : "Buyer")),
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
              h(
                "p",
                { className: "mt-0.5 text-xs text-slate-500 dark:text-slate-400" },
                "Buyers you’ve sold to — plus SHOPIQGH Support for payouts and policy help."
              )
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
                        t.peerDisplayName || "Buyer"
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
                    h("p", { className: "truncate font-semibold text-slate-900 dark:text-white" }, activeThread.peerDisplayName || "Buyer"),
                    h(
                      "p",
                      { className: "truncate text-xs text-slate-500 dark:text-slate-400" },
                      activeThread.itemSummary || "One thread for all your orders with this buyer."
                    )
                  ]),
                  h(
                    Link,
                    {
                      key: "ord",
                      to: "/vendor/orders",
                      className: "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-sky-600 hover:bg-sky-500/10 dark:text-sky-300"
                    },
                    "Orders"
                  )
                ]),
                h(
                  "div",
                  { key: "scroll", className: "min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4 md:px-5" },
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
    err
      ? h(InlineNotice, { key: "err", variant: "error", className: "mb-4", onDismiss: () => setErr("") }, err)
      : null,
    h("div", { key: "wrap", className: "mx-auto flex w-full max-w-5xl flex-col px-4 py-6 pb-24 sm:px-6" }, [
      h("h1", { key: "h1", className: "sr-only" }, "Messages to buyers"),
      h(
        "div",
        { key: "head", className: "mb-4 flex flex-wrap items-center justify-between gap-3" },
        h("h2", { className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, "Messages")
      ),
      loading ? h("p", { key: "ld", className: "text-sm text-slate-500 dark:text-slate-400" }, "Loading…") : null,
      !loading &&
        !err &&
        threads.length === 0 &&
        h(GlassPanel, { key: "empty" }, [
          h("p", { className: "text-sm text-slate-600 dark:text-slate-300" }, "No buyer chats yet."),
          h(
            "p",
            { className: "mt-2 text-xs text-slate-500 dark:text-slate-400" },
            "Buyer chats appear when you have active orders. SHOPIQGH Support is always listed first once your admin inbox is set up."
          )
        ]),
      chatShell
    ])
  ]);
}

export function VendorAnalyticsPage() {
  const { accessToken } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!accessToken) return;
    trackVendorAnalyticsEvent(accessToken, { type: "analytics_view" });
    apiFetch("/api/vendor/analytics?days=30", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(setAnalytics)
      .catch((ex) => setErr(apiErrorMessage(ex, "Failed")));
  }, [accessToken]);

  const daily = analytics?.chart?.daily || [];

  return h(f, null, [
    err
      ? h(InlineNotice, { key: "err", variant: "error", className: "mb-4", onDismiss: () => setErr("") }, err)
      : null,
    h("div", { className: "mb-6 flex flex-wrap items-center justify-between gap-3" }, [
      h("h1", { className: "flex items-center gap-2 font-display text-2xl font-bold text-slate-900 dark:text-white" }, [
        h(LineChart, { className: "h-7 w-7 text-sky-400" }),
        "Analytics overview"
      ])
    ]),
    h(
      "div",
      { className: "mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4" },
      [
        { label: "Revenue", value: formatGhc(analytics?.revenue || 0) },
        { label: "Orders", value: String(analytics?.orderCount ?? "—") },
        { label: "Products", value: String(analytics?.productCount ?? "—") },
        { label: "Reviews", value: String(analytics?.reviewCount ?? "—") }
      ].map((x) =>
        h(GlassCard, { key: x.label, className: "!p-3" }, [
          h("p", { className: "text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, x.label),
          h("p", { className: "mt-1 text-base font-bold text-slate-900 dark:text-white sm:text-lg" }, x.value)
        ])
      )
    ),
    h("div", { key: "charts-grid", className: "mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 md:items-stretch" }, [
      h(GlassPanel, { key: "rev-chart", className: "!overflow-hidden !p-0" }, [
        h("div", { className: "border-b border-white/10 px-4 py-3 dark:border-white/5" }, [
          h("h2", { className: "text-base font-semibold text-slate-900 dark:text-white" }, "Aurora ribbon"),
          h("p", { className: "mt-0.5 text-[11px] text-slate-500 dark:text-slate-400" }, "Smoothed daily proceeds — glow, reflection, hex markers.")
        ]),
        daily.length
          ? h("div", { className: "px-2 pb-1 pt-2" }, h(VendorRevenueLineChart, { daily }))
          : h("p", { className: "px-4 py-8 text-center text-sm text-slate-500" }, "No chart data yet.")
      ]),
      h(GlassPanel, { key: "top-products", className: "!overflow-hidden !p-0" }, [
        h("div", { className: "border-b border-white/10 px-4 py-3 dark:border-white/5" }, [
          h("h2", { className: "text-base font-semibold text-slate-900 dark:text-white" }, "Top products"),
          h("p", { className: "mt-0.5 text-[11px] text-slate-500 dark:text-slate-400" }, "Best performing products by proceeds.")
        ]),
        h(
          "ul",
          { className: "space-y-2 px-4 py-3 text-sm" },
          (analytics?.topProducts || []).slice(0, 6).map((r) =>
            h("li", { key: r.productId, className: "flex items-center justify-between gap-2" }, [
              h("span", { className: "truncate text-slate-600 dark:text-slate-300" }, r.name),
              h("span", { className: "shrink-0 font-semibold text-slate-900 dark:text-white" }, formatGhc(r.revenue))
            ])
          )
        ),
        (!analytics?.topProducts || analytics.topProducts.length === 0) &&
          h("p", { className: "px-4 py-8 text-center text-sm text-slate-500" }, "No top products yet.")
      ])
    ])
  ]);
}

export { VendorReviewsPage } from "./VendorReviewsPage";

/** Paystack Ghana: sellers receive payouts to MoMo wallet or bank account — not to a payment card. */
function payoutMethodTileClass(active) {
  return [
    "flex w-full flex-col items-start gap-2 rounded-2xl border p-4 text-left transition",
    active
      ? "border-violet-500 bg-violet-500/10 ring-2 ring-violet-500/40 dark:border-violet-400 dark:bg-violet-500/15"
      : "border-slate-200/90 bg-white/60 hover:border-slate-300 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
  ].join(" ");
}

export function VendorSettingsPage() {
  const nav = useNavigate();
  const { confirm, alert } = useNotice();
  const { accessToken, user, setUser, logout } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const photoFileRef = useRef(null);
  const [ghanaBanks, setGhanaBanks] = useState([]);
  /** `mobile_money` | `ghipss` — chosen before picking institution from Paystack list */
  const [payoutReceiveMethod, setPayoutReceiveMethod] = useState("");
  /** Format: `ghipss|CODE` or `mobile_money|CODE` (from Paystack list). */
  const [payoutBankKey, setPayoutBankKey] = useState("");
  const [banksLoading, setBanksLoading] = useState(false);
  const [banksLoadErr, setBanksLoadErr] = useState("");
  const [registeringPayout, setRegisteringPayout] = useState(false);
  const [payoutErr, setPayoutErr] = useState("");
  const [payoutOk, setPayoutOk] = useState("");
  const [subBusy, setSubBusy] = useState(false);
  const [subErr, setSubErr] = useState("");

  useEffect(() => {
    if (!accessToken) return;
    apiFetch("/api/auth/me", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => {
        if (!d.user) return;
        setUser(d.user);
        setDisplayName(d.user.displayName || "");
        setPhone(d.user.phone || "");
        setEmail(d.user.email || "");
        setBankName(d.user.bankName || "");
        setBankAccountNumber(d.user.bankAccountNumber || "");
        setBankAccountName(d.user.bankAccountName || "");
      })
      .catch(() => {});
  }, [accessToken, setUser]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("reference") || params.get("trxref");
    if (params.get("subscription") !== "success" || !ref || !accessToken) return;
    void (async () => {
      try {
        const data = await apiFetch(`/api/vendor/subscription/verify/${encodeURIComponent(ref)}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (data?.ok) {
          const me = await apiFetch("/api/auth/me", { headers: { Authorization: `Bearer ${accessToken}` } });
          if (me?.user) setUser(me.user);
          setOk("Seller subscription active. You can add and edit listings again.");
        }
      } catch (ex) {
        setSubErr(apiErrorMessage(ex, "Could not confirm subscription payment."));
      } finally {
        window.history.replaceState({}, "", "/vendor/settings#vendor-seller-subscription");
      }
    })();
  }, [accessToken, setUser]);

  const startSellerSubscription = async () => {
    if (!accessToken) return;
    setSubBusy(true);
    setSubErr("");
    try {
      const data = await apiFetch("/api/vendor/subscription/initialize", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (data?.authorizationUrl) {
        window.location.href = data.authorizationUrl;
        return;
      }
      setSubErr("Payment could not be started.");
    } catch (ex) {
      setSubErr(apiErrorMessage(ex, "Payment could not be started."));
    } finally {
      setSubBusy(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setBanksLoading(true);
    setBanksLoadErr("");
    apiFetch("/api/vendor/paystack/ghana-banks", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => {
        if (cancelled) return;
        setGhanaBanks(Array.isArray(d.banks) ? d.banks : []);
      })
      .catch((ex) => {
        if (!cancelled) {
          setGhanaBanks([]);
          setBanksLoadErr(apiErrorMessage(ex, "Could not load Paystack bank list. Check the API and Paystack keys."));
        }
      })
      .finally(() => {
        if (!cancelled) setBanksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    const ch = user?.ghanaPayoutChannel;
    const code = (user && user.ghanaBankCode && String(user.ghanaBankCode).trim()) || "";
    if (ch && code && (ch === "ghipss" || ch === "mobile_money")) {
      setPayoutReceiveMethod(ch);
      setPayoutBankKey(`${ch}|${code}`);
    }
  }, [user?.ghanaPayoutChannel, user?.ghanaBankCode]);

  const payoutInstitutions = useMemo(() => {
    if (!payoutReceiveMethod) return [];
    return ghanaBanks.filter((b) => b.channel === payoutReceiveMethod);
  }, [ghanaBanks, payoutReceiveMethod]);

  const linkedPayoutLabel = useMemo(() => {
    if (!user?.paystackPayoutRegistered) return null;
    if (user.ghanaPayoutChannel === "mobile_money") {
      const net = ghanaBanks.find(
        (b) => b.channel === "mobile_money" && String(b.code) === String(user.ghanaBankCode || "")
      );
      return net?.name ? `Linked MoMo: ${net.name}` : "Linked: mobile money wallet";
    }
    if (user.ghanaPayoutChannel === "ghipss") {
      const bank = ghanaBanks.find(
        (b) => b.channel === "ghipss" && String(b.code) === String(user.ghanaBankCode || "")
      );
      return bank?.name ? `Linked bank: ${bank.name}` : "Linked: bank account";
    }
    return "Linked for Paystack payouts";
  }, [user?.paystackPayoutRegistered, user?.ghanaPayoutChannel, user?.ghanaBankCode, ghanaBanks]);

  const onPickProfilePhoto = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !accessToken) return;
    if (!/^image\/(jpeg|png|gif|webp)$/i.test(f.type) || f.size > 5 * 1024 * 1024) {
      setErr("Use a JPEG, PNG, WebP, or GIF under 5 MB.");
      return;
    }
    setErr("");
    setOk("");
    setPhotoLoading(true);
    try {
      const data = await apiUploadProfileImage(f, accessToken);
      if (data.user) setUser(data.user);
      setOk("Profile photo updated.");
    } catch (ex) {
      setErr(apiErrorMessage(ex, "Upload failed"));
    } finally {
      setPhotoLoading(false);
    }
  };

  const clearProfilePhoto = async () => {
    if (!accessToken) return;
    setErr("");
    setOk("");
    setPhotoLoading(true);
    try {
      const data = await apiFetch("/api/auth/profile", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: { clearProfileImage: true }
      });
      if (data.user) setUser(data.user);
      setOk("Profile photo removed.");
    } catch (ex) {
      setErr(apiErrorMessage(ex, "Could not remove photo"));
    } finally {
      setPhotoLoading(false);
    }
  };

  const save = async () => {
    setErr("");
    setOk("");
    if (!accessToken) return;
    setSaving(true);
    try {
      const data = await apiFetch("/api/auth/profile", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: {
          displayName: displayName.trim(),
          phone: phone.trim(),
          bankName: bankName.trim(),
          bankAccountNumber: bankAccountNumber.trim(),
          bankAccountName: bankAccountName.trim()
        }
      });
      if (data.user) setUser(data.user);
      setOk("Saved.");
    } catch (ex) {
      setErr(apiErrorMessage(ex, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const registerPaystackPayout = async () => {
    setPayoutErr("");
    setPayoutOk("");
    if (!accessToken) return;
    if (payoutReceiveMethod !== "ghipss" && payoutReceiveMethod !== "mobile_money") {
      setPayoutErr("Choose how you want to receive payouts: mobile money (MoMo) or bank account.");
      return;
    }
    const p = payoutBankKey.indexOf("|");
    if (p < 1) {
      setPayoutErr(
        payoutReceiveMethod === "mobile_money"
          ? "Select your MoMo network (e.g. MTN, Telecel, AirtelTigo)."
          : "Select your bank from the list."
      );
      return;
    }
    const recipientType = payoutBankKey.slice(0, p);
    const bankCode = payoutBankKey.slice(p + 1).trim();
    if (!bankCode || (recipientType !== "ghipss" && recipientType !== "mobile_money")) {
      setPayoutErr("Select a valid institution from the list.");
      return;
    }
    if (recipientType !== payoutReceiveMethod) {
      setPayoutErr("The network or bank you selected does not match your payout type. Pick again.");
      return;
    }
    /* Same rules as server: MoMo wallet can live in “Mobile money number” or “Account number”; name can fall back to display name. */
    const accountNum =
      bankAccountNumber.trim() ||
      (recipientType === "mobile_money" ? phone.trim() : "");
    const accountHolder =
      bankAccountName.trim() ||
      displayName.trim();
    if (!accountNum.trim()) {
      setPayoutErr(
        recipientType === "mobile_money"
          ? "Add your wallet number under “Mobile money number” or “Account number”, then try again."
          : "Fill in account number under “Account & store contact”, then try again."
      );
      return;
    }
    if (!accountHolder.trim()) {
      setPayoutErr("Fill in account name (or set display name), then try again.");
      return;
    }
    setRegisteringPayout(true);
    try {
      const profileRes = await apiFetch("/api/auth/profile", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: {
          displayName: displayName.trim(),
          phone: phone.trim(),
          bankName: bankName.trim(),
          bankAccountNumber: accountNum,
          bankAccountName: accountHolder
        }
      });
      if (profileRes?.user) setUser(profileRes.user);

      const data = await apiFetch("/api/vendor/paystack/payout-account", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: {
          bankCode,
          recipientType,
          accountNumber: accountNum
        }
      });
      if (data?.ok) {
        setPayoutOk(
          recipientType === "mobile_money"
            ? "Your mobile money is linked. When buyers pay with Paystack, your share can be sent here automatically (if the platform has this enabled)."
            : "Your bank is linked. When buyers pay with Paystack, your share can be sent here automatically (if the platform has this enabled)."
        );
        const me = await apiFetch("/api/auth/me", { headers: { Authorization: `Bearer ${accessToken}` } });
        if (me.user) setUser(me.user);
      }
    } catch (ex) {
      setPayoutErr(
        apiErrorMessage(
          ex,
          recipientType === "mobile_money"
            ? "Could not link MoMo wallet. Check the number and network, then try again."
            : "Could not link bank account. Check details with your bank and try again."
        )
      );
    } finally {
      setRegisteringPayout(false);
    }
  };

  const removeAccount = async () => {
    if (!accessToken) return;
    const proceed = await confirm("This permanently deletes your seller account and removes access to the vendor dashboard.", {
      title: "Delete seller account?",
      confirmLabel: "Delete account",
      cancelLabel: "Keep account"
    });
    if (!proceed) return;
    setErr("");
    setOk("");
    setDeleting(true);
    try {
      await deleteAuthenticatedAccount(accessToken, {
        password: deletePassword,
        confirm: deleteConfirm.trim()
      });
      await logout();
      await alert("Your seller account was deleted.", { variant: "success", title: "Done" });
      nav("/register", { replace: true });
    } catch (ex) {
      setErr(apiErrorMessage(ex, "Delete failed"));
    } finally {
      setDeleting(false);
    }
  };

  return h("div", { className: "grid grid-cols-1 gap-6 xl:grid-cols-3" }, [
    h("div", { className: "space-y-6 xl:col-span-2" }, [
      h(GlassPanel, {}, [
        h("h2", { className: "mb-2 text-lg font-semibold text-slate-900 dark:text-white" }, "Profile photo"),
        h("p", { className: "mb-4 text-sm text-slate-600 dark:text-slate-400" }, "Shown in the vendor bar and on your public profile. JPEG, PNG, WebP, or GIF, up to 5 MB."),
        h("div", { className: "flex flex-col items-start gap-4 sm:flex-row sm:items-center" }, [
          h(
            "div",
            { key: "av", className: "ring-4 ring-sky-500/25 rounded-full" },
            vendorUserAvatarNode(user, { sizeClass: "h-20 w-20", initialTextClass: "text-xl" })
          ),
          h("div", { className: "flex flex-wrap gap-2" }, [
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
                type: "button",
                disabled: photoLoading,
                loading: photoLoading,
                onClick: () => photoFileRef.current?.click()
              },
              [h(Camera, { key: "i", className: "h-4 w-4" }), h("span", { key: "t" }, "Upload photo")]
            ),
            (user?.profileImageUrl &&
              String(user.profileImageUrl).trim() &&
              h(Button, { key: "rm", variant: "subtle", type: "button", disabled: photoLoading, onClick: clearProfilePhoto }, "Remove")) ||
              null
          ])
        ])
      ]),
      h(GlassPanel, {}, [
        h("h2", { className: "mb-4 flex items-center gap-2 font-semibold text-slate-900 dark:text-white" }, [
          h(Settings, { className: "h-5 w-5 text-sky-400" }),
          "Account & store contact"
        ]),
        h(
          "p",
          { className: "mb-4 text-sm text-slate-600 dark:text-slate-400" },
          "Shoppers only see your display name on listings. Messages stay in-app — phone and email are not shown to buyers. Payout details are configured in the Paystack section below."
        ),
        h(Field, { label: "Display name" }, h(TextInput, { value: displayName, onChange: (e) => setDisplayName(e.target.value) })),
        h(Field, { label: "Account email" }, h(TextInput, { type: "email", value: email, disabled: true })),
        h(
          Field,
          { label: "Phone (your account — not shared with buyers)" },
          h(TextInput, {
            type: "tel",
            value: phone,
            onChange: (e) => setPhone(e.target.value),
            placeholder: "e.g. 0241234567"
          })
        ),
        err
          ? h(InlineNotice, { key: "err", variant: "error", className: "mt-2", onDismiss: () => setErr("") }, err)
          : null,
        ok
          ? h(InlineNotice, { key: "ok", variant: "success", className: "mt-2", onDismiss: () => setOk("") }, ok)
          : null,
        h(Button, { className: "mt-4 w-full sm:w-auto", type: "button", onClick: save, loading: saving }, "Save")
      ]),
      user?.vendorBilling?.billingEnabled
        ? h(GlassPanel, { id: "vendor-seller-subscription", className: "!scroll-mt-28" }, [
            h("h2", { className: "mb-2 text-lg font-semibold text-slate-900 dark:text-white" }, "Seller platform subscription"),
            h(
              "p",
              { className: "mb-3 text-sm text-slate-600 dark:text-slate-400" },
              "SHOPIQGH offers a free launch trial for new sellers. After the trial, this fee keeps your store and listings active on the marketplace."
            ),
            user.vendorBilling.phase === "launch_trial"
              ? h(InlineNotice, { key: "trial", variant: "info", className: "mb-3" }, user.vendorBilling.message)
              : user.vendorBilling.canOperate && user.vendorBilling.phase === "subscribed"
                ? h(InlineNotice, { key: "ok", variant: "success", className: "mb-3" }, user.vendorBilling.message)
                : h(
                    "p",
                    { key: "due", className: "mb-3 text-sm font-medium text-amber-800 dark:text-amber-200" },
                    user.vendorBilling.message
                  ),
            !user.vendorBilling.canOperate
              ? h("div", { className: "space-y-2" }, [
                  h(
                    "p",
                    { className: "text-sm text-slate-700 dark:text-slate-300" },
                    `Pay GHS ${Number(user.vendorBilling.priceGhs || 0).toFixed(2)} for ${user.vendorBilling.periodMonths} month${user.vendorBilling.periodMonths === 1 ? "" : "s"} of seller access (card or MoMo via Paystack).`
                  ),
                  subErr
                    ? h(InlineNotice, { key: "sub-err", variant: "error", onDismiss: () => setSubErr("") }, subErr)
                    : null,
                  h(Button, {
                    type: "button",
                    loading: subBusy,
                    onClick: () => void startSellerSubscription()
                  }, "Pay seller subscription")
                ])
              : null
          ])
        : null,
      h(GlassPanel, { id: "vendor-paystack-payouts", className: "!scroll-mt-28" }, [
        h("h2", { className: "mb-2 text-lg font-semibold text-slate-900 dark:text-white" }, "Paystack — where you receive payouts"),
        h(
          "p",
          { className: "mb-3 text-sm text-slate-600 dark:text-slate-400" },
          "When a buyer pays on SHOPIQGH (card or MoMo at checkout), Paystack can send your seller share to you. Choose where you want to receive that money — your MoMo wallet or a bank account. You do not link a debit/credit card here; cards are only how buyers pay."
        ),
        h(
          InlineNotice,
          { key: "card-info", variant: "info", className: "mb-4" },
          h("div", { className: "space-y-1 text-sm" }, [
            h("p", { key: "c1", className: "font-medium" }, "Buyer card payments vs your payout account"),
            h(
              "p",
              { key: "c2" },
              "Shoppers may pay with Visa/Mastercard or MoMo at checkout. That is separate from this step. Below you link the MoMo wallet or bank account where Paystack should send your earnings."
            )
          ])
        ),
        user?.paystackPayoutRegistered && linkedPayoutLabel
          ? h(InlineNotice, { key: "pout-ok", variant: "success", className: "mb-3" }, linkedPayoutLabel)
          : h(
              "p",
              { className: "mb-3 text-sm font-medium text-amber-800 dark:text-amber-200" },
              "Not linked yet — choose MoMo or bank, enter your details, select the network or bank, then link."
            ),
        h("p", { key: "step1", className: "mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, "Step 1 — How you receive payouts"),
        h(
          "div",
          { key: "method-grid", className: "mb-4 grid gap-3 sm:grid-cols-2" },
          [
            h(
              "button",
              {
                key: "m-momo",
                type: "button",
                className: payoutMethodTileClass(payoutReceiveMethod === "mobile_money"),
                onClick: () => {
                  setPayoutReceiveMethod("mobile_money");
                  setPayoutBankKey("");
                  setPayoutErr("");
                }
              },
              [
                h(Smartphone, { className: "h-6 w-6 text-violet-600 dark:text-violet-400", "aria-hidden": true }),
                h("span", { className: "font-semibold text-slate-900 dark:text-white" }, "Mobile money (MoMo)"),
                h(
                  "span",
                  { className: "text-xs text-slate-600 dark:text-slate-400" },
                  "Receive to your MTN, Telecel, or AirtelTigo wallet — the number registered on that line."
                )
              ]
            ),
            h(
              "button",
              {
                key: "m-bank",
                type: "button",
                className: payoutMethodTileClass(payoutReceiveMethod === "ghipss"),
                onClick: () => {
                  setPayoutReceiveMethod("ghipss");
                  setPayoutBankKey("");
                  setPayoutErr("");
                }
              },
              [
                h(Building2, { className: "h-6 w-6 text-violet-600 dark:text-violet-400", "aria-hidden": true }),
                h("span", { className: "font-semibold text-slate-900 dark:text-white" }, "Bank account"),
                h(
                  "span",
                  { className: "text-xs text-slate-600 dark:text-slate-400" },
                  "Receive to a Ghana bank account (savings or current). This is not a payment card."
                )
              ]
            )
          ]
        ),
        h(
          "div",
          {
            key: "card-note",
            className:
              "mb-4 flex gap-3 rounded-2xl border border-dashed border-slate-300/80 bg-slate-50/80 px-4 py-3 dark:border-white/15 dark:bg-white/5"
          },
          [
            h(CreditCard, { className: "mt-0.5 h-5 w-5 shrink-0 text-slate-400", "aria-hidden": true }),
            h("div", { className: "min-w-0 text-xs text-slate-600 dark:text-slate-400" }, [
              h("p", { key: "t", className: "font-semibold text-slate-800 dark:text-slate-200" }, "Card (checkout only — do not link here)"),
              h(
                "p",
                { key: "d", className: "mt-1" },
                "Buyers can pay with card at checkout. You never link your own card for payouts — only MoMo or bank above."
              )
            ])
          ]
        ),
        payoutReceiveMethod === "mobile_money" || payoutReceiveMethod === "ghipss"
          ? h("div", { key: "step2", className: "mb-4 space-y-3 border-t border-white/10 pt-4" }, [
              h(
                "p",
                { className: "text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400" },
                payoutReceiveMethod === "mobile_money" ? "Step 2 — MoMo wallet details" : "Step 2 — Bank account details"
              ),
              payoutReceiveMethod === "mobile_money"
                ? h(Field, { label: "Name on MoMo wallet" }, h(TextInput, {
                    value: bankAccountName,
                    onChange: (e) => setBankAccountName(e.target.value),
                    placeholder: "As registered on the wallet"
                  }))
                : h(Field, { label: "Account holder name" }, h(TextInput, {
                    value: bankAccountName,
                    onChange: (e) => setBankAccountName(e.target.value),
                    placeholder: "Name on the bank account"
                  })),
              payoutReceiveMethod === "mobile_money"
                ? h(Field, { label: "MoMo wallet number" }, h(TextInput, {
                    value: bankAccountNumber,
                    onChange: (e) => setBankAccountNumber(e.target.value),
                    placeholder: "e.g. 0241234567 — or use phone above"
                  }))
                : [
                    h(Field, { key: "bn", label: "Bank name (optional note)" }, h(TextInput, {
                      value: bankName,
                      onChange: (e) => setBankName(e.target.value),
                      placeholder: "e.g. GCB, Ecobank"
                    })),
                    h(Field, { key: "an", label: "Bank account number" }, h(TextInput, {
                      value: bankAccountNumber,
                      onChange: (e) => setBankAccountNumber(e.target.value),
                      placeholder: "Account number"
                    }))
                  ],
              h(
                "p",
                { key: "save-hint", className: "text-xs text-slate-500 dark:text-slate-400" },
                "These details are saved automatically when you tap the link button below."
              )
            ].flat())
          : null,
        banksLoadErr
          ? h(InlineNotice, { key: "banks-err", variant: "error", className: "mb-3", onDismiss: () => setBanksLoadErr("") }, banksLoadErr)
          : null,
        !banksLoading && !banksLoadErr && ghanaBanks.length === 0
          ? h(
              InlineNotice,
              { key: "banks-empty", variant: "warning", className: "mb-3" },
              "No banks or mobile money networks were returned from Paystack. Check that PAYSTACK_SECRET_KEY is set on the server and that your Paystack business supports Ghana transfers, then refresh this page."
            )
          : null,
        payoutReceiveMethod
          ? h(Field, {
              label:
                payoutReceiveMethod === "mobile_money"
                  ? "Step 3 — MoMo network (Paystack list)"
                  : "Step 3 — Bank (Paystack list)"
            }, [
              banksLoading
                ? h("p", { className: "text-sm text-slate-500" }, "Loading networks…")
                : h(
                    "select",
                    {
                      className:
                        "w-full rounded-xl border border-slate-300/70 bg-white/80 px-3 py-2.5 text-sm text-slate-900 dark:border-white/10 dark:bg-night-900/80 dark:text-slate-100",
                      value: payoutBankKey,
                      onChange: (e) => setPayoutBankKey(e.target.value)
                    },
                    [
                      h(
                        "option",
                        { value: "" },
                        payoutReceiveMethod === "mobile_money" ? "Select MoMo network…" : "Select your bank…"
                      ),
                      ...payoutInstitutions.map((b) =>
                        h(
                          "option",
                          { key: `${b.channel}-${b.code}`, value: `${b.channel}|${b.code}` },
                          b.name || b.code
                        )
                      )
                    ]
                  )
            ])
          : null,
        payoutReceiveMethod === "mobile_money"
          ? h(
              "p",
              { key: "momo-hint", className: "mt-2 text-xs text-slate-500 dark:text-slate-400" },
              "We will link this MoMo wallet with Paystack so your share of card and MoMo checkout payments can be sent here (when auto-payout is enabled)."
            )
          : payoutReceiveMethod === "ghipss"
            ? h(
                "p",
                { key: "bank-hint", className: "mt-2 text-xs text-slate-500 dark:text-slate-400" },
                "We will link this bank account with Paystack so your share of checkout payments can be sent here (when auto-payout is enabled)."
              )
            : null,
        payoutErr
          ? h(InlineNotice, { key: "pout-err", variant: "error", className: "mt-2", onDismiss: () => setPayoutErr("") }, payoutErr)
          : null,
        payoutOk
          ? h(InlineNotice, { key: "pout-done", variant: "success", className: "mt-2", onDismiss: () => setPayoutOk("") }, payoutOk)
          : null,
        payoutReceiveMethod
          ? h(Button, {
              className: "mt-3 w-full sm:w-auto",
              type: "button",
              loading: registeringPayout,
              onClick: registerPaystackPayout
            }, user?.paystackPayoutRegistered
              ? payoutReceiveMethod === "mobile_money"
                ? "Update linked MoMo wallet"
                : "Update linked bank account"
              : payoutReceiveMethod === "mobile_money"
                ? "Link MoMo wallet for payouts"
                : "Link bank account for payouts")
          : null
      ]),
      h(GlassPanel, { className: "!border-rose-500/30 !bg-rose-500/[0.05]" }, [
        h("h2", { className: "mb-2 flex items-center gap-2 font-semibold text-rose-700 dark:text-rose-300" }, [
          h(Trash2, { className: "h-4 w-4" }),
          "Delete account"
        ]),
        h(
          "p",
          { className: "text-sm text-slate-600 dark:text-slate-300" },
          "This is permanent. Account deletion is blocked if you still have active sales orders."
        ),
        h("div", { className: "mt-4 space-y-3" }, [
          h(Field, { label: "Current password" }, h(TextInput, {
            type: "password",
            value: deletePassword,
            onChange: (e) => setDeletePassword(e.target.value),
            placeholder: "Your password"
          })),
          h(Field, { label: 'Type DELETE to confirm' }, h(TextInput, {
            value: deleteConfirm,
            onChange: (e) => setDeleteConfirm(e.target.value),
            placeholder: "DELETE"
          })),
          h(Button, {
            type: "button",
            variant: "ghost",
            className: "!border-rose-500/30 !text-rose-700 dark:!text-rose-300",
            onClick: removeAccount,
            loading: deleting,
            disabled: !deletePassword.trim() || deleteConfirm.trim().toUpperCase() !== "DELETE"
          }, "Delete seller account")
        ])
      ])
    ]),
    h("div", { className: "space-y-6" }, [
      h(GlassCard, {}, [
        h("div", { className: "mx-auto" }, vendorUserAvatarNode(user, { sizeClass: "h-24 w-24", initialTextClass: "text-2xl" })),
        h("p", { className: "mt-3 text-center font-semibold text-slate-900 dark:text-white" }, user?.displayName || "Vendor"),
        h("p", { className: "text-center text-sm text-slate-500 dark:text-slate-400" }, user?.email || "")
      ])
    ])
  ]);
}

export function VendorProfilePage() {
  const { accessToken, user, setUser } = useAuth();
  const [me, setMe] = useState(null);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch("/api/auth/me", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => {
        if (d.user) {
          setMe(d.user);
          setUser(d.user);
        }
      })
      .catch(() => {});
  }, [accessToken, setUser]);

  const u = me || user;

  return h(GlassPanel, {}, [
    h("h1", { className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, "Vendor profile"),
    h("div", { className: "mb-4 mt-4 flex flex-col items-center sm:flex-row sm:items-start sm:gap-6" }, [
      h("div", { className: "shrink-0" }, vendorUserAvatarNode(u, { sizeClass: "h-28 w-28", initialTextClass: "text-3xl" })),
      h("div", { className: "min-w-0 text-center sm:mt-2 sm:text-left" }, [
        h("p", { className: "text-lg font-semibold text-slate-900 dark:text-white" }, u?.displayName || "Vendor"),
        h("p", { className: "mt-1 text-sm text-slate-500 dark:text-slate-400" }, u?.email || "")
      ])
    ]),
    h("p", { className: "mb-4 text-sm text-slate-600 dark:text-slate-400" }, "Details below are synced from your account. Change your photo in Vendor settings."),
    h("dl", { className: "mt-6 space-y-3 text-sm" }, [
      h("div", {}, [h("dt", { className: "text-slate-500 dark:text-slate-400" }, "Email"), h("dd", { className: "font-medium text-slate-900 dark:text-white" }, u?.email || "—")]),
      h("div", {}, [h("dt", { className: "text-slate-500 dark:text-slate-400" }, "Display name"), h("dd", { className: "font-medium" }, u?.displayName || "—")]),
      h("div", {}, [h("dt", { className: "text-slate-500 dark:text-slate-400" }, "Buyer contact phone"), h("dd", { className: "font-mono font-medium" }, u?.phone || "—")]),
      h("div", {}, [
        h("dt", { className: "text-slate-500 dark:text-slate-400" }, "Payout method (Paystack)"),
        h(
          "dd",
          { className: "font-medium" },
          u?.ghanaPayoutChannel === "mobile_money"
            ? "Mobile money (MoMo)"
            : u?.ghanaPayoutChannel === "ghipss"
              ? "Bank account"
              : u?.paystackPayoutRegistered
                ? "Linked"
                : "—"
        )
      ]),
      u?.ghanaPayoutChannel === "ghipss"
        ? h("div", {}, [h("dt", { className: "text-slate-500 dark:text-slate-400" }, "Bank (note)"), h("dd", { className: "font-medium" }, u?.bankName || "—")])
        : null,
      h("div", {}, [
        h("dt", { className: "text-slate-500 dark:text-slate-400" }, u?.ghanaPayoutChannel === "mobile_money" ? "MoMo wallet name" : "Account name"),
        h("dd", { className: "font-medium" }, u?.bankAccountName || "—")
      ]),
      h("div", {}, [
        h("dt", { className: "text-slate-500 dark:text-slate-400" }, u?.ghanaPayoutChannel === "mobile_money" ? "MoMo wallet number" : "Account number"),
        h("dd", { className: "font-medium font-mono" }, u?.bankAccountNumber || "—")
      ]),
      h("div", {}, [h("dt", { className: "text-slate-500 dark:text-slate-400" }, "Role"), h("dd", { className: "font-medium" }, u?.role || "—")])
    ]),
    h(Link, { to: "/vendor/settings" }, h(Button, { variant: "ghost", className: "mt-6" }, "Edit in settings"))
  ]);
}

export function VendorNotificationsPage() {
  return h(NotificationsContent, {
    ordersLink: "/vendor/orders",
    backLink: "/vendor/dashboard",
    backLabel: "Dashboard"
  });
}
