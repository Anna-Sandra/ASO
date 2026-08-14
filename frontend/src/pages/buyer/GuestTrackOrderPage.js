import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Navigation } from "lucide-react";
import { useAuth } from "context";
import { TrackOrderModal } from "components/features/TrackOrderModal";
import { Button, Field, GlassPanel, InlineNotice, TextInput } from "components/ui";
import { setGuestOrderSecret, getGuestOrderSecret } from "utils/guestOrderSecret";
import { apiFetch, apiErrorMessage } from "services/api";
import { h, f } from "utils/h";

/**
 * /track — guest lookup (order id + email)
 * /track/:orderId?t=<guestAccessSecret> — magic link from payment email
 * /track/:orderId — signed-in buyer
 */
export function GuestTrackOrderPage() {
  const { orderId: orderIdParam } = useParams();
  const [searchParams] = useSearchParams();
  const nav = useNavigate();
  const { accessToken, loading } = useAuth();

  const orderIdFromRoute = String(orderIdParam || "").trim();
  const tokenFromUrl = String(searchParams.get("t") || searchParams.get("secret") || "").trim();

  const [orderId, setOrderId] = useState(orderIdFromRoute);
  const [email, setEmail] = useState("");
  const [guestSecret, setGuestSecret] = useState(() =>
    tokenFromUrl || (orderIdFromRoute ? getGuestOrderSecret(orderIdFromRoute) : "")
  );
  const [trackOpen, setTrackOpen] = useState(false);
  const [err, setErr] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (orderIdFromRoute) setOrderId(orderIdFromRoute);
  }, [orderIdFromRoute]);

  useEffect(() => {
    if (!orderIdFromRoute) return;
    if (tokenFromUrl) {
      setGuestOrderSecret(orderIdFromRoute, tokenFromUrl);
      setGuestSecret(tokenFromUrl);
    }
  }, [orderIdFromRoute, tokenFromUrl]);

  useEffect(() => {
    if (loading) return;
    const id = orderIdFromRoute;
    if (!id) return;
    const secret = tokenFromUrl || guestSecret || getGuestOrderSecret(id);
    if (accessToken || secret) {
      setErr("");
      setTrackOpen(true);
    }
  }, [loading, orderIdFromRoute, accessToken, guestSecret, tokenFromUrl]);

  const short = useMemo(() => {
    const id = orderIdFromRoute || orderId;
    return id && id.length >= 8 ? `#${id.slice(-8).toUpperCase()}` : "";
  }, [orderIdFromRoute, orderId]);

  const onLookup = async (e) => {
    e.preventDefault();
    setErr("");
    const id = String(orderId || "").trim();
    const em = String(email || "").trim();
    if (!id || !em) {
      setErr("Enter the order ID from your receipt and the email you used at checkout.");
      return;
    }
    setSubmitting(true);
    try {
      const data = await apiFetch("/api/orders/guest-track", {
        method: "POST",
        json: { orderId: id, email: em }
      });
      const oid = String(data?.orderId || "").trim();
      const secret = String(data?.guestAccessSecret || "").trim();
      if (!oid || !secret) {
        setErr("We couldn’t open tracking for that order. Check the ID and email, then try again.");
        return;
      }
      setGuestOrderSecret(oid, secret);
      setGuestSecret(secret);
      nav(`/track/${encodeURIComponent(oid)}?t=${encodeURIComponent(secret)}`, { replace: true });
    } catch (ex) {
      setErr(apiErrorMessage(ex, "We couldn’t find a guest order with that ID and email."));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return h("div", { className: "flex min-h-[50vh] items-center justify-center text-sm text-slate-500" }, "Loading…");
  }

  const hasAccess = Boolean(accessToken || guestSecret || (orderIdFromRoute && getGuestOrderSecret(orderIdFromRoute)));
  const showLookup = !hasAccess;

  return h(f, null, [
    h(
      "div",
      { key: "page", className: "mx-auto w-full max-w-lg px-4 py-10 sm:px-6" },
      [
        h(
          Link,
          {
            key: "back",
            to: "/",
            className: "mb-6 inline-flex items-center gap-2 text-sm font-medium text-sky-600 hover:underline dark:text-sky-300"
          },
          [h(ArrowLeft, { className: "h-4 w-4" }), "Back to shop"]
        ),
        h(GlassPanel, { key: "card", className: "!border-orange-500/20" }, [
          h("div", { className: "flex items-start gap-3" }, [
            h(Navigation, { className: "mt-0.5 h-5 w-5 shrink-0 text-orange-500" }),
            h("div", { className: "min-w-0 flex-1" }, [
              h("h1", { className: "font-display text-xl font-bold text-slate-900 dark:text-white" }, "Track your order"),
              short && hasAccess
                ? h("p", { className: "mt-1 font-mono text-xs text-slate-500" }, `Order ${short}`)
                : null,
              h(
                "p",
                { className: "mt-2 text-sm text-slate-600 dark:text-slate-300" },
                showLookup
                  ? "Enter the order ID from your receipt or payment email, plus the email you used at checkout."
                  : "Live map and delivery status open here when your payment email link is valid."
              ),
              err
                ? h(InlineNotice, { key: "e", variant: "warning", className: "mt-4", onDismiss: () => setErr("") }, err)
                : null,
              showLookup
                ? h(
                    "form",
                    { key: "lookup", className: "mt-5 space-y-4", onSubmit: onLookup },
                    [
                      h(Field, { key: "oid", label: "Order ID" },
                        h(TextInput, {
                          value: orderId,
                          onChange: (ev) => setOrderId(ev.target.value),
                          placeholder: "Full ID or last 8 characters, e.g. A1B2C3D4",
                          autoComplete: "off",
                          "aria-label": "Order ID"
                        })
                      ),
                      h(Field, { key: "em", label: "Email" },
                        h(TextInput, {
                          type: "email",
                          value: email,
                          onChange: (ev) => setEmail(ev.target.value),
                          placeholder: "The email used at checkout",
                          autoComplete: "email",
                          "aria-label": "Email"
                        })
                      ),
                      h(
                        Button,
                        {
                          key: "go",
                          type: "submit",
                          loading: submitting,
                          className: "w-full !rounded-xl"
                        },
                        "Track order"
                      ),
                      h(
                        "p",
                        { className: "text-center text-xs text-slate-500" },
                        [
                          "Ordered with an account? ",
                          h(Link, { to: "/login", state: { from: "/track" }, className: "font-semibold text-sky-600 hover:underline dark:text-sky-300" }, "Sign in")
                        ]
                      )
                    ]
                  )
                : h(
                    Button,
                    {
                      key: "open",
                      type: "button",
                      className: "mt-4 !rounded-xl",
                      onClick: () => setTrackOpen(true)
                    },
                    "Open live tracking"
                  )
            ])
          ])
        ])
      ]
    ),
    trackOpen && (orderIdFromRoute || orderId)
      ? h(TrackOrderModal, {
          key: "modal",
          open: trackOpen,
          onClose: () => setTrackOpen(false),
          orders: [{ id: orderIdFromRoute || orderId }],
          initialOrderId: orderIdFromRoute || orderId,
          guestSecret: !accessToken ? guestSecret || getGuestOrderSecret(orderIdFromRoute || orderId) || null : null
        })
      : null
  ]);
}
