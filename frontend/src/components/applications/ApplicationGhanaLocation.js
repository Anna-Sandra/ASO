import React, { useState } from "react";
import { Crosshair, MapPin } from "lucide-react";
import { useGeolocation } from "hooks/useGeolocation";
import { formatGhanaCoords, googleMapsUrl, isCoordinateInGhana, osmEmbedUrl, reverseGeocodeGhana } from "utils/ghanaGeo";
import { h } from "utils/h";
import { Button, Field, InlineNotice, TextInput } from "components/ui";

/**
 * Capture applicant GPS pin in Ghana for vendor / courier applications.
 */
export function ApplicationGhanaLocation({ value, onChange, disabled }) {
  const { position, error, getOnce, setError } = useGeolocation();
  const [busy, setBusy] = useState(false);

  const lat = value?.locationLat;
  const lng = value?.locationLng;
  const hasPin = lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));

  const capture = async () => {
    if (disabled) return;
    setError("");
    setBusy(true);
    try {
      const pos = await getOnce();
      if (!isCoordinateInGhana(pos.lat, pos.lng)) {
        setError("Your location must be inside Ghana. Enable GPS and try again, or move to an open area.");
        return;
      }
      let label = "";
      try {
        label = await reverseGeocodeGhana(pos.lat, pos.lng);
      } catch {
        label = "";
      }
      onChange?.({
        locationLat: pos.lat,
        locationLng: pos.lng,
        locationAccuracyM: pos.accuracyM ?? null,
        locationLabel: label || formatGhanaCoords(pos.lat, pos.lng)
      });
    } catch {
      /* hook sets error */
    } finally {
      setBusy(false);
    }
  };

  return h("div", { className: "space-y-3" }, [
    h("div", { key: "hd" }, [
      h("h3", { className: "text-xs font-bold uppercase tracking-wide text-sky-800 dark:text-sky-300" }, "Your location"),
      h(
        "p",
        { className: "mt-1 text-sm text-slate-600 dark:text-slate-400" },
        "We use your live GPS pin so buyers and admins know where you operate. You must be in Ghana when applying."
      )
    ]),
    h(
      Button,
      {
        key: "cap",
        type: "button",
        variant: "primary",
        className: "w-full sm:w-auto",
        loading: busy,
        disabled: disabled || busy,
        onClick: () => void capture()
      },
      [h(Crosshair, { key: "ic", className: "h-4 w-4" }), "Use my current location"]
    ),
    error ? h(InlineNotice, { key: "geo-err", variant: "error", onDismiss: () => setError("") }, error) : null,
    hasPin
      ? h(
          "div",
          {
            key: "pin",
            className:
              "overflow-hidden rounded-2xl border border-emerald-300/50 bg-emerald-50/80 dark:border-emerald-500/30 dark:bg-emerald-950/25"
          },
          [
            h("div", { key: "row", className: "flex flex-wrap items-start gap-2 px-4 py-3 text-sm" }, [
              h(MapPin, { key: "ic", className: "mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" }),
              h("div", { key: "txt", className: "min-w-0 flex-1" }, [
                h("p", { className: "font-medium text-emerald-900 dark:text-emerald-100" }, "Location captured"),
                h(
                  "p",
                  { className: "mt-0.5 text-sm text-emerald-900 dark:text-emerald-50" },
                  value.locationLabel || formatGhanaCoords(lat, lng)
                ),
                h(
                  "p",
                  { className: "mt-0.5 font-mono text-[10px] text-emerald-800/70 dark:text-emerald-200/70" },
                  formatGhanaCoords(lat, lng)
                ),
                h(
                  "a",
                  {
                    key: "map",
                    href: googleMapsUrl(lat, lng, value.locationLabel),
                    target: "_blank",
                    rel: "noreferrer",
                    className: "mt-1 inline-block text-xs font-medium text-sky-700 underline dark:text-sky-300"
                  },
                  "Open in Google Maps"
                )
              ])
            ]),
            h("iframe", {
              key: "embed",
              title: "Your location map",
              src: osmEmbedUrl(lat, lng),
              className: "h-40 w-full border-t border-emerald-300/40 dark:border-emerald-500/20",
              loading: "lazy",
              referrerPolicy: "no-referrer-when-downgrade"
            })
          ]
        )
      : h("p", { key: "need", className: "text-xs text-amber-700 dark:text-amber-200" }, "Location is required before you submit."),
    h(
      Field,
      { key: "lbl", label: "Area label (optional)" },
      h(TextInput, {
        value: value?.locationLabel || "",
        onChange: (e) =>
          onChange?.({
            ...value,
            locationLabel: e.target.value.slice(0, 300)
          }),
        placeholder: "e.g. East Legon, Kumasi Ahodwo, Tema Community 1",
        disabled: disabled || !hasPin
      })
    ),
    position && !hasPin
      ? h("p", { key: "hint", className: "text-xs text-slate-500" }, "Tap “Use my current location” to save your pin.")
      : null
  ]);
}
