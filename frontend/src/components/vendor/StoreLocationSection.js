import React, { useEffect, useRef, useState } from "react";
import { Crosshair, MapPin, Radio } from "lucide-react";
import { useGeolocation } from "hooks/useGeolocation";
import { h } from "utils/h";
import { Button, Field, TextInput } from "components/ui";
import { clearStorefrontDraftSection, readStorefrontDraft, writeStorefrontDraft } from "utils/vendorStorefrontDraft";

const LIVE_SAVE_MS = 60_000;

function mapsUrl(lat, lng) {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
}

function movedEnough(prev, lat, lng) {
  if (!prev) return true;
  const dLat = Math.abs(prev.lat - lat);
  const dLng = Math.abs(prev.lng - lng);
  return dLat > 0.00015 || dLng > 0.00015;
}

/**
 * Inline store location: label + live GPS pin for buyers, riders, and dispatch maps.
 */
export function StoreLocationSection({ business, storeSlug, onSave, saving }) {
  const geo = business?.geoLocation;
  const [label, setLabel] = useState(business?.locationLabel ? String(business.locationLabel) : "");
  const [liveEnabled, setLiveEnabled] = useState(Boolean(business?.settings?.liveLocationEnabled));
  const { position, error, watching, getOnce, startWatch, clearWatch, setError } = useGeolocation();
  const onSaveRef = useRef(onSave);
  const lastLiveSaveRef = useRef({ at: 0, lat: null, lng: null });
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    if (!business?.id) return;
    const draftLabel = readStorefrontDraft(storeSlug)?.locationLabel;
    setLabel(
      typeof draftLabel === "string"
        ? draftLabel
        : business?.locationLabel
          ? String(business.locationLabel)
          : ""
    );
    setLiveEnabled(Boolean(business?.settings?.liveLocationEnabled));
  }, [business?.id, business?.updatedAt, business?.locationLabel, business?.settings?.liveLocationEnabled, storeSlug]);

  const saveLivePosition = (lat, lng) => {
    const now = Date.now();
    const prev = lastLiveSaveRef.current;
    if (now - prev.at < LIVE_SAVE_MS && !movedEnough(prev, lat, lng)) return;
    lastLiveSaveRef.current = { at: now, lat, lng };
    void onSaveRef.current?.({ geoLocation: { lat, lng } }, { silent: true, reload: false });
  };

  useEffect(() => {
    if (!business?.settings?.liveLocationEnabled) {
      clearWatch();
      return undefined;
    }
    startWatch(({ lat, lng }) => {
      saveLivePosition(lat, lng);
    });
    return () => clearWatch();
  }, [business?.id, business?.settings?.liveLocationEnabled, startWatch, clearWatch]);

  const displayLat = position?.lat ?? geo?.lat;
  const displayLng = position?.lng ?? geo?.lng;
  const hasPin = displayLat != null && displayLng != null && Number.isFinite(Number(displayLat));

  const persist = async (patch, opts) => {
    if (!onSaveRef.current) return;
    await onSaveRef.current(patch, opts);
  };

  const useCurrentOnce = async () => {
    setError("");
    try {
      const { lat, lng } = await getOnce();
      await persist(
        {
          geoLocation: { lat, lng },
          locationLabel: label.trim() || business?.locationLabel || "Store location"
        },
        { silent: false, reload: true }
      );
    } catch {
      /* error state set in hook */
    }
  };

  const toggleLive = async () => {
    if (watching || liveEnabled) {
      clearWatch();
      setLiveEnabled(false);
      await persist({ settings: { ...(business?.settings || {}), liveLocationEnabled: false } }, { reload: true });
      return;
    }
    setLiveEnabled(true);
    await persist({ settings: { ...(business?.settings || {}), liveLocationEnabled: true } }, { reload: true });
    startWatch(({ lat, lng }) => {
      saveLivePosition(lat, lng);
    });
  };

  const saveLabel = async () => {
    await persist({ locationLabel: label.trim() }, { reload: true });
    clearStorefrontDraftSection(storeSlug, "locationLabel");
  };

  return h(
    "section",
    {
      id: "store-location",
      className:
        "scroll-mt-24 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-night-900/90"
    },
    [
      h("div", { className: "flex flex-wrap items-start justify-between gap-3" }, [
        h("div", null, [
          h("div", { className: "flex items-center gap-2 text-sky-600 dark:text-sky-300" }, [
            h(MapPin, { className: "h-5 w-5" }),
            h("h2", { className: "font-display text-lg font-bold text-slate-900 dark:text-white" }, "Store location")
          ]),
          h(
            "p",
            { className: "mt-1 max-w-xl text-xs leading-relaxed text-slate-500 dark:text-slate-400" },
            "Pin your store on the map so buyers know where to pick up, and riders can navigate during delivery. Live location syncs about once per minute while enabled."
          )
        ]),
        hasPin
          ? h(
              "a",
              {
                href: mapsUrl(displayLat, displayLng),
                target: "_blank",
                rel: "noopener noreferrer",
                className: "text-xs font-bold text-sky-600 hover:underline dark:text-sky-300"
              },
              "Open in Maps →"
            )
          : null
      ]),
      h(Field, { key: "lbl", label: "Location name (shown to shoppers)", className: "mt-4" }, [
        h(TextInput, {
          value: label,
          onChange: (e) => {
            const next = e.target.value;
            setLabel(next);
            if (storeSlug) writeStorefrontDraft(storeSlug, { locationLabel: next });
          },
          placeholder: "e.g. University Main Gate, Block A"
        })
      ]),
      h("div", { key: "acts", className: "mt-3 flex flex-wrap gap-2" }, [
        h(
          Button,
          { type: "button", variant: "outline", className: "gap-2", disabled: saving, onClick: () => void saveLabel() },
          "Save name"
        ),
        h(
          Button,
          { type: "button", variant: "outline", className: "gap-2", disabled: saving, onClick: () => void useCurrentOnce() },
          [h(Crosshair, { className: "h-4 w-4" }), " Use current location"]
        ),
        h(
          Button,
          {
            type: "button",
            variant: watching || liveEnabled ? "primary" : "outline",
            className: "gap-2",
            disabled: saving,
            onClick: () => void toggleLive()
          },
          [
            h(Radio, { className: `h-4 w-4 ${watching ? "animate-pulse" : ""}` }),
            watching || liveEnabled ? " Live location on" : " Share live location"
          ]
        )
      ]),
      hasPin
        ? h(
            "div",
            {
              key: "coords",
              className:
                "mt-4 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 text-xs dark:border-emerald-500/25 dark:bg-emerald-950/30"
            },
            [
              h("p", { className: "font-bold text-emerald-900 dark:text-emerald-100" }, "Pinned on map"),
              h(
                "p",
                { className: "mt-1 font-mono text-emerald-800/90 dark:text-emerald-200/90" },
                `${Number(displayLat).toFixed(5)}, ${Number(displayLng).toFixed(5)}`
              ),
              position?.accuracyM != null
                ? h("p", { className: "mt-1 text-emerald-700/80 dark:text-emerald-300/80" }, `Accuracy ~${Math.round(position.accuracyM)} m`)
                : null,
              watching
                ? h("p", { className: "mt-2 font-semibold text-emerald-700 dark:text-emerald-300" }, "Live sync on (updates periodically)")
                : null
            ]
          )
        : h(
            "p",
            { key: "empty", className: "mt-4 text-xs text-slate-500 dark:text-slate-400" },
            "No GPS pin yet. Use current location or turn on live sharing so dispatch can track your store."
          ),
      error ? h("p", { key: "err", className: "mt-2 text-xs font-medium text-rose-600 dark:text-rose-300" }, error) : null
    ]
  );
}
