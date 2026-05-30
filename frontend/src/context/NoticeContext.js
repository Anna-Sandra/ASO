import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, AlertTriangle, Info, Sparkles, X } from "lucide-react";
import { h } from "utils/h";
import { Button } from "components/ui";
import { sanitizeErrorMessage } from "utils/userFacingError";

function prepareUserMessage(message, variant) {
  const m = String(message ?? "").trim();
  if (!m) return "";
  if (variant === "success") return m;
  return sanitizeErrorMessage(m, m);
}

const NoticeContext = createContext({
  alert: async () => {},
  confirm: async () => false,
  toast: () => {}
});

function variantIcon(variant) {
  if (variant === "success") return h(Sparkles, { className: "h-8 w-8 text-emerald-500 dark:text-emerald-300" });
  if (variant === "warning") return h(AlertTriangle, { className: "h-8 w-8 text-amber-500 dark:text-amber-300" });
  if (variant === "error") return h(AlertCircle, { className: "h-8 w-8 text-rose-500 dark:text-rose-300" });
  return h(Info, { className: "h-8 w-8 text-sky-500 dark:text-sky-300" });
}

function variantAccent(variant) {
  if (variant === "success") return "from-emerald-400/30 via-white to-teal-50/80 dark:from-emerald-900/50 dark:via-night-900 dark:to-emerald-950/40";
  if (variant === "warning") return "from-amber-400/25 via-white to-orange-50/80 dark:from-amber-900/40 dark:via-night-900 dark:to-amber-950/30";
  if (variant === "error") return "from-rose-400/25 via-white to-rose-50/90 dark:from-rose-900/45 dark:via-night-900 dark:to-rose-950/35";
  return "from-sky-400/25 via-white to-sky-50/80 dark:from-sky-900/40 dark:via-night-900 dark:to-sky-950/35";
}

function variantIconWrap(variant) {
  const ring =
    variant === "success"
      ? "bg-emerald-100/90 ring-4 ring-emerald-200/60 dark:bg-emerald-900/50 dark:ring-emerald-500/20"
      : variant === "warning"
        ? "bg-amber-100/90 ring-4 ring-amber-200/60 dark:bg-amber-900/50 dark:ring-amber-500/20"
        : variant === "error"
          ? "bg-rose-100/90 ring-4 ring-rose-200/70 dark:bg-rose-900/50 dark:ring-rose-500/20"
          : "bg-sky-100/90 ring-4 ring-sky-200/60 dark:bg-sky-900/50 dark:ring-sky-500/20";
  return h("div", { className: `mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl shadow-inner ${ring}` }, variantIcon(variant));
}

