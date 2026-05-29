import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ChevronRight, Clock, MapPin, Package, Share2, Sparkles, Star, Truck } from "lucide-react";
import { apiFetch, fetchBusinessStorefront, getApiBase } from "services/api";
import { useAuth, useNotice } from "context";
import { BuyerLayout, CartDrawer, ReviewStars } from "pages/buyer/screensBuyer";
import { formatGhc } from "utils/money";
import { h, f } from "utils/h";
import { storeStatusLabel } from "utils/storeStatus";
import { Button, GlassPanel, Field, TextArea, InlineNotice } from "components/ui";
import { CATEGORY_LABELS, isFoodCallToOrderCategory, isOfflineQuoteCategory, productCategoryForBusinessType } from "config/catalog";

function HubListingFallbackCard({ p }) {
  const to = `/products/${encodeURIComponent(p.id)}`;
  const src =
    Array.isArray(p.imageUrls) && typeof p.imageUrls[0] === "string" && String(p.imageUrls[0]).trim()
      ? p.imageUrls[0]
      : "";
  const priceNum = Number(p.price);
  return h(
    Link,
    {
      to,
      className:
        "flex gap-3 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/90 p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md dark:border-white/10 dark:bg-night-900/50 dark:hover:border-violet-400/40"
    },
    [
      h(
        "div",
        {
          key: "th",
          className:
            "flex h-[4.25rem] w-[4.25rem] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-night-950/60"
        },
        src
          ? h("img", {
              src,
              alt: "",
              loading: "lazy",
              decoding: "async",
              className: "h-full w-full object-cover"
            })
          : h(Package, { className: "h-7 w-7 text-slate-400 dark:text-slate-500", "aria-hidden": true })
      ),
      h("div", { key: "txt", className: "min-w-0 flex-1" }, [
        h(
          "p",
          {
            key: "n",
            className: "line-clamp-2 font-display text-sm font-bold leading-snug text-slate-900 dark:text-white"
          },
          String(p.name || "Listing")
        ),
        Number.isFinite(priceNum)
          ? h(
              "p",
              {
                key: "pr",
                className: "mt-1 font-semibold tabular-nums text-violet-700 dark:text-violet-200"
              },
              formatGhc(priceNum)
            )
          : null
      ])
    ]
  );
}

/** Path segment → API `businessType` (must match backend `BUSINESS_TYPES`). */
export const CATEGORY_HUB_CONFIG = {
  food: {
    businessType: "food_restaurant",
    title: "Food & restaurants",
    subtitle: "Restaurant storefronts, menus, and food & drinks — Discover restaurants and menus near you.",
    heroClass:
      "from-amber-500/95 via-orange-600/90 to-rose-600/95 shadow-amber-900/30",
    badge: "Restaurants",
    accent: "text-amber-100",
    accentSoft: "text-amber-200/90"
  },
  fashion: {
    businessType: "fashion_store",
    title: "Fashion",
    subtitle: "Clothes, accessories, and style from trusted sellers — catalogue grid storefronts.",
    heroClass:
      "from-fuchsia-500/95 via-purple-600/90 to-indigo-700/95 shadow-purple-900/30",
    badge: "Fashion",
    accent: "text-fuchsia-100",
    accentSoft: "text-fuchsia-200/85"
  },
  electronics: {
    businessType: "electronics_shop",
    title: "Electronics",
    subtitle: "Gadgets, peripherals, and study tech from verified shops.",
    heroClass:
      "from-sky-500/95 via-blue-700/95 to-night-950 shadow-sky-900/35",
    badge: "Electronics",
    accent: "text-sky-100",
    accentSoft: "text-sky-200/85"
  },
  beauty: {
    businessType: "beauty_shop",
    title: "Beauty",
    subtitle: "Skincare, hair, and personal care beauty and personal care sellers.",
    heroClass:
      "from-pink-500/95 via-rose-600/95 to-purple-800/95 shadow-pink-900/30",
    badge: "Beauty",
    accent: "text-pink-100",
    accentSoft: "text-pink-200/85"
  },
  babies: {
    businessType: "baby_infant_store",
    title: "Babies & infants",
    subtitle: "Gentle essentials — nursery gear, feeding, diapers, apparel, and care from trusted sellers.",
    heroClass:
      "from-cyan-400/95 via-sky-500/92 to-indigo-600/95 shadow-indigo-900/30",
    badge: "Little ones",
    accent: "text-sky-50",
    accentSoft: "text-cyan-100/95"
  },
  groceries: {
    businessType: "grocery_store",
    title: "Groceries",
    subtitle: "Essentials, snacks, and hall staples from nearby stores.",
    heroClass:
      "from-emerald-500/95 via-teal-600/90 to-green-900/95 shadow-emerald-900/30",
    badge: "Groceries",
    accent: "text-emerald-100",
    accentSoft: "text-emerald-200/85"
  },
  books: {
    businessType: "academic_book",
    title: "Books & academic",
    subtitle: "Textbooks, course materials, and study resources.",
    heroClass:
      "from-indigo-500/95 via-violet-700/95 to-night-950 shadow-indigo-900/35",
    badge: "Books",
    accent: "text-indigo-100",
    accentSoft: "text-indigo-200/85"
  },
  services: {
    businessType: "service_provider",
    title: "Services",
    subtitle: "Tutoring, repairs, creative work — booking-style listings.",
    heroClass:
      "from-orange-400/95 via-amber-600/95 to-yellow-900/95 shadow-orange-900/30",
    badge: "Services",
    accent: "text-orange-50",
    accentSoft: "text-amber-200/85"
  }
};

function StoreCard({ b }) {
  const logo =
    b.logoUrl && String(b.logoUrl).trim()
      ? h("img", {
          src: b.logoUrl,
          alt: "",
          className: "h-14 w-14 rounded-2xl border border-white/20 object-cover shadow-lg"
        })
      : h(
          "span",
          { className: "flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-lg font-black text-white" },
          String(b.name || "?").slice(0, 1).toUpperCase()
        );

  const tags = Array.isArray(b.tags) ? b.tags.slice(0, 4) : [];
  const base = getApiBase() || "";

  return h(
    Link,
    {
      to: `/store/${encodeURIComponent(b.slug)}`,
      className:
        "group relative flex gap-4 overflow-hidden rounded-3xl border border-white/15 bg-white/10 p-4 shadow-xl backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/15 dark:border-white/10 dark:bg-night-950/40"
    },
    [
      h("div", { key: "lg", className: "relative shrink-0" }, logo),
      h("div", { key: "body", className: "min-w-0 flex-1" }, [
        h(
          "h3",
          {
            key: "t",
            className:
              "font-display text-lg font-bold text-white drop-shadow-md group-hover:underline xs:text-xl"
          },
          b.name || "Store"
        ),
        h(
          "p",
          { key: "d", className: "mt-1 line-clamp-2 text-sm text-white/80" },
          b.description ? String(b.description).slice(0, 140) + (String(b.description).length > 140 ? "…" : "") : "Open storefront"
        ),
        tags.length
          ? h(
              "div",
              { key: "tags", className: "mt-2 flex flex-wrap gap-1.5" },
              tags.map((t, i) =>
                h(
                  "span",
                  {
                    key: i,
                    className:
                      "rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/90"
                  },
                  String(t)
                )
              )
            )
          : null,
        h(
          "p",
          { key: "go", className: "mt-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-200" },
          "Open menu →"
        )
      ]),
      b.bannerUrl && String(b.bannerUrl).trim() && base
        ? h("div", {
            key: "bg",
            className:
              "pointer-events-none absolute inset-0 -z-10 bg-cover bg-center opacity-25 blur-sm transition group-hover:opacity-35",
            style: { backgroundImage: `url(${b.bannerUrl})` }
          })
        : null
    ].filter(Boolean)
  );
}

