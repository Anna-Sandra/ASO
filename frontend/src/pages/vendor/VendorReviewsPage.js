import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Box, PlusCircle, Sparkles, Star } from "lucide-react";
import { useAuth } from "context";
import { apiFetch , apiErrorMessage} from "services/api";
import { h } from "utils/h";
import { Button, GlassCard, GlassPanel, InlineNotice } from "components/ui";

function VendorReviewStars({ value, sizeClass = "h-4 w-4" }) {
  const v = Math.min(5, Math.max(0, Math.round(Number(value) || 0)));
  return h(
    "span",
    { className: "inline-flex items-center gap-0.5", "aria-label": `${v} out of 5 stars` },
    [1, 2, 3, 4, 5].map((i) =>
      h(Star, {
        key: i,
        className: `${sizeClass} shrink-0 ${i <= v ? "fill-amber-400 text-amber-400" : "fill-none text-slate-300/80 dark:text-slate-600"}`,
        strokeWidth: 1.5,
        "aria-hidden": true
      })
    )
  );
}

function reviewBuyerInitial(name) {
  const s = String(name || "B").trim();
  return (s.slice(0, 1) || "B").toUpperCase();
}

function formatReviewWhen(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined
    });
  } catch {
    return "";
  }
}

function reviewRatingAccent(rating) {
  const n = Number(rating) || 0;
  if (n >= 4) return "border-emerald-200/80 bg-emerald-50/50 dark:border-emerald-500/25 dark:bg-emerald-950/20";
  if (n >= 3) return "border-amber-200/80 bg-amber-50/50 dark:border-amber-500/25 dark:bg-amber-950/20";
  return "border-rose-200/80 bg-rose-50/50 dark:border-rose-500/25 dark:bg-rose-950/20";
}

