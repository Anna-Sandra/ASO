import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Info, Sparkles, X } from "lucide-react";
import { h } from "utils/h";
import { sanitizeErrorMessage } from "utils/userFacingError";
import { swalConfirm, swalError, swalErrorToast, swalInfo, swalSuccess, swalWarning } from "utils/swal";

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
  return h(Info, { className: "h-8 w-8 text-sky-500 dark:text-sky-300" });
}

export function NoticeProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const alertFn = useCallback((message, opts = {}) => {
    const variant = opts.variant || "info";
    const title = opts.title != null ? String(opts.title) : "";
    const text = prepareUserMessage(message, variant);
    const okLabel = opts.okLabel || "Got it";

    if (variant === "error") {
      return swalError(text, { title: title || undefined, okLabel });
    }
    if (variant === "warning") {
      return swalWarning(text, { title: title || undefined, okLabel });
    }
    if (variant === "success") {
      return swalSuccess(text, { title: title || "Done", okLabel });
    }
    return swalInfo(text, { title: title || "Notice", okLabel });
  }, []);

  const confirmFn = useCallback((message, opts = {}) => {
    const title = opts.title != null ? String(opts.title) : "Just checking";
    return swalConfirm(prepareUserMessage(message, "warning"), {
      title,
      confirmLabel: opts.confirmLabel || "OK",
      cancelLabel: opts.cancelLabel || "Cancel"
    });
  }, []);

  const toastFn = useCallback((message, opts = {}) => {
    const variant = opts.variant || "info";
    const text = prepareUserMessage(message, variant);

    if (variant === "error") {
      void swalErrorToast(text);
      return;
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const duration = typeof opts.duration === "number" ? opts.duration : 4200;
    setToasts((prev) => [...prev, { id, variant, message: text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const value = useMemo(() => ({ alert: alertFn, confirm: confirmFn, toast: toastFn }), [alertFn, confirmFn, toastFn]);

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

  return h(NoticeContext.Provider, { value }, [children, toastPortal || null]);
}

export function useNotice() {
  return useContext(NoticeContext);
}