export function CategoryHubPage({ slug }) {
  const cfg = CATEGORY_HUB_CONFIG[slug];
  const productCatKey = useMemo(
    () => (cfg ? productCategoryForBusinessType(cfg.businessType) : null),
    [cfg]
  );
  const [cartOpen, setCartOpen] = useState(false);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState("");
  const [stores, setStores] = useState([]);
  const [hubProdsBusy, setHubProdsBusy] = useState(true);
  const [hubProducts, setHubProducts] = useState([]);

  useEffect(() => {
    if (!cfg) return;
    let on = true;
    setBusy(true);
    void (async () => {
      try {
        const qs = new URLSearchParams({
          type: cfg.businessType,
          limit: "36"
        });
        const raw = await apiFetch(`/api/businesses?${qs.toString()}`, { credentials: "omit" }).catch(() => null);
        if (!on) return;
        const list = raw && raw.businesses ? raw.businesses : [];
        setStores(Array.isArray(list) ? list : []);
        setErr("");
      } catch {
        setErr("Could not load stores.");
        setStores([]);
      } finally {
        if (on) setBusy(false);
      }
    })();
    return () => {
      on = false;
    };
  }, [cfg]);

  useEffect(() => {
    if (!cfg || !productCatKey) return;
    let on = true;
    setHubProdsBusy(true);
    void (async () => {
      try {
        const raw = await apiFetch(
          `/api/products?category=${encodeURIComponent(productCatKey)}&limit=40`,
          { credentials: "omit" }
        );
        if (!on) return;
        const list = raw && raw.products ? raw.products : [];
        setHubProducts(Array.isArray(list) ? list : []);
      } catch {
        if (on) setHubProducts([]);
      } finally {
        if (on) setHubProdsBusy(false);
      }
    })();
    return () => {
      on = false;
    };
  }, [cfg, productCatKey]);

  if (!cfg) {
    return h(NavMissing);
  }

  const catLabel = productCatKey ? CATEGORY_LABELS[productCatKey] || productCatKey : cfg.title;

  return h(f, null, [
    h(
      BuyerLayout,
      {
        key: "lay",
        onOpenCart: () => setCartOpen(true),
        title: cfg.title
      },
      h("div", { className: "mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-28" }, [
        h(
          "header",
          {
            key: "hero",
            className: `relative overflow-hidden rounded-3xl bg-gradient-to-br px-6 py-10 shadow-2xl sm:px-10 ${cfg.heroClass}`
          },
          [
            h("p", { className: `text-[11px] font-bold uppercase tracking-widest ${cfg.accentSoft}` }, cfg.badge),
            h("h1", { className: `mt-2 font-display text-3xl font-black text-white drop-shadow lg:text-4xl` }, cfg.title),
            h("p", { className: `mt-3 max-w-xl text-sm leading-relaxed ${cfg.accent}` }, cfg.subtitle),
            h(
              Link,
              {
                key: "back",
                to: "/",
                className: "mt-6 inline-flex text-sm font-semibold text-white/90 underline underline-offset-4 hover:text-white"
              },
              "← All categories"
            )
          ]
        ),
        busy
          ? h("p", { key: "ld", className: "py-16 text-center text-sm text-slate-500 dark:text-slate-400" }, "Loading stores…")
          : err
            ? h(
                GlassPanel,
                { key: "er", className: "mx-auto mt-10 max-w-md text-center text-sm text-rose-800 dark:text-rose-300" },
                err
              )
            : stores.length === 0
              ? hubProdsBusy
                ? h(
                    "p",
                    { key: "ldp", className: "py-10 text-center text-sm text-slate-500 dark:text-slate-400" },
                    "Loading marketplace listings…"
                  )
                : hubProducts.length > 0
                  ? h(f, { key: "fallback-prods" }, [
                      h("div", { key: "rail-h", className: "mx-auto mb-10 mt-10 max-w-3xl rounded-3xl bg-violet-50/95 p-6 text-center dark:bg-violet-950/35" }, [
                        h(
                          "p",
                          {
                            key: "t",
                            className:
                              "text-sm font-bold uppercase tracking-[0.12em] text-violet-800 dark:text-violet-200"
                          },
                          `${catLabel} on the marketplace`
                        ),
                        h(
                          "p",
                          {
                            key: "sub",
                            className: "mx-auto mt-2 max-w-lg text-xs leading-relaxed text-slate-600 dark:text-slate-400 sm:text-sm"
                          },
                          "There isn’t an approved storefront in this aisle yet — these are live catalogue listings that shoppers can browse from Home. Open Storefront Studio as a Seller to spin up your shop here."
                        )
                      ]),
                      h(
                        "ul",
                        {
                          key: "flist",
                          className:
                            "mt-8 grid gap-4 sm:grid-cols-2 lg:gap-6"
                        },
                        hubProducts.map((p) => h("li", { key: p.id }, h(HubListingFallbackCard, { p })))
                      )
                    ])
                  : h(
                      GlassPanel,
                      { key: "em", className: "mx-auto mt-10 max-w-lg text-center" },
                      [
                        h("p", { className: "font-semibold text-slate-900 dark:text-white" }, "Nothing here yet"),
                        h(
                          "p",
                          { className: "mt-2 text-sm text-slate-600 dark:text-slate-400" },
                          "No approved storefronts in this aisle, and nothing live in catalogue with this category yet. From Home, shoppers can browse all approvals once sellers publish listings."
                        )
                      ]
                    )
              : h(
                  "ul",
                  {
                    key: "grid",
                    className: "mt-10 grid gap-4 sm:grid-cols-2 lg:gap-6"
                  },
                  stores.map((b) => h("li", { key: b.slug || b.id }, h(StoreCard, { b })))
                )
      ])
    ),
    h(CartDrawer, { key: "cart", open: cartOpen, onClose: () => setCartOpen(false) })
  ]);
}

