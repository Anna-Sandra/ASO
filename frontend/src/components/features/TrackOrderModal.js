import React, { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useAuth } from "context";
import { apiFetch , apiErrorMessage} from "services/api";
import { DeliveryLive } from "components/features/DeliveryLive";
import { h } from "utils/h";
import { Button, Field, TextInput } from "components/ui";

function normalizeLookup(s) {
  return String(s || "")
    .trim()
    .replace(/^#/, "")
    .replace(/\s+/g, "");
}

function normalizeDigits(s) {
  return String(s || "").replace(/\D/g, "");
}

/**
 * @param {string} raw
 * @param {Array<{ id: string }>} orders
 * @param {string} [userPhone]
 */
export function resolveBuyerOrderRef(raw, orders, userPhone) {
  const q0 = String(raw || "").trim();
  if (!q0) return { error: "Enter your order reference or the phone number on your account." };

  const digits = normalizeDigits(q0);
  const looksLikePhone =
    digits.length >= 9 && digits.length <= 15 && /^[\d\s+().-]+$/.test(q0.trim()) && !/^[a-f\d]{8,24}$/i.test(q0.trim());

  if (looksLikePhone) {
    const acc = normalizeDigits(userPhone || "");
    if (!acc) {
      return {
        error:
          "Your account has no phone number on file. Track with the order reference (from your receipt or orders list) instead."
      };
    }
    if (digits !== acc) {
      return { error: "That number doesn’t match the phone on your SHOPIQGH account." };
    }
    const paidLike = (s) => ["paid", "processing", "sent_for_delivery", "delivered"].includes(s);
    const latest = [...(orders || [])]
      .filter((o) => paidLike(o.status) && o.fulfillmentMode !== "onsite")
      .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))[0];
    if (!latest) {
      return { error: "No paid orders found to track on this account yet." };
    }
    return { orderId: latest.id };
  }

  const q = normalizeLookup(q0);
  if (!q) return { error: "Enter your order reference or the phone number on your account." };

  const byExact = (orders || []).find((o) => o.id === q);
  if (byExact) return { orderId: byExact.id };

  const ql = q.toLowerCase();
  const ends = (orders || []).filter((o) => o.id.toLowerCase().endsWith(ql));
  if (ends.length === 1) return { orderId: ends[0].id };
  if (ends.length > 1) {
    return {
      error:
        "Several orders match that reference. Paste the full order ID from your receipt (24 characters), or open Track from a specific order card."
    };
  }

  if (/^[a-f\d]{24}$/i.test(q)) return { fetchId: q };

  return {
    error:
      "Order not found. Copy the order ID from My orders (e.g. #… or the full id) or paste the code from your email receipt."
  };
}

/** @typedef {{ open: boolean; onClose: () => void; orders: Array<{ id: string }>; initialOrderId?: string | null; guestSecret?: string | null }} Props */

