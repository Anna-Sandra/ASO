import React, { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import "leaflet/dist/leaflet.css";
import { useTheme } from "context";
import { h } from "utils/h";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

export const MAP_LIGHT_TILE = {
  url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  attribution: '&copy; <a href="https://carto.com/">CARTO</a> · OSM'
};

export const MAP_DARK_TILE = {
  url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  attribution: '&copy; <a href="https://carto.com/">CARTO</a> · OSM'
};

const PIN_ICON = L.divIcon({
  className: "delivery-track-marker-wrap",
  html: `<div style="display:flex;width:40px;height:40px;border-radius:999px;background:linear-gradient(145deg,#ef4444,#dc2626);align-items:center;justify-content:center;box-shadow:0 10px 22px rgba(239,68,68,.35);border:3px solid #fff;"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 40]
});

function Recenter({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (!center) return;
    map.setView(center, zoom, { animate: true });
  }, [center, zoom, map]);
  return null;
}

/**
 * Premium single-pin map used for store / application / admin location previews.
 * Matches DeliveryLive tile styling (light Voyager / dark Carto).
 */
export function LocationMapPreview({
  lat,
  lng,
  label = "Pinned location",
  heightClass = "h-48",
  className = "",
  zoom = 15
}) {
  const { dark } = useTheme();
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;

  const center = [la, ln];
  const tile = dark ? MAP_DARK_TILE : MAP_LIGHT_TILE;

  return h(
    "div",
    {
      className: `delivery-map-shell relative w-full overflow-hidden ring-1 ring-black/5 dark:ring-white/10 ${heightClass} ${className}`
    },
    h(
      MapContainer,
      {
        center,
        zoom,
        scrollWheelZoom: false,
        zoomControl: false,
        dragging: true,
        className: "h-full w-full"
      },
      h(Recenter, { key: "rc", center, zoom }),
      h(TileLayer, {
        key: dark ? "dark" : "light",
        attribution: tile.attribution,
        url: tile.url
      }),
      h(
        Marker,
        { key: "mk", position: center, icon: PIN_ICON },
        h(Popup, { className: "rounded-xl" }, h("p", { className: "text-sm font-semibold" }, label))
      )
    )
  );
}