/** Light-theme store card for `/browse-stores` grid (neutral shell, readable in light/dark). */
function BrowseStoreGridCard({ b }) {
  const slug = String(b.slug || "").trim();
  if (!slug) return null;
  const logo =
    b.logoUrl && String(b.logoUrl).trim()
      ? h("img", {
          src: b.logoUrl,
          alt: "",
          className:
            "h-12 w-12 shrink-0 rounded-2xl border border-slate-200/80 object-cover shadow-sm dark:border-white/15"
        })
      : h(
          "span",
          {
            className:
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-100 text-sm font-bold text-slate-500 dark:border-white/15 dark:bg-night-950/50 dark:text-slate-400"
          },
          String(b.name || "?")
            .slice(0, 1)
            .toUpperCase()
        );

  return h(
    Link,
    {
      to: `/store/${encodeURIComponent(slug)}`,
      className:
        "flex gap-3 rounded-2xl border border-slate-200/90 bg-white/90 p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300/80 hover:shadow-md dark:border-white/10 dark:bg-night-900/55 dark:hover:border-sky-500/35"
    },
    [
      logo,
      h("div", { key: "txt", className: "min-w-0 flex-1" }, [
        h(
          "p",
          {
            key: "n",
            className:
              "line-clamp-2 font-display text-sm font-bold leading-snug text-slate-900 hover:text-sky-700 dark:text-white dark:hover:text-sky-300"
          },
          b.name || "Store"
        ),
        h(
          "p",
          {
            key: "ty",
            className:
              "mt-0.5 truncate text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400"
          },
          String(b.businessType || "").replace(/_/g, " ")
        )
      ])
    ]
  );
}

/** Dedicated page: all storefronts grid + shortcuts to category hubs (content removed from home dashboard). */
export function BrowseStoresPage() {
  const [cartOpen, setCartOpen] = useState(false);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState("");
  const [stores, setStores] = useState([]);
  /** Increment to re-fetch after "Try again" (and on mount). */
  const [loadTick, setLoadTick] = useState(0);

  useEffect(() => {
    let on = true;
    setBusy(true);
    void (async () => {
      try {
        const raw = await apiFetch("/api/businesses?limit=200", { credentials: "omit" });
        if (!on) return;
        const list = raw && raw.businesses ? raw.businesses : [];
        setStores(Array.isArray(list) ? list : []);
        setErr("");
      } catch {
        if (!on) return;
        setErr("Could not load stores.");
        setStores([]);
      } finally {
        if (on) setBusy(false);
      }
    })();
    return () => {
      on = false;
    };
  }, [loadTick]);

  const hubLinks = [
    ["Food", "/food"],
    ["Fashion", "/fashion"],
    ["Electronics", "/electronics"],
    ["Beauty", "/beauty"],
    ["Babies", "/babies"],
    ["Groceries", "/groceries"],
    ["Books", "/books"],
    ["Services", "/services"]
  ];

  const visible = stores.filter((b) => String(b.slug || "").trim());

  return h(f, null, [
    h(
      BuyerLayout,
      {
        key: "lay",
        onOpenCart: () => setCartOpen(true),
        title: "Browse stores"
      },
      h(
        "div",
        { className: "mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-28" },
        [
          h("header", { key: "hdr", className: "mb-8 space-y-3" }, [
            h(
              "p",
              {
                key: "eyebrow",
                className: "text-[10px] font-bold uppercase tracking-[0.22em] text-sky-600 dark:text-sky-400"
              },
              "Stores"
            ),
            h(
              "h1",
              {
                key: "h",
                className:
                  "font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl"
              },
              "Browse storefronts"
            ),
            h(
              "p",
              {
                key: "sub",
                className: "max-w-2xl text-sm text-slate-600 dark:text-slate-400"
              },
              "Each vendor has a public page with their listings. Explore by category or open a store below."
            ),
            h(
              "div",
              {
                key: "hubs",
                className: "flex flex-wrap gap-x-3 gap-y-1 pt-2 text-xs font-semibold"
              },
              hubLinks.map(([label, path]) =>
                h(
                  Link,
                  {
                    key: path,
                    to: path,
                    className:
                      "text-sky-700 underline decoration-sky-700/30 underline-offset-2 hover:decoration-sky-700 dark:text-sky-300"
                  },
                  label
                )
              )
            )
          ]),
          busy
            ? h("p", { key: "ld", className: "py-16 text-center text-sm text-slate-500 dark:text-slate-400" }, "Loading stores…")
            : err
              ? h("div", { key: "er-wrap", className: "mx-auto mt-10 max-w-md space-y-3 text-center" }, [
                  h(
                    GlassPanel,
                    { key: "er", className: "text-sm text-rose-800 dark:text-rose-300" },
                    err
                  ),
                  h(
                    Button,
                    {
                      key: "retry",
                      type: "button",
                      variant: "primary",
                      className: "!rounded-xl",
                      onClick: () => setLoadTick((t) => t + 1)
                    },
                    "Try again"
                  )
                ])
              : visible.length === 0
                ? h(
                    GlassPanel,
                    { key: "em", className: "mx-auto mt-10 max-w-lg text-center text-sm text-slate-600 dark:text-slate-400" },
                    "No storefronts yet. Approved vendors publish active businesses here."
                  )
                : h(
                    "ul",
                    {
                      key: "grid",
                      className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                    },
                    visible.map((b) => h("li", { key: b.id || b.slug }, h(BrowseStoreGridCard, { b })))
                  )
        ].filter(Boolean)
      )
    ),
    h(CartDrawer, { key: "cart", open: cartOpen, onClose: () => setCartOpen(false) })
  ]);
}

function NavMissing() {
  return h(
    BuyerLayout,
    { title: "Not found", onOpenCart: () => {} },
    h("div", { className: "mx-auto max-w-lg px-4 py-24 text-center" }, [
      h("h1", { className: "text-xl font-bold text-slate-900 dark:text-white" }, "Category not available"),
      h(Link, { to: "/", className: "mt-4 inline-block text-sky-600 hover:underline dark:text-sky-300" }, "Go home")
    ])
  );
}

/** Compact hours line from `business.operatingHours` (mixed day keys). */
export function formatOperatingHoursSnippet(oh) {
  if (!oh || typeof oh !== "object") return null;
  const lines = Object.entries(oh)
    .filter(([, v]) => v && typeof v === "object")
    .slice(0, 4)
    .map(([day, v]) => {
      const d = String(day).replace(/_/g, " ").slice(0, 3);
      if (v.closed) return `${d}: closed`;
      const o = v.open != null ? String(v.open) : "—";
      const c = v.close != null ? String(v.close) : "—";
      return `${d} ${o}–${c}`;
    });
  return lines.length ? lines.join(" · ") : null;
}

