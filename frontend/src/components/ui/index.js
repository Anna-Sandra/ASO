import React, { useId, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Coffee,
  Info,
  Loader2,
  Moon,
  Sun,
  X
} from "lucide-react";
import { h } from "utils/h";

const base =
  "tap-target inline-flex items-center justify-center gap-2 rounded-2xl font-medium transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 px-4 py-2.5 sm:px-5 sm:py-3 text-sm sm:text-base";

const variants = {
  primary:
    "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-900/30 hover:from-violet-500 hover:to-fuchsia-500 dark:from-violet-600 dark:to-fuchsia-700 dark:hover:from-violet-500 dark:hover:to-fuchsia-600",
  ghost:
    "border border-slate-300/80 bg-white/30 text-slate-800 hover:bg-white/50 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10",
  danger:
    "border border-rose-400/55 bg-rose-500/10 text-rose-900 hover:bg-rose-500/18 dark:border-rose-400/40 dark:bg-rose-500/15 dark:text-rose-200 dark:hover:bg-rose-500/25",
  subtle: "bg-slate-900/5 text-slate-800 hover:bg-slate-900/10 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10"
};

function withKeyNodes(children) {
  if (children == null || children === false) return [];
  if (!Array.isArray(children)) return [children];
  return children
    .map((c, i) => {
      if (c == null || c === false) return null;
      if (React.isValidElement(c)) return c.key != null ? c : React.cloneElement(c, { key: `b${i}` });
      return h("span", { key: `t${i}` }, c);
    })
    .filter(Boolean);
}

export function Button({ variant = "primary", className = "", loading, children, ...rest }) {
  const inner = withKeyNodes(children);
  return h(
    "button",
    {
      type: rest.type || "button",
      ...rest,
      disabled: rest.disabled || loading,
      className: `${base} ${variants[variant] || variants.primary} ${className}`.trim()
    },
    h(
      "span",
      { className: "inline-flex items-center justify-center gap-2" },
      [loading ? h(Loader2, { key: "ld", className: "h-4 w-4 sm:h-5 sm:w-5 animate-spin" }) : null, ...inner].filter(Boolean)
    )
  );
}

export function GlassPanel({ className = "", children, as: Tag = "div", ...rest }) {
  return h(
    Tag,
    {
      ...rest,
      className: `glass rounded-3xl p-4 sm:p-6 ${className}`.trim()
    },
    children
  );
}

export function GlassCard({ className = "", children }) {
  return h("div", { className: `glass-strong rounded-3xl p-4 sm:p-5 ${className}`.trim() }, children);
}

