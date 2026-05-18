import React from "react";
import { apiFetch } from "services/api";
import { formatGhc } from "utils/money";
import { h } from "utils/h";

/**
 * @param {string | null | undefined} accessToken
 * @param {{ type: string, productId?: string, meta?: Record<string, unknown> }} payload
 */
export function trackVendorAnalyticsEvent(accessToken, payload) {
  if (!accessToken || !payload?.type) return;
  void apiFetch("/api/vendor/analytics/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    json: payload
  }).catch(() => {});
}

/** @param {{ x: number, y: number }[]} pts */
function smoothAreaPath(pts, baselineY) {
  if (pts.length === 0) return "";
  if (pts.length === 1) {
    const p = pts[0];
    return `M ${p.x} ${baselineY} L ${p.x} ${p.y} L ${p.x} ${baselineY} Z`;
  }
  let top = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const cx = (p0.x + p1.x) / 2;
    const cy = (p0.y + p1.y) / 2;
    top += ` Q ${p0.x} ${p0.y} ${cx} ${cy}`;
  }
  const last = pts[pts.length - 1];
  top += ` L ${last.x} ${last.y}`;
  return `${top} L ${last.x} ${baselineY} L ${pts[0].x} ${baselineY} Z`;
}

function smoothLinePath(pts) {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const cx = (p0.x + p1.x) / 2;
    const cy = (p0.y + p1.y) / 2;
    d += ` Q ${p0.x} ${p0.y} ${cx} ${cy}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function hexPoints(cx, cy, r) {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    out.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
  }
  return out.join(" ");
}

/**
 * Aurora ribbon: smooth area, glow, mirrored reflection, hex markers — not a stock line chart.
 * @param {{ daily: Array<{ date: string; revenue: number }> }} props
 */
export function VendorRevenueLineChart({ daily }) {
  const w = 560;
  const svgH = 200;
  const padX = 32;
  const padB = 28;
  const padT = 20;
  const innerW = w - padX * 2;
  const baselineY = svgH - padB;
  const innerH = baselineY - padT;
  const vals = (daily || []).map((d) => Number(d.revenue) || 0);
  const max = Math.max(...vals, 1);
  const n = Math.max((daily || []).length, 1);
  const step = n > 1 ? innerW / (n - 1) : 0;
  const pts = (daily || []).map((d, i) => ({
    x: padX + i * step,
    y: padT + innerH * (1 - (Number(d.revenue) || 0) / max)
  }));
  const areaD = smoothAreaPath(pts, baselineY);
  const lineD = smoothLinePath(pts);
  const reflectTransform = `translate(0, ${baselineY * 2}) scale(1,-1)`;
  const tickStep = Math.max(1, Math.ceil(n / 6));

  return h("div", { className: "relative w-full overflow-hidden rounded-2xl" }, [
    h("div", {
      key: "cosmic-bg",
      className:
        "pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(56,189,248,0.25),transparent_50%),radial-gradient(ellipse_at_80%_100%,rgba(129,140,248,0.2),transparent_45%),linear-gradient(165deg,rgb(15_23_42)_0%,rgb(2_6_23)_55%,rgb(15_23_42)_100%)] dark:opacity-100"
    }),
    h("div", {
      key: "mesh",
      className:
        "pointer-events-none absolute inset-0 opacity-[0.12] dark:opacity-[0.18] [background-image:linear-gradient(rgba(148,163,184,0.4)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.35)_1px,transparent_1px)] [background-size:14px_14px]"
    }),
    h(
      "svg",
      {
        key: "svg",
        viewBox: `0 0 ${w} ${svgH}`,
        className: "relative z-[1] h-44 w-full max-w-full",
        role: "img",
        "aria-label": "Revenue ribbon by day",
        preserveAspectRatio: "xMidYMid meet"
      },
      [
        h("defs", { key: "defs" }, [
          h(
            "linearGradient",
            { key: "fillGrad", id: "auroraFill", x1: "0%", y1: "0%", x2: "0%", y2: "100%" },
            [
              h("stop", { offset: "0%", stopColor: "rgb(34 211 238)", stopOpacity: 0.55 }),
              h("stop", { offset: "55%", stopColor: "rgb(56 189 248)", stopOpacity: 0.2 }),
              h("stop", { offset: "100%", stopColor: "rgb(99 102 241)", stopOpacity: 0 })
            ]
          ),
          h(
            "linearGradient",
            { key: "strokeGrad", id: "auroraStroke", x1: "0%", y1: "0%", x2: "100%", y2: "0%" },
            [
              h("stop", { offset: "0%", stopColor: "rgb(125 211 252)" }),
              h("stop", { offset: "50%", stopColor: "rgb(56 189 248)" }),
              h("stop", { offset: "100%", stopColor: "rgb(165 180 252)" })
            ]
          ),
          h(
            "filter",
            { key: "glow", id: "ribbonGlow", x: "-25%", y: "-25%", width: "150%", height: "150%" },
            [
              h("feGaussianBlur", { key: "b", stdDeviation: "3", result: "ribbonBlur" }),
              h(
                "feMerge",
                { key: "m" },
                [
                  h("feMergeNode", { key: "m1", in: "ribbonBlur" }),
                  h("feMergeNode", { key: "m2", in: "SourceGraphic" })
                ]
              )
            ]
          )
        ]),
        h("line", {
          key: "base",
          x1: padX,
          x2: w - padX,
          y1: baselineY,
          y2: baselineY,
          stroke: "rgba(148,163,184,0.25)",
          strokeWidth: 1
        }),
        h("g", { key: "reflect", transform: reflectTransform, opacity: 0.14 }, [
          h("path", {
            d: areaD,
            fill: "url(#auroraFill)",
            stroke: "none"
          })
        ]),
        h("path", {
          key: "area",
          d: areaD,
          fill: "url(#auroraFill)",
          stroke: "none"
        }),
        h("path", {
          key: "lineGlow",
          d: lineD,
          fill: "none",
          stroke: "rgb(56 189 248)",
          strokeWidth: 5,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          opacity: 0.35,
          filter: "url(#ribbonGlow)"
        }),
        h("path", {
          key: "line",
          d: lineD,
          fill: "none",
          stroke: "url(#auroraStroke)",
          strokeWidth: 2.2,
          strokeLinecap: "round",
          strokeLinejoin: "round"
        }),
        ...(daily || []).map((d, i) => {
          const p = pts[i];
          if (!p) return null;
          return h(
            "g",
            { key: `n-${d.date}` },
            [
              h("title", { key: "tt" }, `${d.date}: ${formatGhc(Number(d.revenue) || 0)}`),
              h("polygon", {
                key: "hex",
                points: hexPoints(p.x, p.y, 5),
                fill: "rgb(15 23 42)",
                stroke: "rgb(186 230 253)",
                strokeWidth: 1.2,
                opacity: 0.95
              }),
              (i % tickStep === 0 || i === n - 1) &&
                h(
                  "text",
                  {
                    key: "lb",
                    x: p.x,
                    y: svgH - 6,
                    fontSize: 9,
                    fill: "rgb(148 163 184)",
                    textAnchor: "middle",
                    className: "font-mono"
                  },
                  d.date.slice(5)
                )
            ].filter(Boolean)
          );
        })
      ]
    ),
    h(
      "p",
      {
        key: "cap",
        className:
          "relative z-[1] px-3 pb-2 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-sky-200/80 dark:text-sky-300/90"
      },
      "Revenue stream · UTC"
    )
  ]);
}

/**
 * Histogram of daily order volume (same window as the ribbon) — trend in sales *activity*, not by product.
 * @param {{ daily: Array<{ date: string; orderCount: number }> }} props
 */
export function VendorSalesHistogram({ daily }) {
  const days = daily || [];
  if (days.length === 0) {
    return h("p", { className: "py-8 text-center text-sm text-slate-500 dark:text-slate-400" }, "No sales activity in this period yet.");
  }

  const w = 560;
  const svgH = 200;
  const padL = 36;
  const padR = 12;
  const padB = 32;
  const padT = 16;
  const innerW = w - padL - padR;
  const innerH = svgH - padB - padT;
  const baselineY = padT + innerH;

  const counts = days.map((d) => Math.max(0, Number(d.orderCount) || 0));
  const maxC = Math.max(...counts, 1);
  const n = days.length;
  const gap = Math.max(0.5, innerW * 0.02 / Math.max(n, 1));
  const barW = Math.max(2, (innerW - gap * (n - 1)) / n);

  const yTicks = [0, 0.5, 1].map((t) => ({
    y: baselineY - t * innerH,
    lab: t === 0 ? "0" : t === 0.5 ? String(Math.ceil(maxC / 2)) : String(maxC)
  }));

  return h("div", { className: "relative w-full overflow-hidden rounded-2xl" }, [
    h("div", {
      key: "bg",
      className:
        "pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-900/40 via-slate-950/60 to-slate-900/80 dark:from-night-950/50 dark:via-night-950/70 dark:to-night-950"
    }),
    h(
      "svg",
      {
        key: "svg",
        viewBox: `0 0 ${w} ${svgH}`,
        className: "relative z-[1] h-48 w-full max-w-full",
        role: "img",
        "aria-label": "Daily order count histogram",
        preserveAspectRatio: "xMidYMid meet"
      },
      [
        h("defs", { key: "defs" }, [
          h(
            "linearGradient",
            { key: "barGrad", id: "histBar", x1: "0%", y1: "100%", x2: "0%", y2: "0%" },
            [
              h("stop", { offset: "0%", stopColor: "rgb(30 58 138)", stopOpacity: 0.95 }),
              h("stop", { offset: "100%", stopColor: "rgb(56 189 248)", stopOpacity: 0.9 })
            ]
          )
        ]),
        ...yTicks.map((tk, i) =>
          h("g", { key: `grid-${i}` }, [
            h("line", {
              x1: padL,
              x2: w - padR,
              y1: tk.y,
              y2: tk.y,
              stroke: "rgba(148,163,184,0.12)",
              strokeWidth: 1
            }),
            h(
              "text",
              {
                x: padL - 6,
                y: tk.y + 4,
                fontSize: 9,
                fill: "rgb(148 163 184)",
                textAnchor: "end",
                className: "font-mono"
              },
              tk.lab
            )
          ])
        ),
        h("line", {
          key: "axis",
          x1: padL,
          x2: w - padR,
          y1: baselineY,
          y2: baselineY,
          stroke: "rgba(148,163,184,0.35)",
          strokeWidth: 1
        }),
        ...days.map((d, i) => {
          const c = counts[i];
          const bh = (c / maxC) * innerH;
          const x = padL + i * (barW + gap);
          const y = baselineY - bh;
          const tickStep = Math.max(1, Math.ceil(n / 8));
          return h(
            "g",
            { key: `b-${d.date}` },
            [
              h("title", { key: "tt" }, `${d.date}: ${c} order${c === 1 ? "" : "s"}`),
              h("rect", {
                key: "r",
                x,
                y,
                width: barW,
                height: Math.max(bh, c > 0 ? 1.5 : 0),
                rx: 2,
                fill: "url(#histBar)",
                stroke: "rgba(125,211,252,0.25)",
                strokeWidth: 0.5
              }),
              (i % tickStep === 0 || i === n - 1) &&
                h(
                  "text",
                  {
                    key: "xl",
                    x: x + barW / 2,
                    y: svgH - 6,
                    fontSize: 8,
                    fill: "rgb(148 163 184)",
                    textAnchor: "middle",
                    className: "font-mono"
                  },
                  d.date.slice(5)
                )
            ].filter(Boolean)
          );
        })
      ]
    ),
    h(
      "p",
      {
        key: "cap",
        className:
          "relative z-[1] px-3 pb-2 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500"
      },
      "Bins = calendar days · bar height = paid-line orders that day"
    )
  ]);
}