export function infoTile(iconEl, title, body) {
  return h(
    "div",
    {
      className:
        "rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-white/10 dark:bg-night-900/85"
    },
    [
      h("div", { className: "flex items-start gap-3" }, [
        h(
          "div",
          {
            className:
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/15 to-indigo-500/10 text-sky-600 dark:from-sky-500/20 dark:to-indigo-500/10 dark:text-sky-300"
          },
          iconEl
        ),
        h("div", { className: "min-w-0" }, [
          h("p", { className: "text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" }, title),
          h("p", { className: "mt-1 text-sm font-semibold leading-snug text-slate-900 dark:text-white" }, body)
        ])
      ])
    ]
  );
}

/**
 * Groups products by menu section id for ordering; items without a known section go last.
 */
export function prepareStorefrontListingGroups(menuSections, products) {
  const safeSections = Array.isArray(menuSections) ? menuSections : [];
  const safeProducts = Array.isArray(products) ? products : [];
  const sectionById = new Map(safeSections.map((s) => [String(s.id), s]));
  const grouped = {};
  const unassigned = [];
  safeProducts.forEach((p) => {
    const sid = p.menuSectionId ? String(p.menuSectionId) : "";
    if (sid && sectionById.has(sid)) {
      if (!grouped[sid]) grouped[sid] = [];
      grouped[sid].push(p);
    } else unassigned.push(p);
  });
  const orderedSectionIds = safeSections.filter((x) => grouped[String(x.id)]?.length).map((x) => String(x.id));
  return { grouped, unassigned, orderedSectionIds };
}

/**
 * Single flat grid for every store type: section order + any unassigned items.
 * Menu sections stay for vendor organization when editing products; shoppers see one list.
 */
export function buildStoreListingBlocks({ business, orderedSectionIds, grouped, unassigned }) {
  if (!business) return [];
  const items = [...orderedSectionIds.flatMap((sid) => grouped[sid] || []), ...unassigned];
  if (!items.length) return [];
  const title = business.businessType === "food_restaurant" ? "Menu" : "Listings";
  return [{ key: "listings", title, items }];
}

export function StorefrontProductCard({ product, business, vendorMode = false }) {
  const href = vendorMode ? `/vendor/products/${product.id}` : `/products/${product.id}`;
  const img = Array.isArray(product.imageUrls) && product.imageUrls[0] ? product.imageUrls[0] : null;
  const cat = product.category;
  const quote = typeof cat === "string" && isOfflineQuoteCategory({ category: cat });
  const foodCall = typeof cat === "string" && isFoodCallToOrderCategory({ category: cat });

  const priceLabel =
    quote || foodCall
      ? foodCall
        ? "Call to order"
        : "Quote / request"
      : formatGhc(Number(product.price || 0));

  const desc = String(product.description || "").trim();
  const descShort = desc.length > 72 ? `${desc.slice(0, 70)}…` : desc || "Tap to view details on SHOPIQGH.";

  return h(
    Link,
    {
      to: href,
      className:
        "group flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-200/40 ring-1 ring-slate-100/80 transition duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-sky-200/50 hover:ring-sky-200/60 dark:border-white/10 dark:bg-night-900/90 dark:shadow-black/30 dark:ring-white/5 dark:hover:shadow-sky-900/20 dark:hover:ring-sky-500/25"
    },
    [
      h(
        "div",
        { key: "media", className: "relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 dark:from-night-800 dark:to-night-950" },
        [
          img
            ? h("img", {
                src: img,
                alt: "",
                className: "h-full w-full object-cover transition duration-500 group-hover:scale-105"
              })
            : h(
                "div",
                { className: "flex h-full w-full items-center justify-center text-4xl opacity-40" },
                business?.businessType === "food_restaurant" ? "🍽️" : "🛍️"
              ),
          h(
            "span",
            {
              className:
                "absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-800 shadow-sm backdrop-blur-sm dark:bg-night-950/80 dark:text-sky-100"
            },
            foodCall ? "Menu" : quote ? "Service" : "Listing"
          )
        ]
      ),
      h("div", { key: "bd", className: "flex flex-1 flex-col p-4" }, [
        h("p", { className: "line-clamp-2 font-display text-sm font-bold leading-snug text-slate-900 dark:text-white" }, product.name || "Item"),
        h("p", { className: "mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400" }, descShort),
        h("div", { className: "mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-white/10" }, [
          h(
            "span",
            {
              className: `text-base font-black ${quote || foodCall ? "text-amber-600 dark:text-amber-300" : "text-sky-600 dark:text-sky-300"}`
            },
            priceLabel
          ),
          h(
            "span",
            {
              className:
                "inline-flex items-center gap-0.5 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700 transition group-hover:bg-sky-600 group-hover:text-white dark:bg-sky-950/50 dark:text-sky-200 dark:group-hover:bg-sky-500"
            },
            ["View", h(ChevronRight, { className: "h-3.5 w-3.5", strokeWidth: 2.5 })]
          )
        ]),
        typeof product.prepTimeMinutes === "number"
          ? h("p", { className: "mt-2 text-[10px] font-medium text-slate-500 dark:text-slate-500" }, `Prep ~${product.prepTimeMinutes} min`)
          : null
      ])
    ].filter(Boolean)
  );
}