export function NoticeProvider({ children }) {
  const [modal, setModal] = useState(null);
  const [toasts, setToasts] = useState([]);

  const alertFn = useCallback((message, opts = {}) => {
    const variant = opts.variant || "info";
    const title = opts.title != null ? String(opts.title) : "";
    const okLabel = opts.okLabel || "Got it";
    return new Promise((resolve) => {
      setModal({
        kind: "alert",
        variant,
        title,
        message: prepareUserMessage(message, variant),
        okLabel,
        resolve: () => {
          resolve();
          setModal(null);
        }
      });
    });
  }, []);

  const confirmFn = useCallback((message, opts = {}) => {
    const title = opts.title != null ? String(opts.title) : "Just checking";
    const confirmLabel = opts.confirmLabel || "OK";
    const cancelLabel = opts.cancelLabel || "Cancel";
    return new Promise((resolve) => {
      setModal({
        kind: "confirm",
        variant: "warning",
        title,
        message: prepareUserMessage(message, "warning"),
        confirmLabel,
        cancelLabel,
        resolve: (ok) => {
          resolve(Boolean(ok));
          setModal(null);
        }
      });
    });
  }, []);

  const toastFn = useCallback((message, opts = {}) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const variant = opts.variant || "info";
    const duration = typeof opts.duration === "number" ? opts.duration : 4200;
    setToasts((prev) => [...prev, { id, variant, message: prepareUserMessage(message, variant) }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const value = useMemo(() => ({ alert: alertFn, confirm: confirmFn, toast: toastFn }), [alertFn, confirmFn, toastFn]);

  const modalNode =
    modal &&
    createPortal(
      h(
        "div",
        {
          className:
            "animate-fade-in-backdrop fixed inset-0 z-[500] flex items-center justify-center bg-slate-950/45 px-4 py-10 backdrop-blur-md",
          role: "presentation",
          onClick: (e) => {
            if (e.target === e.currentTarget && modal.kind === "alert") modal.resolve();
          }
        },
        h(
          "div",
          {
            className: "animate-notice-pop relative w-full max-w-md",
            role: "dialog",
            "aria-modal": true,
            "aria-labelledby": modal.title ? "notice-title" : undefined,
            "aria-describedby": "notice-msg",
            onClick: (e) => e.stopPropagation()
          },
          h(
            "div",
            {
              className: `relative overflow-hidden rounded-[1.75rem] border border-white/30 bg-gradient-to-br shadow-2xl shadow-sky-900/15 dark:shadow-black/40 ${variantAccent(modal.variant)}`
            },
            [
              h("div", {
                key: "deco",
                className:
                  "pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-white/60 to-transparent opacity-70 dark:from-white/10"
              }),
              h(
                "div",
                { key: "inner", className: "relative px-6 pb-6 pt-8 text-center sm:px-8 sm:pb-8" },
                [
                  variantIconWrap(modal.variant),
                  modal.title
                    ? h(
                        "h2",
                        {
                          id: "notice-title",
                          key: "ti",
                          className: "font-display text-lg font-bold text-slate-900 dark:text-white sm:text-xl"
                        },
                        modal.title
                      )
                    : null,
                  h(
                    "p",
                    {
                      id: "notice-msg",
                      key: "msg",
                      className: `text-sm leading-relaxed text-slate-700 dark:text-slate-200 ${modal.title ? "mt-2" : "mt-0 text-base"}`
                    },
                    modal.message
                  ),
                  modal.kind === "confirm"
                    ? h("div", { key: "btns", className: "mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-center" }, [
                        h(
                          Button,
                          {
                            key: "no",
                            variant: "ghost",
                            className: "w-full sm:w-auto sm:min-w-[120px]",
                            type: "button",
                            onClick: () => modal.resolve(false)
                          },
                          modal.cancelLabel
                        ),
                        h(
                          Button,
                          {
                            key: "yes",
                            variant: "primary",
                            className: "w-full sm:w-auto sm:min-w-[120px]",
                            type: "button",
                            onClick: () => modal.resolve(true)
                          },
                          modal.confirmLabel
                        )
                      ])
                    : h("div", { key: "ok", className: "mt-8 flex justify-center" }, [
                        h(
                          Button,
                          {
                            variant: "primary",
                            className: "!rounded-full !px-10",
                            type: "button",
                            onClick: () => modal.resolve()
                          },
                          modal.okLabel
                        )
                      ])
                ].filter(Boolean)
              )
            ]
          )
        )
      ),
      document.body
    );

  const toastPortal =
    toasts.length > 0 &&
    createPortal(
      h(
        "div",
        {
          className:
            "pointer-events-none fixed left-1/2 top-4 z-[490] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-3 sm:top-6"
        },
        toasts.map((t) =>
          h(
            "div",
            {
              key: t.id,
              className:
                "pointer-events-auto animate-notice-pop flex items-start gap-3 rounded-2xl border border-white/30 bg-white/95 px-4 py-3 shadow-xl backdrop-blur-xl dark:border-white/15 dark:bg-night-900/95"
            },
            [
              h("div", { key: "ic", className: "mt-0.5 shrink-0" }, variantIcon(t.variant)),
              h("p", { key: "tx", className: "min-w-0 flex-1 text-sm font-medium text-slate-800 dark:text-slate-100" }, t.message),
              h(
                "button",
                {
                  key: "x",
                  type: "button",
                  className: "tap-target shrink-0 rounded-xl p-1 text-slate-400 hover:bg-white/20 hover:text-slate-700 dark:hover:text-white",
                  "aria-label": "Dismiss",
                  onClick: () => setToasts((prev) => prev.filter((x) => x.id !== t.id))
                },
                h(X, { className: "h-4 w-4" })
              )
            ]
          )
        )
      ),
      document.body
    );

  return h(NoticeContext.Provider, { value }, [children, modalNode || null, toastPortal || null]);
}

export function useNotice() {
  return useContext(NoticeContext);
}
