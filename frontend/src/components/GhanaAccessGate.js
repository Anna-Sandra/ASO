import React, { useEffect, useState } from "react";
import { fetchPublicPlatformConfig, getApiBase } from "services/api";
import { h } from "utils/h";

/**
 * Blocks the storefront when the API reports the visitor is outside Ghana.
 */
export function GhanaAccessGate({ children }) {
  const [state, setState] = useState({ loading: true, allowed: true, message: "" });

  useEffect(() => {
    const path = typeof window !== "undefined" ? window.location.pathname : "";
    if (path.startsWith("/admin")) {
      setState({ loading: false, allowed: true, message: "" });
      return undefined;
    }

    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(`${getApiBase()}/api/platform/access-check`, { credentials: "include" });
        const d = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok && d?.error === "region_restricted") {
          setState({
            loading: false,
            allowed: false,
            message: d.message || "SHOPIQGH is only available in Ghana."
          });
          return;
        }
        setState({
          loading: false,
          allowed: d.allowed !== false,
          message: d.allowed === false ? d.message || "SHOPIQGH is only available in Ghana." : ""
        });
      } catch {
        if (cancelled) return;
        const cfg = await fetchPublicPlatformConfig();
        if (cancelled) return;
        setState({
          loading: false,
          allowed: cfg?.region?.allowed !== false,
          message: cfg?.region?.message || ""
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.loading) {
    return h(
      "div",
      { className: "flex min-h-screen items-center justify-center bg-night-950 text-slate-300" },
      "Loading…"
    );
  }

  if (!state.allowed) {
    return h(
      "div",
      { className: "flex min-h-screen items-center justify-center bg-night-950 px-6 py-12 text-center" },
      h("div", { className: "max-w-md space-y-4" }, [
        h("h1", { className: "font-display text-2xl font-bold text-white" }, "Available in Ghana only"),
        h("p", { className: "text-sm leading-relaxed text-slate-400" }, state.message),
        h(
          "p",
          { className: "text-xs text-slate-500" },
          "If you are in Ghana, disable VPN, allow location permission, and refresh — or try mobile data."
        )
      ])
    );
  }

  return children;
}