export function VendorReviewsPage() {
  const { accessToken } = useAuth();
  const location = useLocation();
  const [reviews, setReviews] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [ratingFilter, setRatingFilter] = useState("all");

  useEffect(() => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr("");
    apiFetch("/api/vendor/reviews", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => {
        if (cancelled) return;
        setReviews(Array.isArray(d?.reviews) ? d.reviews : []);
      })
      .catch((ex) => {
        if (cancelled) return;
        setErr(apiErrorMessage(ex, "Failed to load reviews"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, location.pathname]);

  const stats = useMemo(() => {
    if (!reviews.length) return { count: 0, avg: null, fiveStar: 0 };
    const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
    return {
      count: reviews.length,
      avg: Math.round((sum / reviews.length) * 10) / 10,
      fiveStar: reviews.filter((r) => Number(r.rating) === 5).length
    };
  }, [reviews]);

  const ratingCounts = useMemo(() => {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach((r) => {
      const n = Math.min(5, Math.max(1, Math.round(Number(r.rating) || 0)));
      counts[n] += 1;
    });
    return counts;
  }, [reviews]);

  const filteredReviews = useMemo(() => {
    if (ratingFilter === "all") return reviews;
    const n = Number(ratingFilter);
    return reviews.filter((r) => Math.round(Number(r.rating) || 0) === n);
  }, [reviews, ratingFilter]);

  const filterChip = (key, label, active) =>
    h(
      "button",
      {
        key,
        type: "button",
        onClick: () => setRatingFilter(key),
        className: `tap-target shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
          active
            ? "border-sky-500 bg-sky-600 text-white shadow-sm shadow-sky-600/25"
            : "border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-700 dark:border-white/10 dark:bg-night-900 dark:text-slate-300 dark:hover:border-sky-500/40"
        }`
      },
      label
    );

  const statCard = (key, label, value, sub) =>
    h(
      GlassCard,
      { key, className: "!p-4 sm:!p-5" },
      h("div", { className: "flex items-start justify-between gap-3" }, [
        h("div", { className: "min-w-0" }, [
          h("p", { className: "text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" }, label),
          h("p", { className: "mt-1.5 font-display text-2xl font-bold text-slate-900 dark:text-white" }, value),
          sub ? h("p", { className: "mt-0.5 text-xs text-slate-500 dark:text-slate-400" }, sub) : null
        ]),
        h(
          "div",
          {
            className:
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300"
          },
          h(Star, { className: "h-5 w-5 fill-amber-400 text-amber-400", "aria-hidden": true })
        )
      ])
    );

  return h("div", { className: "space-y-6" }, [
    h("div", { key: "hero", className: "flex flex-wrap items-end justify-between gap-4" }, [
      h("div", { className: "min-w-0" }, [
        h("div", { className: "flex items-center gap-2" }, [
          h(Sparkles, { className: "h-5 w-5 shrink-0 text-amber-500", "aria-hidden": true }),
          h("h1", { className: "font-display text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl" }, "Reviews")
        ]),
        h(
          "p",
          { className: "mt-1 max-w-xl text-sm text-slate-600 dark:text-slate-400" },
          "See what buyers say about your listings — use feedback to improve products and build trust."
        )
      ]),
      stats.count > 0
        ? h(
            Link,
            { key: "products", to: "/vendor/products", className: "shrink-0 text-sm font-semibold text-sky-600 hover:underline dark:text-sky-300" },
            "Manage listings →"
          )
        : h(
            Link,
            { key: "add", to: "/vendor/products/new", className: "shrink-0" },
            h(Button, { className: "!rounded-full !text-sm" }, [h(PlusCircle, { className: "h-4 w-4" }), "Add listing"])
          )
    ]),

    err ? h(InlineNotice, { key: "err", variant: "error", onDismiss: () => setErr("") }, err) : null,

    !loading && stats.count > 0
      ? h("div", { key: "stats", className: "grid grid-cols-1 gap-4 sm:grid-cols-3" }, [
          statCard("avg", "Average rating", String(stats.avg ?? "—"), "Across all reviews"),
          statCard("cnt", "Total reviews", String(stats.count), "Latest 100 shown"),
          statCard(
            "five",
            "5-star reviews",
            String(stats.fiveStar),
            stats.count ? `${Math.round((stats.fiveStar / stats.count) * 100)}% of total` : ""
          )
        ])
      : null,

    !loading && reviews.length > 0
      ? h(
          "div",
          { key: "filters", className: "flex flex-wrap items-center gap-2", role: "group", "aria-label": "Filter by rating" },
          [
            filterChip("all", `All · ${reviews.length}`, ratingFilter === "all"),
            ...[5, 4, 3, 2, 1]
              .filter((n) => ratingCounts[n] > 0)
              .map((n) => filterChip(String(n), `${n} ★ · ${ratingCounts[n]}`, ratingFilter === String(n)))
          ]
        )
      : null,

    loading
      ? h(
          "div",
          { key: "skel", className: "space-y-3" },
          [0, 1, 2].map((i) =>
            h("div", {
              key: i,
              className:
                "h-28 animate-pulse rounded-2xl border border-slate-200/80 bg-white/60 dark:border-white/10 dark:bg-night-900/40"
            })
          )
        )
      : reviews.length === 0
        ? h(
            GlassPanel,
            { key: "empty", className: "!py-14 text-center" },
            [
              h(
                "div",
                {
                  className:
                    "mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400/20 to-orange-500/10 text-amber-600 dark:from-amber-500/25 dark:to-orange-600/10 dark:text-amber-300"
                },
                h(Star, { className: "h-8 w-8", strokeWidth: 1.5, "aria-hidden": true })
              ),
              h("h2", { className: "mt-5 font-display text-lg font-bold text-slate-900 dark:text-white" }, "No reviews yet"),
              h(
                "p",
                { className: "mx-auto mt-2 max-w-sm text-sm text-slate-600 dark:text-slate-400" },
                "When buyers rate your products after purchase, their feedback will show up here."
              ),
              h(
                Link,
                { key: "cta", to: "/vendor/products", className: "mt-6 inline-block" },
                h(Button, { variant: "outline", className: "!rounded-full" }, "View my listings")
              )
            ]
          )
        : filteredReviews.length === 0
          ? h(
              GlassPanel,
              { key: "no-match", className: "!py-10 text-center" },
              [
                h("p", { className: "text-sm font-semibold text-slate-800 dark:text-slate-200" }, "No reviews at this rating"),
                h(
                  "button",
                  {
                    type: "button",
                    className: "mt-3 text-sm font-semibold text-sky-600 hover:underline dark:text-sky-300",
                    onClick: () => setRatingFilter("all")
                  },
                  "Show all reviews"
                )
              ]
            )
          : h(
              "div",
              { key: "list", className: "space-y-3" },
              filteredReviews.map((r, idx) => {
                const rating = Math.min(5, Math.max(0, Math.round(Number(r.rating) || 0)));
                const buyer = r.buyerDisplayName || "Buyer";
                const productName = r.productName || "Product";
                const comment = String(r.comment || "").trim();
                const productTo = r.productId ? `/vendor/products/${r.productId}` : null;

                return h(
                  "article",
                  {
                    key: r.id || `rv-${idx}`,
                    className: `overflow-hidden rounded-2xl border bg-gradient-to-br to-white shadow-sm transition hover:shadow-md dark:to-night-900/90 ${reviewRatingAccent(rating)}`
                  },
                  h("div", { className: "flex gap-4 p-4 sm:p-5" }, [
                    h(
                      "div",
                      {
                        className:
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-sm font-bold text-white shadow-md shadow-sky-600/20",
                        "aria-hidden": true
                      },
                      reviewBuyerInitial(buyer)
                    ),
                    h("div", { className: "min-w-0 flex-1" }, [
                      h("div", { className: "flex flex-wrap items-start justify-between gap-2" }, [
                        h("div", { className: "min-w-0" }, [
                          h("p", { className: "font-semibold text-slate-900 dark:text-white" }, buyer),
                          h("div", { className: "mt-1 flex flex-wrap items-center gap-2" }, [
                            h(VendorReviewStars, { value: rating, sizeClass: "h-3.5 w-3.5" }),
                            h(
                              "span",
                              {
                                className:
                                  "rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200/80 dark:bg-night-950/60 dark:text-slate-300 dark:ring-white/10"
                              },
                              `${rating}.0`
                            )
                          ])
                        ]),
                        h(
                          "time",
                          {
                            className: "shrink-0 text-[11px] font-medium text-slate-500 dark:text-slate-400",
                            dateTime: r.createdAt ? new Date(r.createdAt).toISOString() : undefined
                          },
                          formatReviewWhen(r.createdAt) || new Date(r.createdAt).toLocaleString()
                        )
                      ]),
                      productTo
                        ? h(
                            Link,
                            {
                              to: productTo,
                              className:
                                "mt-2 inline-flex max-w-full items-center gap-1.5 text-xs font-bold text-sky-700 hover:underline dark:text-sky-300"
                            },
                            [h(Box, { className: "h-3.5 w-3.5 shrink-0", "aria-hidden": true }), h("span", { className: "truncate" }, productName)]
                          )
                        : h("p", { className: "mt-2 text-xs font-semibold text-slate-600 dark:text-slate-400" }, productName),
                      comment
                        ? h(
                            "blockquote",
                            {
                              className:
                                "mt-3 border-l-2 border-sky-400/60 pl-3 text-sm leading-relaxed text-slate-700 dark:border-sky-500/50 dark:text-slate-200"
                            },
                            comment
                          )
                        : h(
                            "p",
                            { className: "mt-3 text-sm italic text-slate-400 dark:text-slate-500" },
                            "Rated without a written comment."
                          )
                    ])
                  ])
                );
              })
            )
  ]);
}