export function BusinessStorefrontPage() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const orderIdFromUrl = searchParams.get("orderId") || "";
  const { user, accessToken } = useAuth();
  const { toast } = useNotice();
  const [cartOpen, setCartOpen] = useState(false);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState("");
  const [payload, setPayload] = useState(null);
  const [storeReviews, setStoreReviews] = useState([]);
  const [storeReviewStatus, setStoreReviewStatus] = useState(null);
  const [storeReviewStatusErr, setStoreReviewStatusErr] = useState("");
  const [storeRating, setStoreRating] = useState(5);
  const [storeComment, setStoreComment] = useState("");
  const [storeReviewSubmitting, setStoreReviewSubmitting] = useState(false);
  const [storeReviewMsg, setStoreReviewMsg] = useState("");

  useEffect(() => {
    let on = true;
    setBusy(true);
    void (async () => {
      try {
        const raw = await fetchBusinessStorefront(slug, { accessToken });
        if (!on) return;
        setPayload(raw);
        setErr("");
      } catch (e) {
        setPayload(null);
        setErr(String(e.message || "").trim() || "Store not available.");
      } finally {
        if (on) setBusy(false);
      }
    })();
    return () => {
      on = false;
    };
  }, [slug, accessToken]);

  const business = payload?.business || null;
  const menuSections = Array.isArray(payload?.menuSections) ? payload.menuSections : [];
  const products = Array.isArray(payload?.products) ? payload.products : [];
  const productReviewSummary = payload?.productReviewSummary || payload?.reviewSummary || { avgRating: null, count: 0 };
  const storeReviewSummary = payload?.storeReviewSummary || { avgRating: null, count: 0 };

  const hubEntry = business
    ? Object.entries(CATEGORY_HUB_CONFIG).find(([, v]) => v.businessType === business.businessType)
    : null;
  const hubPath = hubEntry ? `/${hubEntry[0]}` : "/";
  const hubBrowseLabel = hubEntry ? hubEntry[1].badge : "Stores";

  const { grouped, unassigned, orderedSectionIds } = prepareStorefrontListingGroups(menuSections, products);

  const menuBlocks = buildStoreListingBlocks({
    business,
    orderedSectionIds,
    grouped,
    unassigned
  });

  useEffect(() => {
    if (!slug || !business) return;
    let cancelled = false;
    apiFetch(`/api/businesses/${encodeURIComponent(slug)}/reviews`)
      .then((d) => {
        if (!cancelled) setStoreReviews(d.reviews || []);
      })
      .catch(() => {
        if (!cancelled) setStoreReviews([]);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, business?.id]);

  useEffect(() => {
    if (!accessToken || !slug) {
      setStoreReviewStatus(null);
      setStoreReviewStatusErr("");
      return;
    }
    let cancelled = false;
    setStoreReviewStatusErr("");
    const qs = orderIdFromUrl
      ? `?orderId=${encodeURIComponent(orderIdFromUrl)}&_=${Date.now()}`
      : `?_=${Date.now()}`;
    apiFetch(`/api/businesses/${encodeURIComponent(slug)}/review-status${qs}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
      .then((d) => {
        if (!cancelled) {
          setStoreReviewStatus(d);
          setStoreReviewStatusErr("");
        }
      })
      .catch((ex) => {
        if (!cancelled) {
          setStoreReviewStatus(null);
          setStoreReviewStatusErr(ex.message || "Could not load store review eligibility");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, slug, orderIdFromUrl]);

  const storeAvgDisplay = useMemo(() => {
    if (storeReviewSummary?.avgRating != null) return storeReviewSummary.avgRating;
    if (!storeReviews.length) return null;
    const s = storeReviews.reduce((a, r) => a + (Number(r.rating) || 0), 0);
    return Math.round((s / storeReviews.length) * 10) / 10;
  }, [storeReviewSummary, storeReviews]);

  const submitStoreReview = async () => {
    setStoreReviewMsg("");
    if (!accessToken || !slug || !storeReviewStatus?.canSubmit) return;
    const oid =
      storeReviewStatus.orderId != null && String(storeReviewStatus.orderId).trim()
        ? String(storeReviewStatus.orderId).trim()
        : "";
    if (!storeReviewStatus.skipVerifiedPurchase && !oid) return;
    setStoreReviewSubmitting(true);
    try {
      await apiFetch(`/api/businesses/${encodeURIComponent(slug)}/reviews`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: { rating: storeRating, comment: storeComment.trim(), ...(oid ? { orderId: oid } : {}) }
      });
      setStoreComment("");
      const qs2 = orderIdFromUrl
        ? `?orderId=${encodeURIComponent(orderIdFromUrl)}&_=${Date.now()}`
        : `?_=${Date.now()}`;
      const [rv, st, raw] = await Promise.all([
        apiFetch(`/api/businesses/${encodeURIComponent(slug)}/reviews`),
        apiFetch(`/api/businesses/${encodeURIComponent(slug)}/review-status${qs2}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        }),
        fetchBusinessStorefront(slug, { accessToken })
      ]);
      setStoreReviews(rv.reviews || []);
      setStoreReviewStatus(st);
      setPayload(raw);
      setStoreReviewMsg("Thanks — your store review was posted.");
      toast("Store review posted", { variant: "success" });
    } catch (ex) {
      setStoreReviewMsg(ex.message || "Could not submit store review");
    } finally {
      setStoreReviewSubmitting(false);
    }
  };

  const viewerOwnsStore = Boolean(
    user?.role === "seller" && user?.id && business?.ownerId && String(user.id) === String(business.ownerId)
  );

  const hoursSnippet = formatOperatingHoursSnippet(business?.operatingHours);
  const listingCount = products.length;

  const pickupOk = Boolean(business?.pickupAvailable);
  const deliveryOk = Boolean(business?.deliveryAvailable);

  const etaRange =
    deliveryOk && business?.estimatedDeliveryMins != null
      ? `${Math.max(5, business.estimatedDeliveryMins - 8)}–${business.estimatedDeliveryMins + 12} min`
      : null;

  const feeLine =
    deliveryOk &&
    business?.deliveryFee != null &&
    Number.isFinite(Number(business.deliveryFee)) &&
    Number(business.deliveryFee) > 0
      ? `${formatGhc(Number(business.deliveryFee))} delivery fee`
      : deliveryOk
        ? "Delivery fees — confirm at checkout / with seller"
        : pickupOk
          ? "Pickup — arrange with seller"
          : "Contact seller";

  const storefrontLocationSnippet = business?.locationLabel?.trim()
    ? String(business.locationLabel).trim()
    : pickupOk && deliveryOk
      ? "Pickup and delivery offered — message the seller for pickup address / delivery zones."
      : deliveryOk && !pickupOk
        ? "Delivery offered — seller will confirm zones and timing."
        : pickupOk && !deliveryOk
          ? "Pickup — message the seller for pickup details."
          : "How to get your order — message the seller.";

  const storefrontServiceSnippet = [pickupOk && "Pickup", deliveryOk && "Delivery"].filter(Boolean).join(" · ") ||
    "See listings for how to buy";

  const shareStore = () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      void navigator.share({ title: business?.name || "SHOPIQGH store", url }).catch(() => {});
    } else if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(url).then(() => window.alert("Store link copied to clipboard."));
    }
  };

  const tagPills = Array.isArray(business?.tags) ? business.tags.filter(Boolean).slice(0, 8) : [];

  const heroMedia =
    business?.bannerUrl && String(business.bannerUrl).trim() ? (
      h("img", {
        key: "ban",
        src: business.bannerUrl,
        alt: "",
        className: "absolute inset-0 h-full w-full object-cover"
      })
    ) : (
      h("div", {
        key: "ban-ph",
        className:
          "absolute inset-0 bg-gradient-to-br from-amber-400 via-orange-500 to-rose-700 dark:from-amber-500/90 dark:via-orange-600 dark:to-rose-900"
      })
    );

  const logoCard =
    business?.logoUrl && String(business.logoUrl).trim() ? (
      h("img", {
        src: business.logoUrl,
        alt: "",
        className:
          "h-20 w-20 rounded-2xl border-4 border-white object-cover shadow-2xl ring-2 ring-sky-200/80 sm:h-24 sm:w-24 dark:border-night-950 dark:ring-sky-500/30"
      })
    ) : (
      h(
        "div",
        {
          className:
            "flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white bg-gradient-to-br from-sky-500 to-indigo-600 text-2xl font-black text-white shadow-2xl ring-2 ring-sky-200/80 sm:h-24 sm:w-24 dark:border-night-950"
        },
        business?.name ? String(business.name).slice(0, 1) : "?"
      )
    );

  return h(f, null, [
    h(
      BuyerLayout,
      {
        key: "lay",
        onOpenCart: () => setCartOpen(true),
        title: business?.name || "Store",
        hideSearch: false
      },
      h("div", { className: "relative" }, [
        busy
          ? h("div", { className: "px-6 py-24 text-center text-sm text-slate-600 dark:text-slate-400" }, "Opening storefront…")
          : err
            ? h("div", { className: "mx-auto max-w-md px-4 py-24 text-center text-sm text-rose-600 dark:text-rose-300" }, err)
            : h("div", { key: "store-root", className: "relative pb-28" }, [
                h("div", {
                  key: "ambient",
                  className:
                    "pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-sky-100/80 via-orange-50/35 to-transparent dark:from-indigo-950/40 dark:via-night-950/20 dark:to-transparent"
                }),
                h(
                  "div",
                  {
                    key: "hero",
                    className:
                      "relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] h-48 w-screen max-w-[100vw] overflow-hidden sm:h-56 lg:h-64"
                  },
                  [
                    heroMedia,
                    h("div", {
                      key: "hero-grad",
                      className:
                        "absolute inset-0 bg-gradient-to-t from-black/50 via-black/15 to-transparent dark:from-night-950/85 dark:via-night-950/35"
                    })
                  ]
                ),
                h("div", { key: "wrap", className: "relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8" }, [
                  h("div", { className: "lg:grid lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:items-start lg:gap-8" }, [
                    h(
                      "div",
                      {
                        key: "main",
                        className:
                          "-mt-12 rounded-3xl border border-slate-200/90 bg-white/95 p-5 shadow-xl shadow-slate-300/40 backdrop-blur-sm sm:-mt-16 sm:p-7 dark:border-white/10 dark:bg-night-900/95 dark:shadow-black/50"
                      },
                      [
                        viewerOwnsStore
                          ? h(
                              "div",
                              {
                                key: "vendor-preview",
                                className:
                                  "mb-4 rounded-2xl border border-sky-300/60 bg-sky-50 px-4 py-2.5 text-xs font-medium text-sky-900 dark:border-sky-500/30 dark:bg-sky-950/40 dark:text-sky-100"
                              },
                              "Vendor preview — this is how shoppers see your public store. Share the /store/ link from your Stores page."
                            )
                          : null,
                        h("nav", { key: "crumb", className: "mb-5 flex flex-wrap items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400" }, [
                          h(Link, { key: "home", to: "/", className: "hover:text-sky-600 dark:hover:text-sky-300" }, "SHOPIQGH"),
                          h(ChevronRight, { key: "c1", className: "h-3.5 w-3.5 shrink-0 opacity-60", "aria-hidden": true }),
                          h(Link, { key: "hub", to: hubPath, className: "hover:text-sky-600 dark:hover:text-sky-300" }, hubBrowseLabel),
                          h(ChevronRight, { key: "c2", className: "h-3.5 w-3.5 shrink-0 opacity-60", "aria-hidden": true }),
                          h("span", { key: "cur", className: "truncate text-slate-800 dark:text-slate-200" }, business?.name || "Storefront")
                        ]),
                        business?.status && business.status !== "active"
                          ? h(
                              "div",
                              {
                                key: "draft-banner",
                                className:
                                  "mb-4 rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-950 dark:border-amber-500/35 dark:bg-amber-950/40 dark:text-amber-100"
                              },
                              user?.role === "admin"
                                ? "Admin preview — this store is not live for shoppers until you approve it."
                                : viewerOwnsStore
                                  ? "Preview only — this store is not public yet. Submit it for approval from your vendor storefront page."
                                  : "This store is not visible to shoppers until it goes live.",
                            )
                          : null,
                        h("div", { key: "head", className: "flex flex-col gap-5 sm:flex-row sm:items-start" }, [
                          h("div", { className: "shrink-0" }, logoCard),
                          h("div", { className: "min-w-0 flex-1" }, [
                            h("div", { className: "flex flex-wrap items-center gap-2" }, [
                              h(
                                "h1",
                                {
                                  className:
                                    "font-display text-2xl font-black tracking-tight text-slate-900 sm:text-3xl lg:text-4xl dark:text-white"
                                },
                                business?.name || "Store"
                              ),
                              h(
                                "span",
                                {
                                  className: [
                                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1",
                                    business?.status === "active"
                                      ? "bg-emerald-500/15 text-emerald-700 ring-emerald-500/25 dark:bg-emerald-500/20 dark:text-emerald-200"
                                      : business?.status === "pending_approval"
                                        ? "bg-amber-500/15 text-amber-800 ring-amber-500/25 dark:bg-amber-500/15 dark:text-amber-200"
                                        : business?.status === "rejected"
                                          ? "bg-rose-500/15 text-rose-800 ring-rose-500/25 dark:bg-rose-500/15 dark:text-rose-200"
                                          : business?.status === "suspended"
                                            ? "bg-slate-500/15 text-slate-800 ring-slate-400/30 dark:bg-slate-500/20 dark:text-slate-300"
                                            : "bg-slate-200/90 text-slate-700 ring-slate-300 dark:bg-white/10 dark:text-slate-200 dark:ring-white/15"
                                  ].join(" ")
                                },
                                storeStatusLabel(business?.status)
                              )
                            ]),
                            h("div", { className: "mt-3 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300" }, [
                              storeReviewSummary.count > 0 || storeReviews.length > 0
                                ? h(
                                    "span",
                                    {
                                      key: "rate",
                                      className:
                                        "inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-bold text-amber-900 ring-1 ring-amber-200/80 dark:bg-amber-500/15 dark:text-amber-100 dark:ring-amber-400/30",
                                      title: "Store rating — service & fulfilment (not the same as product ratings)"
                                    },
                                    [
                                      h(Star, { key: "i", className: "h-3.5 w-3.5 fill-amber-400 text-amber-500" }),
                                      `${storeAvgDisplay != null ? storeAvgDisplay : "–"}`,
                                      h("span", { key: "c", className: "font-semibold text-slate-500 dark:text-slate-400" }, `(${
                                        storeReviewSummary.count || storeReviews.length
                                      })`),
                                      h("span", { key: "lbl", className: "ml-1 font-semibold text-slate-500 dark:text-slate-400" }, "store")
                                    ]
                                  )
                                : null,
                              etaRange
                                ? h(
                                    "span",
                                    {
                                      key: "eta",
                                      className:
                                        "inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-semibold dark:bg-white/10"
                                    },
                                    [h(Clock, { className: "h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-300" }), etaRange]
                                  )
                                : null,
                              h(
                                "span",
                                {
                                  key: "fee",
                                  className: "inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-semibold dark:bg-white/10"
                                },
                                [h(Truck, { className: "h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-300" }), feeLine]
                              )
                            ].filter(Boolean)),
                            tagPills.length
                              ? h(
                                  "div",
                                  { key: "tags", className: "mt-3 flex flex-wrap gap-2" },
                                  tagPills.map((t, i) =>
                                    h(
                                      "span",
                                      {
                                        key: `t-${i}`,
                                        className:
                                          "rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200"
                                      },
                                      String(t)
                                    )
                                  )
                                )
                              : null,
                            h("div", { key: "actions", className: "mt-4 flex flex-wrap gap-2" }, [
                              h(
                                Button,
                                { type: "button", variant: "outline", className: "gap-2", onClick: shareStore },
                                [h(Share2, { key: "sh", className: "h-4 w-4" }), " Share store"]
                              ),
                              h(
                                Link,
                                {
                                  to: hubPath,
                                  className:
                                    "tap-target inline-flex items-center justify-center gap-2 rounded-full bg-sky-600 px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-sky-600/25 transition hover:bg-sky-500"
                                },
                                ["Explore ", hubBrowseLabel]
                              )
                            ])
                          ])
                        ]),
                        business?.description
                          ? h(
                              "p",
                              {
                                key: "desc",
                                className: "mt-5 line-clamp-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400"
                              },
                              String(business.description)
                            )
                          : null,
                        h(
                          "div",
                          { key: "tiles", className: "mt-6 grid gap-3 sm:grid-cols-2" },
                          [
                            infoTile(
                              h(MapPin, { className: "h-5 w-5" }),
                              "Location",
                              storefrontLocationSnippet
                            ),
                            infoTile(
                              h(Clock, { className: "h-5 w-5" }),
                              "Hours",
                              hoursSnippet || "Hours vary — check with the store."
                            ),
                            infoTile(
                              h(Truck, { className: "h-5 w-5" }),
                              "Service",
                              storefrontServiceSnippet
                            ),
                            infoTile(h(Sparkles, { className: "h-5 w-5" }), "Fees", feeLine)
                          ]
                        ),
                        h(
                          "section",
                          {
                            key: "store-reviews",
                            id: "store-reviews",
                            className:
                              "mt-10 scroll-mt-24 rounded-3xl border border-amber-200/80 bg-gradient-to-br from-amber-50/90 to-white p-5 shadow-sm dark:border-amber-500/20 dark:from-amber-950/30 dark:to-night-900/80 sm:p-6"
                          },
                          [
                            h("div", { key: "sr-h", className: "flex flex-wrap items-end justify-between gap-3" }, [
                              h("div", { className: "min-w-0" }, [
                                h(
                                  "h2",
                                  {
                                    className: "font-display text-xl font-bold text-slate-900 dark:text-white"
                                  },
                                  "Store reviews"
                                ),
                                h(
                                  "p",
                                  {
                                    className: "mt-1 max-w-2xl text-xs leading-relaxed text-slate-600 dark:text-slate-400"
                                  },
                                  "Service, packaging, and delivery for this shop — separate from ratings on individual products (open a listing for item reviews)."
                                )
                              ]),
                              storeAvgDisplay != null
                                ? h("div", { key: "agg", className: "hidden text-right sm:block" }, [
                                    h("div", { className: "flex items-center justify-end gap-2" }, [
                                      h(ReviewStars, { value: storeAvgDisplay, className: "scale-90" }),
                                      h(
                                        "span",
                                        { className: "text-lg font-black text-slate-900 dark:text-white" },
                                        String(storeAvgDisplay)
                                      ),
                                      h("span", { className: "text-sm font-semibold text-slate-500 dark:text-slate-400" }, "/ 5")
                                    ]),
                                    h(
                                      "p",
                                      { className: "mt-0.5 text-[11px] text-slate-500 dark:text-slate-400" },
                                      `${storeReviewSummary.count || storeReviews.length || 0} review${
                                        (storeReviewSummary.count || storeReviews.length) === 1 ? "" : "s"
                                      }`
                                    )
                                  ])
                                : null
                            ]),
                            productReviewSummary.count > 0
                              ? h(
                                  "p",
                                  {
                                    key: "pavg",
                                    className: "mt-3 text-[11px] text-slate-500 dark:text-slate-400"
                                  },
                                  [
                                    "Product ratings on this shop’s listings (avg ",
                                    h(
                                      "span",
                                      { className: "font-semibold text-slate-700 dark:text-slate-200" },
                                      String(productReviewSummary.avgRating ?? "–")
                                    ),
                                    `, ${productReviewSummary.count} total) — different from the store score above.`
                                  ]
                                )
                              : null,
                            storeReviewStatusErr &&
                              h(
                                InlineNotice,
                                {
                                  key: "sre",
                                  variant: "error",
                                  className: "mt-3",
                                  onDismiss: () => setStoreReviewStatusErr("")
                                },
                                storeReviewStatusErr
                              ),
                            accessToken && storeReviewStatus?.canSubmit
                              ? h(GlassPanel, { key: "sf", className: "mt-4 !border-amber-500/25" }, [
                                  h("h3", { className: "font-semibold text-slate-900 dark:text-white" }, "Rate this store"),
                                  h(
                                    "p",
                                    { className: "mt-1 text-xs text-slate-500 dark:text-slate-400" },
                                    "One store review per account — about your overall experience with this seller."
                                  ),
                                  h("div", { className: "mt-3" }, [
                                    h(
                                      "p",
                                      { className: "mb-2 text-sm font-medium text-slate-700 dark:text-slate-200" },
                                      "Your rating"
                                    ),
                                    h(RatingStarPicker, { value: storeRating, onChange: setStoreRating, starSizeClass: "h-7 w-7" }),
                                    h(
                                      "p",
                                      { className: "mt-2 text-xs text-slate-500 dark:text-slate-400" },
                                      `${storeRating} of 5 stars`
                                    )
                                  ]),
                                  h(
                                    "div",
                                    { key: "comm", className: "mt-3" },
                                    h(
                                      Field,
                                      { label: "Comment (optional)" },
                                      h(TextArea, {
                                        value: storeComment,
                                        onChange: (e) => setStoreComment(e.target.value),
                                        rows: 4,
                                        placeholder: "Delivery speed, packaging, communication…"
                                      })
                                    )
                                  ),
                                  storeReviewMsg &&
                                    (String(storeReviewMsg).startsWith("Thanks")
                                      ? h(
                                          InlineNotice,
                                          {
                                            key: "srm-ok",
                                            variant: "success",
                                            className: "mt-3",
                                            onDismiss: () => setStoreReviewMsg("")
                                          },
                                          storeReviewMsg
                                        )
                                      : h(
                                          InlineNotice,
                                          {
                                            key: "srm-bad",
                                            variant: "error",
                                            className: "mt-3",
                                            onDismiss: () => setStoreReviewMsg("")
                                          },
                                          storeReviewMsg
                                        )),
                                  h(
                                    Button,
                                    {
                                      key: "sub",
                                      className: "mt-4",
                                      type: "button",
                                      loading: storeReviewSubmitting,
                                      onClick: () => void submitStoreReview()
                                    },
                                    "Submit store review"
                                  )
                                ])
                              : null,
                            accessToken &&
                            storeReviewStatus &&
                            !storeReviewStatus.canSubmit &&
                            !storeReviewStatus.hasReview &&
                            storeReviewStatus.reason === "purchase_required"
                              ? h(
                                  "p",
                                  { key: "need", className: "mt-4 text-sm text-slate-500 dark:text-slate-400" },
                                  [
                                    "Order from this store first, then you can leave a store review.",
                                    " ",
                                    h(
                                      Link,
                                      { to: "/orders", className: "font-medium text-sky-600 hover:underline dark:text-sky-300" },
                                      "My orders"
                                    )
                                  ]
                                )
                              : null,
                            accessToken && storeReviewStatus?.hasReview
                              ? h(
                                  "p",
                                  {
                                    key: "done",
                                    className: "mt-4 text-sm text-emerald-700 dark:text-emerald-300"
                                  },
                                  "You already left a store review."
                                )
                              : null,
                            !accessToken
                              ? h(
                                  "p",
                                  { key: "guest", className: "mt-4 text-sm text-slate-500 dark:text-slate-400" },
                                  "Sign in to review this store after you place an order."
                                )
                              : null,
                            h(
                              "div",
                              { key: "sr-list", className: "mt-5 space-y-3" },
                              storeReviews.length === 0
                                ? [
                                    h(
                                      "p",
                                      { key: "empty", className: "text-sm text-slate-500 dark:text-slate-400" },
                                      "No store reviews yet — be the first after you buy."
                                    )
                                  ]
                                : storeReviews.map((r) =>
                                    h(GlassPanel, { key: r.id, className: "!border-white/15 !p-4" }, [
                                      h(
                                        "div",
                                        { className: "flex flex-wrap items-center justify-between gap-2" },
                                        [
                                          h(
                                            "span",
                                            { className: "font-medium text-slate-800 dark:text-slate-100" },
                                            r.reviewerDisplayName || "Verified buyer"
                                          ),
                                          h(
                                            "span",
                                            { className: "text-xs text-slate-500" },
                                            new Date(r.createdAt).toLocaleDateString()
                                          )
                                        ]
                                      ),
                                      h(ReviewStars, { value: r.rating, className: "mt-1" }),
                                      r.comment
                                        ? h(
                                            "p",
                                            { className: "mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-200" },
                                            r.comment
                                          )
                                        : null
                                    ].filter(Boolean))
                                  )
                            )
                          ]
                        ),
                        menuBlocks.length
                          ? h("div", { key: "blocks", className: "mt-10 space-y-12" }, [
                              ...menuBlocks.map((block) =>
                                h("section", { key: block.key }, [
                                  h(
                                    "div",
                                    {
                                      className:
                                        "mb-4 flex items-end justify-between gap-3 border-b border-slate-200 pb-3 dark:border-white/10"
                                    },
                                    [
                                      h("h2", { className: "font-display text-xl font-bold text-slate-900 dark:text-white" }, block.title),
                                      h("span", { className: "text-xs font-semibold text-slate-500 dark:text-slate-400" }, `${block.items.length} items`)
                                    ]
                                  ),
                                  h(
                                    "div",
                                    { className: "grid gap-4 sm:grid-cols-2 xl:grid-cols-3" },
                                    block.items.map((p) => h(StorefrontProductCard, { key: p.id, product: p, business }))
                                  )
                                ])
                              )
                            ])
                          : h(
                              GlassPanel,
                              {
                                key: "empty",
                                className: "mt-10 text-center text-sm text-slate-600 dark:text-slate-300"
                              },
                              "This store has no live listings yet. Check back soon."
                            )
                      ]
                    ),
                    h(
                      "aside",
                      {
                        key: "aside",
                        className:
                          "mt-6 space-y-4 lg:sticky lg:top-24 lg:mt-0 lg:-mt-16 lg:self-start lg:space-y-4"
                      },
                      [
                        h(
                          "div",
                          {
                            className:
                              "rounded-3xl border border-slate-200/90 bg-gradient-to-br from-white to-sky-50/90 p-5 shadow-lg shadow-sky-200/25 dark:border-white/10 dark:from-night-900 dark:to-sky-950/35 dark:shadow-none"
                          },
                          [
                            h(
                              "p",
                              { className: "text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" },
                              "Store snapshot"
                            ),
                            h("div", { className: "mt-3 grid grid-cols-2 gap-3" }, [
                              h("div", { key: "c1", className: "rounded-2xl bg-white/90 p-3 shadow-sm dark:bg-night-950/80" }, [
                                h("p", { className: "text-[10px] font-bold text-slate-500 dark:text-slate-400" }, "Listings"),
                                h("p", { className: "mt-1 font-display text-2xl font-black text-slate-900 dark:text-white" }, String(listingCount))
                              ]),
                              h("div", { key: "c2", className: "rounded-2xl bg-white/90 p-3 shadow-sm dark:bg-night-950/80" }, [
                                h("p", { className: "text-[10px] font-bold text-slate-500 dark:text-slate-400" }, "Store reviews"),
                                h("p", { className: "mt-1 font-display text-2xl font-black text-slate-900 dark:text-white" }, String(storeReviewSummary.count || 0))
                              ])
                            ]),
                            h(
                              Link,
                              {
                                to: hubPath,
                                className: "mt-4 block text-center text-xs font-bold text-sky-600 hover:underline dark:text-sky-300"
                              },
                              `More in ${hubBrowseLabel} →`
                            )
                          ]
                        ),
                        h(
                          "div",
                          {
                            className:
                              "rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-night-900"
                          },
                          [
                            h("p", { className: "text-sm font-bold text-slate-900 dark:text-white" }, "Need help?"),
                            h(
                              "p",
                              { className: "mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400" },
                              "Questions about this store? Visit the help center or message the seller after you order."
                            ),
                            h(
                              Link,
                              { to: "/support", className: "mt-3 inline-block text-xs font-bold text-sky-600 hover:underline dark:text-sky-300" },
                              "Help center →"
                            )
                          ]
                        )
                      ]
                    )
                  ]),
                  h(
                    "p",
                    { key: "back", className: "mt-10 text-center sm:mt-12" },
                    h(Link, { to: "/", className: "text-sm font-semibold text-sky-600 hover:underline dark:text-sky-300" }, "← Back to SHOPIQGH")
                  )
                ])
              ])
      ])
    ),
    h(CartDrawer, { key: "cr", open: cartOpen, onClose: () => setCartOpen(false) })
  ]);
}