/** Cute bordered notice for form/page errors and success (SweetAlert-style inline). */
export function InlineNotice({ variant = "error", title, children, onDismiss, className = "", size = "md" }) {
  const Icon =
    variant === "success" ? CheckCircle2 : variant === "warning" ? AlertTriangle : variant === "info" ? Info : AlertCircle;
  const palette =
    variant === "success"
      ? "border-emerald-300/50 bg-gradient-to-br from-emerald-50/95 to-white text-emerald-900 dark:border-emerald-500/25 dark:from-emerald-950/50 dark:to-night-900/90 dark:text-emerald-100"
      : variant === "warning"
        ? "border-amber-300/50 bg-gradient-to-br from-amber-50/95 to-white text-amber-950 dark:border-amber-500/25 dark:from-amber-950/40 dark:to-night-900/90 dark:text-amber-100"
        : variant === "info"
          ? "border-sky-300/50 bg-gradient-to-br from-sky-50/95 to-white text-sky-950 dark:border-sky-500/25 dark:from-sky-950/40 dark:to-night-900/90 dark:text-sky-100"
          : "border-rose-300/50 bg-gradient-to-br from-rose-50/95 to-white text-rose-950 dark:border-rose-500/25 dark:from-rose-950/45 dark:to-night-900/90 dark:text-rose-100";
  const iconWrap =
    variant === "success"
      ? "bg-emerald-200/80 text-emerald-800 dark:bg-emerald-800/50 dark:text-emerald-100"
      : variant === "warning"
        ? "bg-amber-200/80 text-amber-900 dark:bg-amber-800/50 dark:text-amber-100"
        : variant === "info"
          ? "bg-sky-200/80 text-sky-900 dark:bg-sky-800/50 dark:text-sky-100"
          : "bg-rose-200/80 text-rose-900 dark:bg-rose-800/50 dark:text-rose-100";
  const pad = size === "sm" ? "p-2.5 pr-8" : "p-4 pr-10";
  const textCls = size === "sm" ? "text-xs leading-snug" : "text-sm leading-relaxed";
  return h(
    "div",
    {
      role: "alert",
      className: `relative rounded-2xl border shadow-md ${palette} ${pad} ${className}`.trim()
    },
    [
      h("div", { key: "row", className: "flex gap-3" }, [
        h(
          "div",
          {
            key: "icw",
            className: `flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconWrap} ${size === "sm" ? "h-7 w-7" : ""}`
          },
          h(Icon, { className: size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4", strokeWidth: 2.25 })
        ),
        h("div", { key: "body", className: "min-w-0 flex-1 pt-0.5" }, [
          title ? h("p", { key: "ti", className: "mb-1 text-xs font-bold uppercase tracking-wide opacity-90" }, title) : null,
          h("div", { key: "msg", className: `${textCls} font-medium` }, children)
        ].filter(Boolean))
      ]),
      onDismiss
        ? h(
            "button",
            {
              key: "dismiss",
              type: "button",
              className:
                "tap-target absolute right-2 top-2 rounded-xl p-1.5 text-current opacity-50 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10",
              "aria-label": "Dismiss",
              onClick: onDismiss
            },
            h(X, { className: "h-4 w-4" })
          )
        : null
    ].filter(Boolean)
  );
}

export function Field({ label, error, children }) {
  const uid = useId().replace(/:/g, "");
  const labelEl =
    label != null && label !== false
      ? h(
          "span",
          {
            key: `lb-${uid}`,
            className:
              "text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-400"
          },
          label
        )
      : null;
  const controlEl = h("span", { key: `ctl-${uid}`, className: "block" }, children);
  const errEl = error
    ? h(InlineNotice, { key: `er-${uid}`, variant: "error", size: "sm", className: "mt-1" }, error)
    : null;
  return h("label", { className: "block space-y-1.5" }, [labelEl, controlEl, errEl].filter(Boolean));
}

export function TextInput(props) {
  const { className = "", ...rest } = props;
  return h("input", {
    ...rest,
    className: `w-full min-h-[44px] rounded-2xl border border-slate-300/70 bg-white/60 px-4 py-2.5 text-slate-900 shadow-inner shadow-slate-900/5 placeholder:text-slate-400 focus:border-sky-400/60 dark:border-white/10 dark:bg-night-900/50 dark:text-slate-100 dark:placeholder:text-slate-500 ${className}`.trim()
  });
}

const otpBoxClass =
  "tap-target w-10 h-11 sm:w-11 sm:h-12 min-w-0 shrink-0 rounded-xl border border-slate-300/70 bg-white/70 text-center text-base font-semibold tabular-nums text-slate-900 shadow-inner shadow-slate-900/5 focus:border-sky-400/70 focus:outline-none focus:ring-2 focus:ring-sky-400/30 dark:border-white/12 dark:bg-night-900/55 dark:text-slate-100 dark:focus:border-sky-400/50 dark:focus:ring-sky-400/20";

/** Six single-digit boxes; paste and arrow keys supported. `value` is up to 6 digits. */
export function OtpCodeInput({ value = "", onChange, disabled, className = "", "aria-invalid": ariaInvalid, autoFocus }) {
  const clean = String(value || "")
    .replace(/\D/g, "")
    .slice(0, 6);
  const refs = useRef([]);

  const commit = (digits) => {
    onChange(String(digits || "").replace(/\D/g, "").slice(0, 6));
  };

  const charsAt = () => {
    const out = [];
    for (let j = 0; j < 6; j++) out[j] = clean[j] || "";
    return out;
  };

  const onChangeBox = (i) => (e) => {
    const raw = e.target.value.replace(/\D/g, "");
    const d = raw.length >= 1 ? raw.slice(-1) : "";
    const chars = charsAt();
    chars[i] = d;
    commit(chars.join(""));
    if (d && i < 5) refs.current[i + 1]?.focus?.();
  };

  const onKeyDown = (i) => (e) => {
    if (e.key === "Backspace") {
      const chars = charsAt();
      if (chars[i]) {
        chars[i] = "";
        commit(chars.join(""));
        e.preventDefault();
      } else if (i > 0) {
        chars[i - 1] = "";
        commit(chars.join(""));
        refs.current[i - 1]?.focus?.();
        e.preventDefault();
      }
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs.current[i - 1]?.focus?.();
      e.preventDefault();
    } else if (e.key === "ArrowRight" && i < 5) {
      refs.current[i + 1]?.focus?.();
      e.preventDefault();
    }
  };

  const onPaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData("text") || "";
    const digits = text.replace(/\D/g, "").slice(0, 6);
    commit(digits);
    const focusIdx = Math.min(Math.max(0, digits.length), 5);
    refs.current[focusIdx]?.focus?.();
  };

  return h(
    "div",
    {
      role: "group",
      "aria-label": "One-time code",
      className: `flex flex-wrap justify-center gap-1.5 sm:gap-2 ${className}`.trim(),
      onPaste
    },
    [0, 1, 2, 3, 4, 5].map((i) =>
      h("input", {
        key: i,
        ref: (el) => {
          refs.current[i] = el;
        },
        type: "text",
        inputMode: "numeric",
        autoComplete: i === 0 ? "one-time-code" : "off",
        maxLength: 1,
        disabled: Boolean(disabled),
        "aria-invalid": ariaInvalid,
        autoFocus: Boolean(autoFocus) && i === 0,
        value: clean[i] || "",
        onChange: onChangeBox(i),
        onKeyDown: onKeyDown(i),
        onFocus: (ev) => ev.target.select(),
        className: otpBoxClass
      })
    )
  );
}

export function TextArea(props) {
  const { className = "", autoMinHeight = true, ...rest } = props;
  const minH = autoMinHeight ? "min-h-[4.5rem]" : "min-h-0";
  return h("textarea", {
    ...rest,
    className: `w-full ${minH} rounded-2xl border border-slate-300/70 bg-white/60 px-4 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-sky-400/60 dark:border-white/10 dark:bg-night-900/50 dark:text-slate-100 ${className}`.trim()
  });
}

export function SelectInput({ children, className = "", ...rest }) {
  return h(
    "select",
    {
      ...rest,
      className: `w-full min-h-[44px] rounded-2xl border border-slate-300/70 bg-white/60 px-4 py-2.5 text-slate-900 dark:border-white/10 dark:bg-night-900/50 dark:text-slate-100 ${className}`.trim()
    },
    children
  );
}

export function Badge({ tone = "neutral", children }) {
  const tones = {
    neutral:
      "border border-slate-300/90 bg-slate-100 text-slate-800 dark:border-transparent dark:bg-slate-500/15 dark:text-slate-200",
    success:
      "border border-emerald-300/80 bg-emerald-50 text-emerald-900 dark:border-transparent dark:bg-emerald-500/15 dark:text-emerald-200",
    warn:
      "border border-amber-300/80 bg-amber-50 text-amber-950 dark:border-transparent dark:bg-amber-500/15 dark:text-amber-200",
    danger:
      "border border-rose-300/80 bg-rose-50 text-rose-900 dark:border-transparent dark:bg-rose-500/15 dark:text-rose-200",
    info:
      "border border-sky-300/80 bg-sky-50 text-sky-950 dark:border-transparent dark:bg-sky-500/15 dark:text-sky-200"
  };
  return h(
    "span",
    {
      className: `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone] || tones.neutral}`
    },
    children
  );
}

export function RefImage({ n = 1, src, alt, className = "" }) {
  const [ok, setOk] = useState(true);
  const fallback = `${process.env.PUBLIC_URL || ""}/images/reference/ref-${String(n).padStart(2, "0")}.png`;
  const imgSrc = src && String(src).trim() ? String(src).trim() : fallback;
  if (!ok) {
    return h(
      "div",
      {
        className: `flex items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/20 to-indigo-600/20 ${className}`.trim()
      },
      h(Coffee, { className: "h-10 w-10 text-sky-300/80" })
    );
  }
  return h("img", {
    src: imgSrc,
    alt,
    className: `object-cover ${className}`.trim(),
    loading: "lazy",
    decoding: "async",
    onError: () => setOk(false)
  });
}

export function ThemeToggleButton({ dark, onToggle }) {
  return h(
    "button",
    {
      type: "button",
      onClick: onToggle,
      "aria-label": "Toggle theme",
      className:
        "tap-target flex items-center justify-center rounded-2xl border border-slate-300/60 bg-white/40 p-2 text-slate-800 shadow-sm backdrop-blur-md hover:bg-white/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10"
    },
    dark ? h(Sun, { className: "h-5 w-5" }) : h(Moon, { className: "h-5 w-5" })
  );
}

export { LogoMark } from "./LogoMark";
