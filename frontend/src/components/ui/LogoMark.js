import React, { useId } from "react";
import { h } from "utils/h";

/**
 * SHOPIQGH mark — boutique bag monogram on a deep slate tile with gold accent.
 * Scales via `className` (e.g. `h-9 w-9`).
 */
export function LogoMark({ className = "" }) {
  const gradId = `sq-mark-${useId().replace(/:/g, "")}`;

  return h(
    "div",
    {
      className: [
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl",
        "bg-gradient-to-br from-slate-950 via-slate-800 to-slate-900",
        "shadow-lg shadow-slate-900/25 ring-1 ring-amber-200/35",
        "dark:shadow-black/40 dark:ring-amber-300/30",
        className
      ]
        .filter(Boolean)
        .join(" "),
      role: "img",
      "aria-label": "SHOPIQGH"
    },
    [
      h("div", {
        key: "sheen",
        className:
          "pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_0%,rgba(255,255,255,0.14),transparent_55%)]"
      }),
      h("div", {
        key: "warm",
        className: "pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500/8 via-transparent to-sky-500/5"
      }),
      h(
        "svg",
        {
          key: "svg",
          viewBox: "0 0 32 32",
          className: "relative h-[58%] w-[58%]",
          fill: "none",
          xmlns: "http://www.w3.org/2000/svg",
          "aria-hidden": true
        },
        [
          h("defs", { key: "defs" }, [
            h(
              "linearGradient",
              { id: gradId, x1: "8", y1: "6", x2: "24", y2: "26", gradientUnits: "userSpaceOnUse" },
              [
                h("stop", { key: "g0", offset: "0%", stopColor: "#FAF0DC" }),
                h("stop", { key: "g45", offset: "45%", stopColor: "#D4AF37" }),
                h("stop", { key: "g100", offset: "100%", stopColor: "#9A7B2F" })
              ]
            )
          ]),
          h("path", {
            key: "bag",
            d: "M10.5 13.5h11l-1.35 11.2a3.8 3.8 0 0 1-8.3 0L10.5 13.5Z",
            stroke: `url(#${gradId})`,
            strokeWidth: 1.55,
            strokeLinejoin: "round",
            fill: `url(#${gradId})`,
            fillOpacity: 0.1
          }),
          h("path", {
            key: "handle",
            d: "M13.2 13.5V11.4c0-1.65 2.8-2.55 5.6-1.35.95.42 1.5 1.15 1.5 2.1v1.35",
            stroke: `url(#${gradId})`,
            strokeWidth: 1.55,
            strokeLinecap: "round",
            fill: "none"
          }),
          h("path", {
            key: "s",
            d: "M14.2 17.2c0-1.1 1.45-1.65 2.9-1.2 1 .32 1.5.95 1.5 1.75 0 1.35-1.85 1.75-2.95 2.45-1 .65-1.15 1.35-.55 1.95",
            stroke: `url(#${gradId})`,
            strokeWidth: 1.35,
            strokeLinecap: "round",
            fill: "none"
          }),
          h("circle", {
            key: "gem",
            cx: "22.5",
            cy: "9.5",
            r: "1.1",
            fill: `url(#${gradId})`,
            opacity: 0.95
          })
        ]
      )
    ]
  );
}
