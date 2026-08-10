import React, { useEffect, useRef, useState } from "react";
import { Crosshair, MapPin, Radio } from "lucide-react";
import { useGeolocation } from "hooks/useGeolocation";
import { isServiceProviderStore } from "config/catalog";
import { h } from "utils/h";
import { Button, Field, TextInput } from "components/ui";
import { clearStorefrontDraftSection, readStorefrontDraft, writeStorefrontDraft } from "utils/vendorStorefrontDraft";
import {
  formatGhanaCoords,
  googleMapsUrl,
  osmEmbedUrl,
  reverseGeocodeGhana
} from "utils/ghanaGeo";

const LIVE_SAVE_MS = 60_000;

function movedEnough(prev, lat, lng) {
  if (!prev) return true;
  const dLat = Math.abs(prev.lat - lat);
  const dLng = Math.abs(prev.lng - lng);
  return dLat > 0.00015 || dLng > 0.00015;
}

/**
 * Inline store location: label + GPS pin for shoppers (and live sync for dispatch on product stores).
 */
export function StoreLocationSection({ business, storeSlug, onSave, saving }) {
  const isServiceStore = isServiceProviderStore(business);
  const geo = business?.geoLocation;
  const [label, setLabel] = useState(business?.locationLabel ? String(business.locationLabel) : "");
  const [liveEnabled, setLiveEnabled] = useState(
    isServiceProviderStore(business) ? false : Boolean(business?.settings?.liveLocationEnabled)
  );
  const [resolvingPlace, setResolvingPlace] = useState(false);
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
    setLiveEnabled(
      isServiceProviderStore(business) ? false : Boolean(business?.settings?.liveLocationEnabled)
    );
  }, [business?.id, business?.updatedAt, business?.businessType, business?.locationLabel, business?.settings?.liveLocationEnabled, storeSlug]);

  // If we already have GPS but only coords / a generic placeholder, resolve a place name once.
  useEffect(() => {
    const lat = geo?.lat;
    const lng = geo?.lng;
    if (lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return;
    const current = String(label || business?.locationLabel || "").trim();
    const looksGeneric =
      !current ||
      /^store location$/i.test(current) ||
      /^service location$/i.test(current) ||
      /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(current);
    if (!looksGeneric) return;
    let cancelled = false;
    (async () => {
      const place = await reverseGeocodeGhana(lat, lng);
      if (cancelled || !place) return;
      setLabel(place);
      if (storeSlug) writeStorefrontDraft(storeSlug, { locationLabel: place });
      await onSaveRef.current?.({ locationLabel: place }, { silent: true, reload: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [business?.id, geo?.lat, geo?.lng]);

  const saveLivePosition = (lat, lng) => {
    if (isServiceStore) return;
    const now = Date.now();
    const prev = lastLiveSaveRef.current;
    if (now - prev.at < LIVE_SAVE_MS && !movedEnough(prev, lat, lng)) return;
    lastLiveSaveRef.current = { at: now, lat, lng };
    void onSaveRef.current?.({ geoLocation: { lat, lng } }, { silent: true, reload: false });
  };

  useEffect(() => {
    if (isServiceStore || !business?.settings?.liveLocationEnabled) {
      clearWatch();
      return undefined;
    }
    startWatch(({ lat, lng }) => {
      saveLivePosition(lat, lng);
    });
    return () => clearWatch();
  }, [business?.id, business?.settings?.liveLocationEnabled, isServiceStore, startWatch, clearWatch]);

  const displayLat = position?.lat ?? geo?.lat;
  const displayLng = position?.lng ?? geo?.lng;
  const hasPin = displayLat != null && displayLng != null && Number.isFinite(Number(displayLat));
  const embedSrc = hasPin ? osmEmbedUrl(displayLat, displayLng) : "";
  const placeLabel = String(label || business?.locationLabel || "").trim();

  const persist = async (patch, opts) => {
    if (!onSaveRef.current) return;
    await onSaveRef.current(patch, opts);
  };

  const useCurrentOnce = async () => {
    setError("");
    setResolvingPlace(true);
    try {
      const { lat, lng } = await getOnce();
      let place = "";
      try {
        place = await reverseGeocodeGhana(lat, lng);
      } catch {
        place = "";
      }
      const nextLabel =
        place ||
        label.trim() ||
        String(business?.locationLabel || "").trim() ||
        (isServiceStore ? "Service location" : "Store location");
      setLabel(nextLabel);
      if (storeSlug) writeStorefrontDraft(storeSlug, { locationLabel: nextLabel });
      await persist(
        {
          geoLocation: { lat, lng },
          locationLabel: nextLabel
        },
        { silent: false, reload: true }
      );
    } catch {
      /* error state set in hook */
    } finally {
      setResolvingPlace(false);
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
            h(
              "h2",
              { className: "font-display text-lg font-bold text-slate-900 dark:text-white" },
              isServiceStore ? "Service location" : "Store location"
            )
          ]),
          h(
            "p",
            { className: "mt-1 max-w-xl text-xs leading-relaxed text-slate-500 dark:text-slate-400" },
            isServiceStore
              ? "Pin where you usually meet clients or run the service so buyers know the area. Coordinate exact time in Messages after they book."
              : "Pin your store on the map so buyers know where to pick up, and riders can navigate during delivery. Live location syncs about once per minute while enabled."
          )
        ]),
        hasPin
          ? h(
              "a",
              {
                href: googleMapsUrl(displayLat, displayLng, placeLabel),
                target: "_blank",
                rel: "noopener noreferrer",
                className: "text-xs font-bold text-sky-600 hover:underline dark:text-sky-300"
              },
              "Open in Google Maps →"
            )
          : null
      ]),
      h(Field, { key: "lbl", label: isServiceStore ? "Location name (shown to buyers)" : "Location name (shown to shoppers)", className: "mt-4" }, [
        h(TextInput, {
          value: label,
          onChange: (e) => {
            const next = e.target.value;
            setLabel(next);
            if (storeSlug) writeStorefrontDraft(storeSlug, { locationLabel: next });
          },
          placeholder: isServiceStore ? "e.g. East Legon studio, Campus Barber Shop" : "e.g. University Main Gate, Block A"
        })
      ]),
      h("div", { key: "acts", className: "mt-3 flex flex-wrap gap-2" }, [
        h(
          Button,
          { type: "button", variant: "outline", className: "gap-2", disabled: saving || resolvingPlace, onClick: () => void saveLabel() },
          "Save name"
        ),
        h(
          Button,
          {
            type: "button",
            variant: "outline",
            className: "gap-2",
            disabled: saving || resolvingPlace,
            onClick: () => void useCurrentOnce()
          },
          [
            h(Crosshair, { className: "h-4 w-4" }),
            resolvingPlace ? " Finding place…" : " Use current location"
          ]
        ),
        !isServiceStore
          ? h(
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
          : null
      ].filter(Boolean)),
      hasPin
        ? h(
            "div",
            {
              key: "coords",
              className:
                "mt-4 overflow-hidden rounded-xl border border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-500/25 dark:bg-emerald-950/30"
            },
            [
              h("div", { key: "txt", className: "px-4 py-3 text-xs" }, [
                h("p", { className: "font-bold text-emerald-900 dark:text-emerald-100" }, "Pinned on map"),
                h(
                  "p",
                  { className: "mt-1 text-sm font-medium text-emerald-950 dark:text-emerald-50" },
                  placeLabel || "Resolving street / area…"
                ),
                h(
                  "p",
                  { className: "mt-1 font-mono text-[10px] text-emerald-800/70 dark:text-emerald-200/70" },
                  formatGhanaCoords(displayLat, displayLng)
                ),
                position?.accuracyM != null
                  ? h(
                      "p",
                      { className: "mt-1 text-emerald-700/80 dark:text-emerald-300/80" },
                      `Accuracy ~${Math.round(position.accuracyM)} m`
                    )
                  : null,
                watching
                  ? h(
                      "p",
                      { className: "mt-2 font-semibold text-emerald-700 dark:text-emerald-300" },
                      "Live sync on (updates periodically)"
                    )
                  : null
              ]),
              embedSrc
                ? h("iframe", {
                    key: "map",
                    title: "Store location map",
                    src: embedSrc,
                    className: "h-48 w-full border-t border-emerald-200/70 dark:border-emerald-500/20",
                    loading: "lazy",
                    referrerPolicy: "no-referrer-when-downgrade"
                  })
                : null
            ]
          )
        : h(
            "p",
            { key: "empty", className: "mt-4 text-xs text-slate-500 dark:text-slate-400" },
            isServiceStore
              ? "No location pinned yet. Use current location so buyers know your general area."
              : "No GPS pin yet. Use current location or turn on live sharing so dispatch can track your store."
          ),
      error ? h("p", { key: "err", className: "mt-2 text-xs font-medium text-rose-600 dark:text-rose-300" }, error) : null
    ]
  );
}
