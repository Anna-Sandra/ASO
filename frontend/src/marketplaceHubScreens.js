import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight, Clock, MapPin, Share2, Sparkles, Star, Truck } from "lucide-react";
import { apiFetch, getApiBase } from "./api";
import { BuyerLayout, CartDrawer } from "./screensBuyer";
import { formatGhc } from "./money";
import { h, f } from "./h";
import { Button, GlassPanel } from "./ui";
import { isFoodCallToOrderCategory, isOfflineQuoteCategory } from "./catalog";

/** Path segment → API `businessType` (must match backend `BUSINESS_TYPES`). */
export const CATEGORY_HUB_CONFIG = {
  food: {
    businessType: "food_restaurant",
    title: "Food & restaurants",
    subtitle: "Restaurant storefronts, menus, and campus bites — Uber Eats style discovery.",
    heroClass:
      "from-amber-500/95 via-orange-600/90 to-rose-600/95 shadow-amber-900/30",
    badge: "Restaurants",
    accent: "text-amber-100",
    accentSoft: "text-amber-200/90"
  },
  fashion: {
    businessType: "fashion_store",
    title: "Fashion",
    subtitle: "Clothes, accessories, and campus-ready style — catalogue grid storefronts.",
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
    subtitle: "Skincare, hair, and personal care sellers on campus.",
    heroClass:
      "from-pink-500/95 via-rose-600/95 to-purple-800/95 shadow-pink-900/30",
    badge: "Beauty",
    accent: "text-pink-100",
    accentSoft: "text-pink-200/85"
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
  const [cartOpen, setCartOpen] = useState(false);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState("");
  const [stores, setStores] = useState([]);

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

  if (!cfg) {
    return h(NavMissing);
  }

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
              ? h(
                  GlassPanel,
                  { key: "em", className: "mx-auto mt-10 max-w-lg text-center" },
                  [
                    h("p", { className: "font-semibold text-slate-900 dark:text-white" }, "No storefronts yet"),
                    h(
                      "p",
                      { className: "mt-2 text-sm text-slate-600 dark:text-slate-400" },
                      "Approved vendors can create a business profile in Vendor hub → Stores, then attach listings."
                    )
                  ]
                )
              : h(
                  "ul",
                  {
                    key: "grid",
                    className: "mt-10 grid gap-4 sm:grid-cols-2 lg:gap-6"
                  },
                  stores.map((b) =>
                    h("li", { key: b.slug || b.id }, h(StoreCard, { b }))
                  )
                )
      ])
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
function formatOperatingHoursSnippet(oh) {
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

function infoTile(iconEl, title, body) {
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

function buildMenuBlocks({ business, orderedSectionIds, grouped, unassigned, sectionById, sectionFilter }) {
  if (!business) return [];
  if (sectionFilter == null) {
    const blocks = [];
    orderedSectionIds.forEach((sid) => {
      const list = grouped[sid] || [];
      if (list.length) blocks.push({ key: sid, title: sectionById.get(sid)?.title || "Menu", items: list });
    });
    if (unassigned.length) {
      blocks.push({
        key: "un",
        title: business.businessType === "food_restaurant" ? "Popular & more" : "More from this store",
        items: unassigned
      });
    }
    return blocks;
  }
  if (sectionFilter === "un") {
    return unassigned.length
      ? [
          {
            key: "un",
            title: business.businessType === "food_restaurant" ? "Popular & more" : "More from this store",
            items: unassigned
          }
        ]
      : [];
  }
  const list = grouped[sectionFilter] || [];
  const title = sectionById.get(sectionFilter)?.title || "Menu";
  return list.length ? [{ key: sectionFilter, title, items: list }] : [];
}

function StorefrontProductCard({ product, business }) {
  const href = `/products/${product.id}`;
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
  const descShort = desc.length > 72 ? `${desc.slice(0, 70)}…` : desc || "Tap to view details on Campus Mart.";

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
  const [cartOpen, setCartOpen] = useState(false);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState("");
  const [payload, setPayload] = useState(null);
  const [sectionFilter, setSectionFilter] = useState(null);

  useEffect(() => {
    setSectionFilter(null);
  }, [slug]);

  useEffect(() => {
    let on = true;
    setBusy(true);
    void (async () => {
      try {
        const s = slug ? encodeURIComponent(slug) : "";
        const raw = await apiFetch(`/api/businesses/${s}/storefront`, { credentials: "omit" });
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
  }, [slug]);

  const business = payload?.business || null;
  const menuSections = Array.isArray(payload?.menuSections) ? payload.menuSections : [];
  const products = Array.isArray(payload?.products) ? payload.products : [];
  const reviewSummary = payload?.reviewSummary || { avgRating: null, count: 0 };

  const hubEntry = business
    ? Object.entries(CATEGORY_HUB_CONFIG).find(([, v]) => v.businessType === business.businessType)
    : null;
  const hubPath = hubEntry ? `/${hubEntry[0]}` : "/";
  const hubBrowseLabel = hubEntry ? hubEntry[1].badge : "Stores";

  const sectionById = new Map(menuSections.map((s) => [String(s.id), s]));

  const grouped = {};
  const unassigned = [];

  products.forEach((p) => {
    const sid = p.menuSectionId ? String(p.menuSectionId) : "";
    if (sid && sectionById.has(sid)) {
      if (!grouped[sid]) grouped[sid] = [];
      grouped[sid].push(p);
    } else unassigned.push(p);
  });

  const orderedSectionIds = menuSections.filter((x) => grouped[String(x.id)]?.length).map((x) => String(x.id));

  const menuBlocks = buildMenuBlocks({
    business,
    orderedSectionIds,
    grouped,
    unassigned,
    sectionById,
    sectionFilter
  });

  const hoursSnippet = formatOperatingHoursSnippet(business?.operatingHours);
  const listingCount = products.length;

  const etaRange =
    business?.estimatedDeliveryMins != null
      ? `${Math.max(5, business.estimatedDeliveryMins - 8)}–${business.estimatedDeliveryMins + 12} min`
      : null;

  const feeLine =
    business?.deliveryFee != null && Number.isFinite(Number(business.deliveryFee))
      ? `${formatGhc(Number(business.deliveryFee))} delivery fee`
      : business?.deliveryAvailable
        ? "Delivery fees at checkout"
        : "Pickup or ask seller";

  const radiusLine =
    business?.deliveryRadiusKm != null && Number(business.deliveryRadiusKm) > 0
      ? `Within ~${business.deliveryRadiusKm} km`
      : "Campus area";

  const shareStore = () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      void navigator.share({ title: business?.name || "Campus Mart store", url }).catch(() => {});
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

  const chip = (key, label, active, val) =>
    h(
      "button",
      {
        key,
        type: "button",
        onClick: () => setSectionFilter(val),
        className: `tap-target shrink-0 snap-start rounded-full border px-3.5 py-2 text-[11px] font-bold transition sm:px-4 sm:text-xs ${
          active
            ? "border-sky-500 bg-sky-600 text-white shadow-md shadow-sky-600/20"
            : "border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:text-sky-800 dark:border-white/10 dark:bg-night-900 dark:text-slate-200 dark:hover:border-sky-500/40"
        }`
      },
      label
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
                  { key: "hero", className: "relative h-44 w-full overflow-hidden sm:h-52 lg:h-60" },
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
                        h("nav", { key: "crumb", className: "mb-5 flex flex-wrap items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400" }, [
                          h(Link, { to: "/", className: "hover:text-sky-600 dark:hover:text-sky-300" }, "Campus Mart"),
                          h(ChevronRight, { className: "h-3.5 w-3.5 shrink-0 opacity-60", "aria-hidden": true }),
                          h(Link, { to: hubPath, className: "hover:text-sky-600 dark:hover:text-sky-300" }, hubBrowseLabel),
                          h(ChevronRight, { className: "h-3.5 w-3.5 shrink-0 opacity-60", "aria-hidden": true }),
                          h("span", { className: "truncate text-slate-800 dark:text-slate-200" }, business?.name || "Storefront")
                        ]),
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
                                  className:
                                    "inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-500/25 dark:bg-emerald-500/20 dark:text-emerald-200"
                                },
                                "Live"
                              )
                            ]),
                            h("div", { className: "mt-3 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300" }, [
                              reviewSummary.count
                                ? h(
                                    "span",
                                    {
                                      key: "rate",
                                      className:
                                        "inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-bold text-amber-900 ring-1 ring-amber-200/80 dark:bg-amber-500/15 dark:text-amber-100 dark:ring-amber-400/30"
                                    },
                                    [
                                      h(Star, { key: "i", className: "h-3.5 w-3.5 fill-amber-400 text-amber-500" }),
                                      `${reviewSummary.avgRating ?? "–"}`,
                                      h("span", { key: "c", className: "font-semibold text-slate-500 dark:text-slate-400" }, `(${reviewSummary.count})`)
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
                              business?.locationLabel
                                ? String(business.locationLabel)
                                : "On campus — message the seller for pickup details."
                            ),
                            infoTile(
                              h(Clock, { className: "h-5 w-5" }),
                              "Hours",
                              hoursSnippet || "Hours vary — check with the store."
                            ),
                            infoTile(
                              h(Truck, { className: "h-5 w-5" }),
                              "Service",
                              [business?.pickupAvailable && "Pickup", business?.deliveryAvailable && "Delivery"].filter(Boolean).join(" · ") ||
                                "See listings for how to buy"
                            ),
                            infoTile(h(Sparkles, { className: "h-5 w-5" }), "Fees & area", `${feeLine} · ${radiusLine}`)
                          ]
                        ),
                        orderedSectionIds.length || unassigned.length
                          ? h("div", { key: "chips", className: "mt-8" }, [
                              h(
                                "p",
                                { className: "mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" },
                                "Browse menu"
                              ),
                              h(
                                "div",
                                {
                                  className:
                                    "flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                                },
                                [
                                  chip("all", "All", sectionFilter == null, null),
                                  ...orderedSectionIds.map((sid) => {
                                    const sec = sectionById.get(sid);
                                    const n = (grouped[sid] || []).length;
                                    return chip(sid, `${sec?.title || "Menu"} · ${n}`, sectionFilter === sid, sid);
                                  }),
                                  unassigned.length
                                    ? chip(
                                        "un",
                                        `${business?.businessType === "food_restaurant" ? "Popular & more" : "More"} · ${unassigned.length}`,
                                        sectionFilter === "un",
                                        "un"
                                      )
                                    : null
                                ].filter(Boolean)
                              )
                            ])
                          : null,
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
                                h("p", { className: "text-[10px] font-bold text-slate-500 dark:text-slate-400" }, "Reviews"),
                                h("p", { className: "mt-1 font-display text-2xl font-black text-slate-900 dark:text-white" }, String(reviewSummary.count))
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
                    h(Link, { to: "/", className: "text-sm font-semibold text-sky-600 hover:underline dark:text-sky-300" }, "← Back to Campus Mart")
                  )
                ])
              ])
      ])
    ),
    h(CartDrawer, { key: "cr", open: cartOpen, onClose: () => setCartOpen(false) })
  ]);
}