/** @param {Props} props */
export function TrackOrderModal({ open, onClose, orders = [], initialOrderId = null, guestSecret = null }) {
  const { accessToken, user } = useAuth();
  const [step, setStep] = useState("lookup"); // lookup | live
  const [query, setQuery] = useState("");
  const [lookupErr, setLookupErr] = useState("");
  const [checking, setChecking] = useState(false);
  const [trackedOrderId, setTrackedOrderId] = useState("");
  /** @type {string | undefined} */
  const userPhone = user?.phone;
  const guestKey = String(guestSecret || "").trim();
  const canTrackWithoutLogin = Boolean(guestKey && initialOrderId);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    if (initialOrderId) {
      setStep("live");
      setTrackedOrderId(String(initialOrderId));
      setLookupErr("");
      setQuery("");
    } else {
      setStep("lookup");
      setTrackedOrderId("");
      setLookupErr("");
      setQuery("");
    }
  }, [open, initialOrderId]);

  const subtitle = useMemo(() => {
    if (step !== "live" || !trackedOrderId) return "";
    const short = `#${trackedOrderId.slice(-8).toUpperCase()}`;
    return short;
  }, [step, trackedOrderId]);

  const runLookup = async () => {
    setLookupErr("");
    if (!accessToken) {
      setLookupErr(canTrackWithoutLogin ? "Use Track order from your payment receipt." : "Sign in to track an order.");
      return;
    }
    const resolved = resolveBuyerOrderRef(query, orders, userPhone);
    if (resolved.error && !resolved.fetchId) {
      setLookupErr(resolved.error);
      return;
    }
    if (resolved.orderId) {
      setTrackedOrderId(resolved.orderId);
      setStep("live");
      return;
    }
    setChecking(true);
    try {
      const id = resolved.fetchId;
      await apiFetch(`/api/orders/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setTrackedOrderId(id);
      setStep("live");
    } catch (ex) {
      setLookupErr(typeof ex?.message === "string" ? ex.message : "Could not load that order.");
    } finally {
      setChecking(false);
    }
  };

  if (!open) return null;

  const titleId = "track-order-modal-title";
  const panelMax = step === "live" ? "max-w-lg" : "max-w-md";

  return h(
    "div",
    {
      className: "fixed inset-0 z-[60] flex items-end justify-center sm:items-center",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": titleId
    },
    [
      h("button", {
        key: "backdrop",
        type: "button",
        className: "animate-fade-in-backdrop absolute inset-0 bg-black/55 backdrop-blur-[3px]",
        onClick: onClose,
        "aria-label": "Close dialog"
      }),
      h(
        "div",
        {
          key: "panel",
          className: `animate-notice-pop relative z-10 flex max-h-[min(94vh,720px)] w-full ${panelMax} flex-col rounded-t-3xl border border-white/15 bg-white shadow-2xl dark:border-white/10 dark:bg-night-900 sm:m-4 sm:max-h-[min(92vh,720px)] sm:rounded-3xl`
        },
        [
          h("div", { key: "head", className: "flex shrink-0 items-center justify-between gap-3 border-b border-slate-200/90 px-5 py-4 dark:border-white/10" }, [
            h(
              "h2",
              {
                id: titleId,
                className:
                  "min-w-0 flex-1 font-display text-xl font-bold italic tracking-tight text-slate-900 dark:text-white sm:text-[1.35rem]"
              },
              step === "live" ? "Track order" : "Track Order"
            ),
            h(
              "button",
              {
                type: "button",
                className:
                  "tap-target rounded-xl border border-slate-200/95 p-2 text-slate-600 transition hover:bg-slate-100 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/10",
                onClick: onClose,
                "aria-label": "Close"
              },
              h(X, { className: "h-5 w-5" })
            )
          ]),
          subtitle
            ? h(
                "p",
                { key: "sub", className: "shrink-0 border-b border-slate-100 px-5 py-2.5 font-mono text-xs text-violet-600 dark:border-white/5 dark:text-violet-300" },
                subtitle
              )
            : null,
          step === "lookup"
            ? h(
                "form",
                {
                  key: "body-lookup",
                  className: "min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4",
                  onSubmit: (e) => {
                    e.preventDefault();
                    void runLookup();
                  }
                },
                [
                  h(
                    "div",
                    {
                      key: "callout",
                      className:
                        "rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-100/90 to-purple-50/95 px-4 py-3.5 dark:border-violet-500/20 dark:from-violet-950/50 dark:to-night-950/40"
                    },
                    [
                      h(
                        "p",
                        { className: "text-sm leading-relaxed text-slate-700 dark:text-slate-200/95" },
                        "Enter your order reference ID (shown on receipts and in My orders) or the recipient phone number on your account to open live delivery tracking."
                      )
                    ]
                  ),
                  h(
                    Field,
                    {
                      key: "f",
                      label: h("span", { className: "text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" }, "Order ID / Phone number"),
                      className: "mt-6"
                    },
                    h(TextInput, {
                      value: query,
                      onChange: (e) => setQuery(e.target.value),
                      placeholder: "e.g. last 8 characters or paste full order id…",
                      className: "!rounded-xl !border-slate-200/95 !bg-slate-50 dark:!border-white/10 dark:!bg-white/5"
                    })
                  ),
                  lookupErr
                    ? h(
                        "p",
                        {
                          key: "err",
                          className:
                            "mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-400/35 dark:bg-rose-950/40 dark:text-rose-200"
                        },
                        lookupErr
                      )
                    : null,
                  h("div", { key: "act", className: "mt-6" }, [
                    h(
                      Button,
                      {
                        type: "submit",
                        variant: "primary",
                        loading: checking,
                        className:
                          "w-full !rounded-full !py-3 !text-[15px] !font-semibold shadow-lg shadow-sky-500/25 hover:shadow-sky-500/35"
                      },
                      "Check status"
                    )
                  ])
                ]
              )
            : h(
                "div",
                { key: "body-live", className: "min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2 sm:px-4 sm:pb-5 sm:pt-3" },
                [
                  h(DeliveryLive, {
                    mode: "buyer",
                    accessToken: accessToken || "",
                    guestSecret: !accessToken && guestKey ? guestKey : undefined,
                    orderId: trackedOrderId,
                    variant: "trackModal"
                  }),
                  initialOrderId
                    ? null
                    : h("div", { key: "back", className: "mt-4 flex justify-center" }, [
                        h(
                          "button",
                          {
                            type: "button",
                            className: "text-sm font-medium text-sky-600 underline-offset-2 hover:underline dark:text-sky-400",
                            onClick: () => {
                              setStep("lookup");
                              setTrackedOrderId("");
                              setQuery("");
                              setLookupErr("");
                            }
                          },
                          "Track a different order"
                        )
                      ])
                ]
              )
        ].filter(Boolean)
      )
    ]
  );
}
