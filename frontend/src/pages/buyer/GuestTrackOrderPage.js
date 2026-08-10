import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Navigation } from "lucide-react";
import { useAuth } from "context";
import { TrackOrderModal } from "components/features/TrackOrderModal";
import { Button, GlassPanel, InlineNotice } from "components/ui";
import { setGuestOrderSecret, getGuestOrderSecret } from "utils/guestOrderSecret";
import { h, f } from "utils/h";

/**
 * Magic track link from post-payment email:
 *   /track/:orderId?t=<guestAccessSecret>  (guest)
 *   /track/:orderId                         (signed-in buyer)
 */
export function GuestTrackOrderPage() {
  const { orderId: orderIdParam } = useParams();
  const [searchParams] = useSearchParams();
  const nav = useNavigate();
  const { accessToken, loading } = useAuth();

  const orderId = String(orderIdParam || "").trim();
  const tokenFromUrl = String(searchParams.get("t") || searchParams.get("secret") || "").trim();

  const [guestSecret, setGuestSecret] = useState(() =>
    tokenFromUrl || (orderId ? getGuestOrderSecret(orderId) : "")
  );
  const [trackOpen, setTrackOpen] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!orderId) {
      setErr("Missing order reference in this link.");
      return;
    }
    if (tokenFromUrl) {
      setGuestOrderSecret(orderId, tokenFromUrl);
      setGuestSecret(tokenFromUrl);
    }
  }, [orderId, tokenFromUrl]);

  useEffect(() => {
    if (loading || !orderId) return;
    const secret = tokenFromUrl || guestSecret || getGuestOrderSecret(orderId);
    if (accessToken || secret) {
      setErr("");
      setTrackOpen(true);
      return;
    }
    setErr(
      "This track link needs a sign-in or the private code from your payment email. Open the Track button in that email, or sign in with the account on the order."
    );
  }, [loading, orderId, accessToken, guestSecret, tokenFromUrl]);

  const short = useMemo(() => (orderId ? `#${orderId.slice(-8).toUpperCase()}` : ""), [orderId]);

  if (loading) {
    return h("div", { className: "flex min-h-[50vh] items-center justify-center text-sm text-slate-500" }, "Loading…");
  }

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
              short
                ? h("p", { className: "mt-1 font-mono text-xs text-slate-500" }, `Order ${short}`)
                : null,
              h(
                "p",
                { className: "mt-2 text-sm text-slate-600 dark:text-slate-300" },
                "Live map and delivery status open here when your payment email link is valid."
              ),
              err
                ? h(InlineNotice, { key: "e", variant: "warning", className: "mt-4", onDismiss: () => setErr("") }, err)
                : null,
              !accessToken && !guestSecret
                ? h("div", { key: "act", className: "mt-4 flex flex-wrap gap-2" }, [
                    h(
                      Button,
                      {
                        type: "button",
                        className: "!rounded-xl",
                        onClick: () => nav("/login", { state: { from: `/track/${orderId}` } })
                      },
                      "Sign in to track"
                    ),
                    h(
                      Button,
                      {
                        type: "button",
                        variant: "ghost",
                        className: "!rounded-xl",
                        onClick: () => setTrackOpen(true)
                      },
                      "Try open tracker"
                    )
                  ])
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
    trackOpen && orderId
      ? h(TrackOrderModal, {
          key: "modal",
          open: trackOpen,
          onClose: () => setTrackOpen(false),
          orders: [{ id: orderId }],
          initialOrderId: orderId,
          guestSecret: !accessToken ? guestSecret || getGuestOrderSecret(orderId) || null : null
        })
      : null
  ]);
}
