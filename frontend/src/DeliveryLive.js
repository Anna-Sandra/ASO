import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import {
  ArrowLeft,
  Bike,
  Check,
  Crosshair,
  Headphones,
  MessageCircle,
  Minus,
  Phone,
  Plus,
  Sparkles
} from "lucide-react";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import "leaflet/dist/leaflet.css";
import { apiFetch } from "./api";
import { openDeliverySocket } from "./deliverySocket";
import { formatGhc } from "./money";

const el = React.createElement;

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

function divMarker(html, size, anchor) {
  return L.divIcon({
    className: "delivery-track-marker-wrap",
    html,
    iconSize: size,
    iconAnchor: anchor
  });
}

const VENDOR_MARKER_ICON = divMarker(
  `<div style="display:flex;width:44px;height:44px;border-radius:14px;background:linear-gradient(145deg,#7c3aed,#a78bfa);align-items:center;justify-content:center;box-shadow:0 10px 24px rgba(124,58,237,.38);border:3px solid #fff;"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/><path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2"/><path d="M14 21V7"/></svg></div>`,
  [44, 44],
  [22, 44]
);

const RIDER_MARKER_ICON = divMarker(
  `<div style="display:flex;width:44px;height:44px;border-radius:999px;background:linear-gradient(145deg,#0ea5e9,#2563eb);align-items:center;justify-content:center;box-shadow:0 10px 24px rgba(14,165,233,.4);border:3px solid #fff;"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 17.5h-6M9 17.5L7 10h13l2 7.5M7 10l4-7h8l4 7"/></svg></div>`,
  [44, 44],
  [22, 44]
);

const CUSTOMER_MARKER_ICON = divMarker(
  `<div style="display:flex;width:44px;height:44px;border-radius:999px;background:linear-gradient(145deg,#22c55e,#16a34a);align-items:center;justify-content:center;box-shadow:0 10px 22px rgba(34,197,94,.38);border:3px solid #fff;"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>`,
  [44, 44],
  [22, 44]
);

/** @typedef {"buyer" | "rider"} DeliveryLiveMode */
/** @typedef {"default" | "trackModal" | "embedded"} DeliveryLiveVariant */

const LIGHT_TILE = {
  url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  attribution: '&copy; <a href="https://carto.com/">CARTO</a> · OSM'
};

const STAGE_LABELS = {
  order_placed: "Order placed",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready_for_pickup: "Ready for pickup",
  picked_up: "Picked up",
  on_the_way: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled"
};

const STAGE_ORDER = [
  "order_placed",
  "confirmed",
  "preparing",
  "ready_for_pickup",
  "picked_up",
  "on_the_way",
  "delivered"
];

/** Heuristic pickup point when backend has no vendor coordinates (triangle path for the map). */
function inferVendorApprox(riderLat, riderLng, dropLat, dropLng) {
  if (![riderLat, riderLng, dropLat, dropLng].every(Number.isFinite)) return null;
  const dlat = riderLat - dropLat;
  const dlng = riderLng - dropLng;
  const mag = Math.sqrt(dlat * dlat + dlng * dlng) || 1e-8;
  const nlat = dlat / mag;
  const nlng = dlng / mag;
  const offset = Math.min(mag * 0.42, 0.018);
  return [riderLat + nlat * offset, riderLng + nlng * offset];
}

function formatClock(at) {
  try {
    const d = new Date(at);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** @param {{ history: Array<{ stage: string; at?: string | Date }> }} p */
function timeForStage(p, stage) {
  const h = [...(p.history || [])].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const hit = h.find((x) => x.stage === stage);
  return hit?.at ? formatClock(hit.at) : "";
}

function MapRecenter({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true });
  }, [center, zoom, map]);
  return null;
}

function FitDeliveryBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 14, { animate: true });
      return;
    }
    try {
      map.fitBounds(L.latLngBounds(points), { padding: [52, 52], maxZoom: 16, animate: true });
    } catch {
      /* ignore */
    }
  }, [points, map]);
  return null;
}

/** Floating zoom + locate (buyer locates viewport to self; does not mutate delivery). */
function MapFloatingControls({ mode }) {
  const map = useMap();
  const [locErr, setLocErr] = useState("");

  const locate = () => {
    setLocErr("");
    if (!navigator.geolocation) {
      setLocErr("Location not available.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        map.setView([latitude, longitude], 15, { animate: true });
      },
      () => setLocErr("Could not access your location."),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  return el(
    "div",
    {
      className:
        "pointer-events-none absolute bottom-4 right-4 z-[600] flex flex-col gap-2 [&_button]:pointer-events-auto",
      style: { zIndex: 600 }
    },
    [
      mode === "buyer"
        ? el(
            "button",
            {
              key: "loc",
              type: "button",
              title: "Locate me",
              onClick: locate,
              className:
                "flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-700 shadow-lg transition hover:bg-slate-50"
            },
            el(Crosshair, { className: "h-[18px] w-[18px]" })
          )
        : null,
      el(
        "button",
        {
          key: "zin",
          type: "button",
          title: "Zoom in",
          onClick: () => map.zoomIn(),
          className:
            "flex h-10 w-10 items-center justify-center rounded-t-xl border border-b-0 border-slate-200/90 bg-white text-slate-700 shadow-lg transition hover:bg-slate-50"
        },
        el(Plus, { className: "h-[18px] w-[18px]" })
      ),
      el(
        "button",
        {
          key: "zout",
          type: "button",
          title: "Zoom out",
          onClick: () => map.zoomOut(),
          className:
            "flex h-10 w-10 items-center justify-center rounded-b-xl border border-slate-200/90 bg-white text-slate-700 shadow-lg transition hover:bg-slate-50"
        },
        el(Minus, { className: "h-[18px] w-[18px]" })
      ),
      locErr ? el("p", { key: "err", className: "max-w-[10rem] rounded-lg bg-white/95 px-2 py-1 text-[10px] text-rose-600 shadow" }, locErr) : null
    ].filter(Boolean)
  );
}

/**
 * @param {{ mode: DeliveryLiveMode; accessToken: string; orderId: string; className?: string; variant?: DeliveryLiveVariant }} props
 */
export function DeliveryLive({ mode, accessToken, orderId, className, variant = "default" }) {
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState("");
  const [busyStage, setBusyStage] = useState("");
  const [geoSharing, setGeoSharing] = useState(false);
  const [geoErr, setGeoErr] = useState("");
  /** @type {React.MutableRefObject<any>} */
  const watchRef = useRef(null);
  const lastSocketEmitRef = useRef(0);
  const socketRef = useRef(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const [lastLivePulse, setLastLivePulse] = useState(0);

  const loadBundle = useCallback(async () => {
    const d = await apiFetch(`/api/deliveries/order/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    setBundle(d);
    return d;
  }, [accessToken, orderId]);

  useEffect(() => {
    if (!accessToken || !orderId) return undefined;
    let cancelled = false;
    setFetchErr("");
    setLoading(true);
    loadBundle()
      .catch((ex) => {
        if (!cancelled) setFetchErr(ex?.message || "Could not load delivery");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, orderId, loadBundle]);

  useEffect(() => {
    if (!accessToken || !orderId) return undefined;
    const s = openDeliverySocket(accessToken);
    socketRef.current = s;

    const subscribe = () => {
      s.emit("delivery:subscribe", { orderId }, () => {});
    };

    const onConn = () => {
      setLiveConnected(true);
      subscribe();
    };

    const onDisc = () => setLiveConnected(false);

    s.on("connect", onConn);
    s.on("disconnect", onDisc);
    if (s.connected) {
      setLiveConnected(true);
      subscribe();
    } else setLiveConnected(false);

    const onLoc = (p) => {
      if (!p || typeof p !== "object") return;
      setLastLivePulse(Date.now());
      setBundle((prev) => {
        if (!prev?.delivery) return prev;
        return {
          ...prev,
          delivery: {
            ...prev.delivery,
            riderLatitude: p.latitude,
            riderLongitude: p.longitude,
            riderLocationUpdatedAt: p.updatedAt || new Date().toISOString()
          }
        };
      });
    };

    const onUpdate = (p) => {
      if (!p || typeof p !== "object") return;
      setBundle((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        if (p.delivery) next.delivery = { ...prev.delivery, ...p.delivery };
        if (typeof p.orderStatus === "string" && prev.order && typeof prev.order === "object") {
          next.order = { ...prev.order, status: p.orderStatus };
        }
        return next;
      });
    };

    s.on("delivery:location", onLoc);
    s.on("delivery:update", onUpdate);

    return () => {
      s.off("connect", onConn);
      s.off("disconnect", onDisc);
      s.off("delivery:location", onLoc);
      s.off("delivery:update", onUpdate);
      try {
        s.close();
      } catch {
        /* ignore */
      }
      socketRef.current = null;
      setLiveConnected(false);
    };
  }, [accessToken, orderId]);

  const emitRiderCoords = useCallback(
    (lat, lng) => {
      const s = socketRef.current;
      if (!s?.connected || mode !== "rider") return;
      const now = Date.now();
      if (now - lastSocketEmitRef.current < 4000) return;
      lastSocketEmitRef.current = now;
      s.emit("delivery:rider-location", { orderId, latitude: lat, longitude: lng }, () => {});
    },
    [mode, orderId]
  );

  const postRiderCoords = useCallback(
    async (lat, lng) => {
      if (mode !== "rider") return;
      await apiFetch(`/api/deliveries/order/${encodeURIComponent(orderId)}/rider-location`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: { latitude: lat, longitude: lng }
      });
    },
    [mode, orderId, accessToken]
  );

  useEffect(() => {
    if (!geoSharing || mode !== "rider") {
      if (watchRef.current != null && typeof navigator.geolocation?.clearWatch === "function") {
        navigator.geolocation.clearWatch(watchRef.current);
      }
      watchRef.current = null;
      return undefined;
    }
    if (!navigator.geolocation) {
      setGeoErr("Browser location is not available.");
      return undefined;
    }
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        emitRiderCoords(lat, lng);
        void postRiderCoords(lat, lng).catch(() => {});
      },
      () => setGeoErr("Location permission denied or unavailable."),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    );
    return () => {
      if (watchRef.current != null && typeof navigator.geolocation?.clearWatch === "function") {
        navigator.geolocation.clearWatch(watchRef.current);
      }
      watchRef.current = null;
    };
  }, [geoSharing, mode, emitRiderCoords, postRiderCoords]);

  const patchStage = async (stage) => {
    setBusyStage(stage);
    try {
      const { delivery } = await apiFetch(`/api/deliveries/order/${encodeURIComponent(orderId)}/stage`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: { stage }
      });
      setBundle((prev) => (prev ? { ...prev, delivery } : prev));
    } catch (ex) {
      setGeoErr(typeof ex?.message === "string" ? ex.message : "Could not update stage");
    } finally {
      setBusyStage("");
    }
  };

  const delivery = bundle?.delivery;
  const rider = bundle?.rider;
  const order = bundle?.order;

  const rl = typeof delivery?.riderLatitude === "number" ? delivery.riderLatitude : null;
  const rln = typeof delivery?.riderLongitude === "number" ? delivery.riderLongitude : null;
  const dl = typeof delivery?.dropoffLatitude === "number" ? delivery.dropoffLatitude : null;
  const dln = typeof delivery?.dropoffLongitude === "number" ? delivery.dropoffLongitude : null;

  const vendorApprox = useMemo(() => {
    const v = inferVendorApprox(rl, rln, dl, dln);
    return v && Number.isFinite(v[0]) && Number.isFinite(v[1]) ? v : null;
  }, [rl, rln, dl, dln]);

  const { center, zoom, fitPoints } = useMemo(() => {
    let lat = 5.6037;
    let lng = -0.187;
    if (rl != null && rln != null) {
      lat = rl;
      lng = rln;
    } else if (dl != null && dln != null) {
      lat = dl;
      lng = dln;
    }
    const pts = [];
    if (vendorApprox) pts.push(vendorApprox);
    if (rl != null && rln != null) pts.push([rl, rln]);
    if (dl != null && dln != null) pts.push([dl, dln]);
    const z = pts.length >= 2 ? 14 : 13;
    return { center: [lat, lng], zoom: z, fitPoints: pts };
  }, [rl, rln, dl, dln, vendorApprox]);

  const riderNextActions = () => {
    const st = delivery?.currentStage;
    if (!st) return [];
    if (st === "ready_for_pickup") return [{ stage: "picked_up", label: "Mark picked up" }];
    if (st === "picked_up") return [{ stage: "on_the_way", label: "On the way" }];
    if (st === "on_the_way") return [{ stage: "delivered", label: "Mark delivered" }];
    return [];
  };

  const wrapCls = className || "";
  const omitPageHeader = variant === "trackModal" || variant === "embedded";
  const compactMap = variant === "trackModal";
  /** Timeline + delivery side panel stay dense on full page too (map/summary bands still follow {@link compactMap}). */
  const compactPanels = true;
  const recentLive = mode === "buyer" && Date.now() - lastLivePulse < 12000;

  const polylinePositions = useMemo(() => {
    const pts = [];
    if (vendorApprox) pts.push(vendorApprox);
    if (rl != null && rln != null) pts.push([rl, rln]);
    if (dl != null && dln != null) pts.push([dl, dln]);
    if (pts.length < 2 && rl != null && rln != null && dl != null && dln != null) pts.splice(0, pts.length, [rl, rln], [dl, dln]);
    return pts.length >= 2 ? pts : null;
  }, [vendorApprox, rl, rln, dl, dln]);

  const orderShort = `#${String(orderId).slice(-8).toUpperCase()}`;
  const eta = delivery?.estimatedArrivalMinutes;
  const etaBand =
    eta != null && Number.isFinite(eta)
      ? `${Math.max(5, eta - Math.min(7, eta - 5))} – ${eta + 8} min`
      : null;
  const statusLabel = delivery ? STAGE_LABELS[delivery.currentStage] || delivery.currentStage : "";
  const curIdx =
    typeof delivery?.currentStage === "string"
      ? STAGE_ORDER.includes(delivery.currentStage)
        ? STAGE_ORDER.indexOf(delivery.currentStage)
        : delivery.currentStage === "cancelled"
          ? -1
          : 0
      : 0;

  const historySortedChrono = Array.isArray(delivery?.statusHistory)
    ? [...delivery.statusHistory].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    : [];

  const vendorTooltip =
    order?.items?.[0]?.name != null ? `Pickup · ${String(order.items[0].name)}` : "Vendor pickup";

  const showRiderControls =
    mode === "rider" && delivery?.currentStage !== "delivered" && delivery?.currentStage !== "cancelled";

  const riderPhoneDigits = rider?.phone != null ? String(rider.phone).replace(/[^\d+]/g, "") : "";
  const riderPhoto =
    rider?.profileImageUrl && String(rider.profileImageUrl).trim()
      ? String(rider.profileImageUrl).trim()
      : rider?.photoUrl && String(rider.photoUrl).trim()
        ? String(rider.photoUrl).trim()
        : null;

  if (loading) {
    return el(
      "div",
      {
        className: `flex min-h-[200px] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-night-900/80 ${wrapCls}`
      },
      el("div", { className: "flex items-center gap-3 text-sm font-medium text-slate-600 dark:text-slate-300" }, [
        el("span", {
          key: "sp",
          className: "h-9 w-9 animate-spin rounded-full border-[3px] border-sky-200 border-t-sky-600"
        }),
        "Loading tracking…"
      ])
    );
  }

  if (fetchErr) {
    return el("p", { className: `text-sm font-medium text-rose-600 dark:text-rose-300 ${wrapCls}` }, fetchErr);
  }

  if (!delivery) {
    return el(
      "div",
      {
        className: `rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center dark:border-white/15 dark:bg-white/5 ${wrapCls}`
      },
      el("p", { className: "text-sm leading-relaxed text-slate-600 dark:text-slate-400" }, [
        el(Sparkles, {
          key: "ic",
          className: "mx-auto mb-3 h-8 w-8 text-sky-500 opacity-70"
        }),
        "Delivery tracking appears here once your order is paid and the seller enables campus delivery for it."
      ])
    );
  }

  const mapHeightClass = compactMap ? "h-[200px] min-h-[180px] sm:h-[220px]" : "h-[min(52vw,420px)] min-h-[280px] sm:min-h-[320px]";

  const isDeliveredFinal = delivery.currentStage === "delivered";

  const timelineBody = STAGE_ORDER.map((stageKey, idx) => {
    const active = idx === curIdx && !isDeliveredFinal && delivery.currentStage !== "cancelled";
    const done = idx < curIdx || (isDeliveredFinal && idx <= curIdx);
    const pending = !(done || active);
    const tclock = done || active ? timeForStage({ history: historySortedChrono }, stageKey) : "";

    const dotDone = done && !active;
    const dotActive = active;

    const tlRowCls = compactPanels ? "relative flex gap-1 pb-1.5 last:pb-0 sm:gap-1.5 sm:pb-2" : "relative flex gap-4 pb-8 last:pb-0";
    const tlRailCls = compactPanels ? "relative flex w-5 shrink-0 flex-col items-center sm:w-6" : "relative flex w-11 shrink-0 flex-col items-center";
    const tlDotCls = compactPanels
      ? `relative z-[1] flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-white shadow-sm sm:h-6 sm:w-6 ${
          dotDone
            ? "bg-emerald-500 text-white"
            : dotActive
              ? "bg-sky-500 text-white ring-2 ring-sky-200 dark:ring-sky-900/50"
              : "border-slate-200 bg-slate-100 text-transparent dark:border-white/15"
        }`
      : `relative z-[1] flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-4 border-white shadow-md ${
          dotDone
            ? "bg-emerald-500 text-white"
            : dotActive
              ? "bg-sky-500 text-white ring-4 ring-sky-200"
              : "border-slate-200 bg-slate-100 text-transparent"
        }`;
    const tlLineTop = compactPanels ? "top-[1.35rem] sm:top-7" : "top-[2.85rem]";
    const tlLineH = compactPanels ? "h-[calc(100%-6px)]" : "h-[calc(100%-12px)]";
    const tlTitleCls = compactPanels
      ? `text-[10px] font-semibold leading-snug sm:text-[11px] ${dotActive ? "text-blue-600 dark:text-sky-400" : done ? "text-slate-800 dark:text-slate-100" : "text-slate-400"}`
      : `text-[15px] font-semibold leading-tight ${dotActive ? "text-blue-600" : done ? "text-slate-800 dark:text-slate-100" : "text-slate-400"}`;
    const tlMetaCls = compactPanels
      ? `mt-0 text-[9px] leading-tight sm:text-[10px] ${dotActive ? "font-semibold text-blue-600 dark:text-sky-400" : pending ? "text-slate-400" : "text-slate-500"}`
      : `mt-1 text-xs ${dotActive ? "font-semibold text-blue-600" : pending ? "text-slate-400" : "text-slate-500"}`;
    const txtPad = compactPanels ? "min-w-0 flex-1 pt-0" : "min-w-0 flex-1 pt-1.5";

    return el(
      "div",
      { key: stageKey, className: tlRowCls },
      [
        el(
          "div",
          { key: "rail", className: tlRailCls },
          [
            el(
              "div",
              { className: tlDotCls },
              dotDone
                ? el(Check, { className: compactPanels ? "h-2.5 w-2.5 sm:h-3 sm:w-3" : "h-5 w-5", strokeWidth: 3 })
                : dotActive
                  ? el("span", { className: compactPanels ? "h-1.5 w-1.5 rounded-full bg-white sm:h-2 sm:w-2" : "h-3 w-3 rounded-full bg-white" })
                  : null
            ),
            idx < STAGE_ORDER.length - 1
              ? el("div", {
                  key: "ln",
                  className: `absolute left-1/2 ${tlLineTop} ${tlLineH} w-0.5 -translate-x-1/2 ${done ? "bg-emerald-400" : "bg-slate-200"}`
                })
              : null
          ].filter(Boolean)
        ),
        el(
          "div",
          { key: "txt", className: txtPad },
            [
            el("p", { className: tlTitleCls }, STAGE_LABELS[stageKey] || stageKey),
            el(
              "p",
              { className: tlMetaCls },
              dotActive ? tclock || "In progress…" : pending ? "Pending" : tclock || "—"
            )
          ]
        )
      ]
    );
  });

  const itemsList = Array.isArray(order?.items)
    ? order.items.map((it, idx) =>
        el(
          "div",
          {
            key: `ln-${idx}`,
            className: compactPanels
              ? "flex justify-between gap-2 border-b border-slate-100 py-0.5 text-[10px] last:border-0 dark:border-white/5"
              : "flex justify-between gap-3 border-b border-slate-100 py-3 text-sm last:border-0 dark:border-white/5"
          },
          [
            el("span", { className: "min-w-0 text-slate-700 dark:text-slate-200" }, `${it.quantity ?? 1} × ${it.name}`),
            el("span", { className: "shrink-0 font-medium text-slate-900 dark:text-white" }, formatGhc(Number(it.unitPrice || 0) * Number(it.quantity || 1)))
          ]
        )
      )
    : [];

  const shellCard =
    "overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_20px_50px_-24px_rgba(15,23,42,.25)] dark:border-white/10 dark:bg-night-900 dark:shadow-none";

  return el("div", { className: `mx-auto max-w-5xl text-slate-900 dark:text-slate-100 ${wrapCls}` }, [
    !omitPageHeader &&
      el(
        "header",
        { key: "page-h", className: "mb-4 flex items-center justify-between gap-3 px-1" },
        [
          el(
            Link,
            {
              key: "bk",
              to: "/orders",
              className:
                "inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-white/10 dark:bg-night-800 dark:text-slate-200"
            },
            el(ArrowLeft, { className: "h-5 w-5" })
          ),
          el("h1", { key: "t", className: "flex-1 text-center font-display text-lg font-bold tracking-tight sm:text-xl" }, "Delivery Tracking"),
          el(
            Link,
            {
              key: "hp",
              to: "/support",
              className: "inline-flex items-center gap-1.5 text-sm font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400"
            },
            [el(Headphones, { key: "i", className: "h-4 w-4" }), "Help"]
          )
        ]
      ),

    el("div", { key: "shell", className: `${shellCard} ${variant === "trackModal" ? "shadow-xl" : ""}` }, [
      el(
        "div",
        {
          key: "summary",
          className: compactMap
            ? "flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-white via-slate-50/80 to-white px-3 py-2 sm:px-4 dark:border-white/10 dark:from-night-900 dark:via-night-950/80 dark:to-night-900"
            : "flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 bg-gradient-to-r from-white via-slate-50/80 to-white px-4 py-4 sm:px-6 dark:border-white/10 dark:from-night-900 dark:via-night-950/80 dark:to-night-900"
        },
        [
          el(
            "div",
            {
              key: "left-sum",
              className: compactMap
                ? "flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-3"
                : "flex min-w-0 flex-1 flex-wrap items-center gap-3 sm:gap-6"
            },
            [
              el("div", { key: "oid", className: "min-w-0" }, [
                el(
                  "p",
                  { className: compactMap ? "text-[9px] font-bold uppercase tracking-wider text-slate-400" : "text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400" },
                  "Order ID"
                ),
                el(
                  "p",
                  { className: compactMap ? "font-mono text-xs font-bold text-slate-900 dark:text-white" : "font-mono text-base font-bold text-slate-900 dark:text-white" },
                  orderShort
                )
              ]),
              el("div", { key: "eta", className: compactMap ? "hidden h-8 w-px bg-slate-200 dark:bg-white/10 sm:block" : "hidden h-10 w-px bg-slate-200 dark:bg-white/10 sm:block" }),
              etaBand
                ? el("div", { key: "et", className: "" }, [
                    el(
                      "p",
                      { className: compactMap ? "text-[9px] font-bold uppercase tracking-wider text-slate-400" : "text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400" },
                      "Est. arrival"
                    ),
                    el(
                      "p",
                      {
                        className: compactMap
                          ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900/60"
                          : "rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700 ring-1 ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900/60"
                      },
                      etaBand
                    )
                  ])
                : el("div", { key: "et-ph" }, [
                    el(
                      "p",
                      { className: compactMap ? "text-[9px] font-bold uppercase tracking-wider text-slate-400" : "text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400" },
                      "Est. arrival"
                    ),
                    el("p", { className: compactMap ? "text-[11px] font-semibold text-slate-500" : "text-sm font-semibold text-slate-500" }, "—")
                  ]),
              el("div", { key: "st-div", className: compactMap ? "hidden h-8 w-px bg-slate-200 dark:bg-white/10 sm:block" : "hidden h-10 w-px bg-slate-200 dark:bg-white/10 sm:block" }),
              el("div", { key: "st", className: "" }, [
                el(
                  "p",
                  { className: compactMap ? "text-[9px] font-bold uppercase tracking-wider text-slate-400" : "text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400" },
                  "Order status"
                ),
                el(
                  "span",
                  {
                    className: compactMap
                      ? "inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 ring-1 ring-sky-200/80 dark:bg-sky-950/50 dark:text-sky-200 dark:ring-sky-800/70"
                      : "inline-flex rounded-full bg-sky-50 px-3 py-1 text-sm font-bold text-blue-700 ring-1 ring-sky-200/80 dark:bg-sky-950/50 dark:text-sky-200 dark:ring-sky-800/70"
                  },
                  statusLabel
                )
              ])
            ].filter(Boolean)
          ),
          el(
            "div",
            {
              key: "scooter",
              className: compactMap
                ? "hidden"
                : "hidden h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-900/25 sm:flex"
            },
            compactMap ? null : el(Bike, { className: "h-9 w-9", strokeWidth: 2 })
          )
        ]
      ),

      el(
        "div",
        { key: "map-slot", className: `relative bg-slate-100 ${mapHeightClass} w-full` },
        [
          el(
            MapContainer,
            {
              center,
              zoom,
              scrollWheelZoom: false,
              zoomControl: false,
              className: `h-full w-full [&_.leaflet-pane]:transition-none [&_.leaflet-tile-pane]:brightness-[1.02]`
            },
            fitPoints.length >= 2 ? el(FitDeliveryBounds, { points: fitPoints }) : el(MapRecenter, { center, zoom }),
            el(TileLayer, { attribution: LIGHT_TILE.attribution, url: LIGHT_TILE.url }),
            vendorApprox &&
              rl != null &&
              rln != null &&
              dl != null &&
              dln != null &&
              el(
                Marker,
                { position: vendorApprox, icon: VENDOR_MARKER_ICON },
                el(
                  Popup,
                  { className: "rounded-xl" },
                  el("div", { className: "text-sm font-semibold text-violet-800" }, vendorTooltip || "Vendor"),
                  el("p", { className: "mt-1 text-xs text-slate-500" }, "Campus pickup point")
                )
              ),
            rl != null && rln != null
              ? el(
                  Marker,
                  {
                    key: recentLive ? `rider-${lastLivePulse}` : "rider",
                    position: [rl, rln],
                    icon: RIDER_MARKER_ICON
                  },
                  el(
                    Popup,
                    { className: "rounded-xl" },
                    [
                      el("p", { key: "nm", className: "text-sm font-bold text-slate-900" }, rider?.displayName || "Courier"),
                      el(
                        "p",
                        { key: "vh", className: "mt-1 text-xs text-slate-600" },
                        [rider?.vehicleType ? `${String(rider.vehicleType)} · ` : null, liveConnected ? (recentLive ? "Live GPS" : "Connected") : "Connecting…"].filter(Boolean).join("") ||
                          "En route"
                      )
                    ]
                  )
                )
              : null,
            dl != null && dln != null
              ? el(
                  Marker,
                  { position: [dl, dln], icon: CUSTOMER_MARKER_ICON },
                  el(
                    Popup,
                    { className: "rounded-xl" },
                    [
                      el(
                        "p",
                        { key: "tit", className: "text-sm font-bold text-emerald-800 dark:text-emerald-200" },
                        delivery.dropoffLabel?.trim() || "Your drop-off"
                      ),
                      el("p", { key: "dst", className: "mt-1 text-xs text-slate-600 dark:text-slate-400" }, "Delivery destination")
                    ]
                  )
                )
              : null,
            polylinePositions &&
              el(Polyline, {
                positions: polylinePositions,
                pathOptions: { color: "#3b82f6", weight: 4, opacity: 0.85, dashArray: "12 14", lineCap: "round", lineJoin: "round" }
              }),
            el(MapFloatingControls, { mode })
          ),
          el(
            "div",
            {
              key: "legend",
              className: compactMap
                ? "pointer-events-none absolute left-2 top-2 z-[500] rounded-lg border border-white/80 bg-white/95 px-2 py-1.5 text-[10px] shadow-md backdrop-blur-sm dark:border-white/10 dark:bg-night-900/92"
                : "pointer-events-none absolute left-4 top-4 z-[500] rounded-xl border border-white/80 bg-white/95 px-3 py-2.5 text-[11px] shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-night-900/92"
            },
            [
              el("p", { className: compactMap ? "mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-400" : "mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400" }, "Legend"),
              el(
                "div",
                { className: compactMap ? "flex flex-col gap-1 text-slate-700 dark:text-slate-200" : "flex flex-col gap-1.5 text-slate-700 dark:text-slate-200" },
                [
                  ["bg-violet-500", "Vendor"],
                  ["bg-blue-500", "Rider"],
                  ["bg-emerald-500", "You"]
                ].map(([c, lbl]) =>
                  el("div", { key: lbl, className: compactMap ? "flex items-center gap-1.5" : "flex items-center gap-2" }, [
                    el("span", { className: compactMap ? `h-2 w-2 shrink-0 rounded-full ${c}` : `h-2.5 w-2.5 shrink-0 rounded-full ${c}` }),
                    lbl
                  ])
                )
              )
            ]
          )
        ].filter(Boolean)
      ),

      el(
        "div",
        {
          key: "lower",
          className:
            "grid gap-3 border-t border-slate-100 p-3 sm:gap-3 sm:p-3 lg:grid-cols-[minmax(0,1fr)_minmax(200px,280px)] dark:border-white/10"
        },
        [
          el("div", { key: "progress-col", className: "min-w-0" }, [
            el("div", { key: "pr-h", className: "mb-2 flex items-center justify-between gap-2" }, [
              el(
                "h2",
                {
                  className: "font-display text-[11px] font-bold uppercase tracking-wide text-slate-900 dark:text-white"
                },
                "Delivery progress"
              ),
              el(
                "span",
                {
                  className: `flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                    mode === "buyer" && liveConnected && recentLive
                      ? "bg-emerald-100 text-emerald-800"
                      : liveConnected
                        ? "border border-emerald-200 bg-white text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200"
                        : "border border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-night-800 dark:text-slate-400"
                  }`
                },
                [
                  el("span", {
                    key: "dot",
                    className: `h-1.5 w-1.5 rounded-full ${recentLive ? "animate-pulse bg-emerald-500" : liveConnected ? "bg-emerald-400" : "bg-slate-300"}`
                  }),
                  recentLive ? "Live" : liveConnected ? "Connected" : "Reconnecting…"
                ]
              )
            ]),
            el("div", { key: "tl", className: "relative pl-0" }, timelineBody)
          ]),

          el("div", { key: "detail-col", className: "flex min-w-0 flex-col gap-2" }, [
            mode === "buyer" &&
              rider &&
              el(
                "div",
                {
                  key: "rider-card",
                  className:
                    "rounded-lg border border-slate-100 bg-slate-50/80 p-2 shadow-sm dark:border-white/10 dark:bg-night-800/80"
                },
                [
                  el(
                    "p",
                    {
                      className: "text-[9px] font-bold uppercase tracking-wider text-slate-400"
                    },
                    "Rider details"
                  ),
                  el(
                    "div",
                    { className: "mt-2 flex gap-2" },
                    [
                      riderPhoto
                        ? el("img", {
                            key: "ph",
                            src: riderPhoto,
                            alt: "",
                            className:
                              "h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-white shadow-sm dark:ring-night-700"
                          })
                        : el(
                            "div",
                            {
                              key: "ph-f",
                              className:
                                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-xs font-bold text-white shadow-sm"
                            },
                            String((rider.displayName || "R").trim()).slice(0, 1).toUpperCase()
                          ),
                      el("div", { key: "meta", className: "min-w-0 flex-1" }, [
                        el(
                          "p",
                          { className: "truncate font-display text-xs font-bold text-slate-900 dark:text-white" },
                          rider.displayName || "Courier"
                        ),
                        el(
                          "p",
                          { className: "mt-0.5 text-[10px] text-slate-500" },
                          rider.vehicleType ? `${String(rider.vehicleType)} · courier` : "Campus courier"
                        ),
                        riderPhoneDigits
                          ? el(
                              "a",
                              {
                                key: "tel",
                                href: `tel:${riderPhoneDigits}`,
                                className:
                                  "mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400"
                              },
                              el(Phone, { className: "h-3 w-3 shrink-0" }),
                              rider.phone
                            )
                          : null
                      ]),
                      riderPhoneDigits
                        ? el(
                            "a",
                            {
                              key: "sms",
                              href: `sms:${riderPhoneDigits}`,
                              title: "Message",
                              className:
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-sm transition hover:brightness-105"
                            },
                            el(MessageCircle, { className: "h-4 w-4" })
                          )
                        : null
                    ].filter(Boolean)
                  )
                ]
              ),

            mode === "buyer" &&
              itemsList.length > 0 &&
              el(
                "div",
                {
                  key: "order-card",
                  className: compactMap
                    ? "rounded-lg border border-slate-100 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-night-900/70"
                    : "rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-night-900/70"
                },
                [
                  el(
                    "p",
                    {
                      className: compactMap
                        ? "text-[9px] font-bold uppercase tracking-wider text-slate-400"
                        : "text-xs font-bold uppercase tracking-[0.15em] text-slate-400"
                    },
                    "Delivery details"
                  ),
                  el(
                    "div",
                    {
                      key: "lines",
                      className: ""
                    },
                    itemsList
                  ),
                  el(
                    "div",
                    {
                      key: "tot",
                      className: compactMap
                        ? "mt-1 flex items-center justify-between border-t border-slate-200 pt-2 dark:border-white/10"
                        : "mt-2 flex items-center justify-between border-t border-slate-200 pt-4 dark:border-white/10"
                    },
                    [
                      el(
                        "span",
                        { className: compactMap ? "text-[10px] font-semibold text-slate-900 dark:text-white" : "text-base font-semibold text-slate-900 dark:text-white" },
                        "Total"
                      ),
                      el(
                        "span",
                        { className: compactMap ? "text-xs font-bold text-emerald-600 dark:text-emerald-400" : "text-lg font-bold text-emerald-600 dark:text-emerald-400" },
                        formatGhc(order?.total)
                      )
                    ]
                  )
                ]
              ),

            showRiderControls &&
              el(
                "div",
                {
                  key: "rider-act",
                  className:
                    "rounded-2xl border border-amber-200/80 bg-amber-50/90 p-4 dark:border-amber-900/50 dark:bg-amber-950/30"
                },
                [
                  el("p", { className: "text-xs font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200" }, "Rider controls"),
                  el("div", { className: "mt-3 flex flex-wrap gap-2" }, [
                    ...riderNextActions().map((a) =>
                      el(
                        "button",
                        {
                          key: a.stage,
                          type: "button",
                          disabled: Boolean(busyStage),
                          className:
                            "rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-md hover:brightness-105 disabled:opacity-60",
                          onClick: () => patchStage(a.stage)
                        },
                        busyStage === a.stage ? "Saving…" : a.label
                      )
                    ),
                    el(
                      "button",
                      {
                        type: "button",
                        className: `rounded-xl border px-4 py-2.5 text-sm font-bold shadow-sm transition ${
                          geoSharing
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-slate-200 bg-white text-slate-800 dark:border-white/15 dark:bg-night-950 dark:text-slate-100"
                        }`,
                        onClick: () => {
                          setGeoErr("");
                          setGeoSharing((x) => !x);
                        }
                      },
                      geoSharing ? "Stop GPS share" : "Share my GPS"
                    )
                  ]),
                  geoErr ? el("p", { className: "mt-2 text-xs font-medium text-rose-700 dark:text-rose-300" }, geoErr) : null
                ]
              )
          ].filter(Boolean))
        ]),

      mode === "buyer" &&
        delivery?.assignedRiderId &&
        riderPhoneDigits &&
        el(
          "div",
          {
            key: "chat-strip",
            className: compactMap ? "border-t border-slate-100 px-3 py-2 sm:px-4 dark:border-white/10" : "border-t border-slate-100 px-4 py-4 sm:px-6 dark:border-white/10"
          },
          el(
            "a",
            {
              href: `sms:${riderPhoneDigits}?body=${encodeURIComponent(`Campus Mart order ${orderShort} · `)}`,
              className: compactMap
                ? "flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 text-[11px] font-semibold text-sky-600 shadow-sm transition hover:border-sky-300 hover:bg-sky-50/50 dark:border-white/15 dark:bg-night-900 dark:text-sky-400 dark:hover:bg-night-800"
                : "flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white py-3.5 text-sm font-bold text-sky-600 shadow-sm transition hover:border-sky-300 hover:bg-sky-50/50 dark:border-white/15 dark:bg-night-900 dark:text-sky-400 dark:hover:bg-night-800"
            },
            [el(MessageCircle, { key: "i", className: compactMap ? "h-4 w-4" : "h-5 w-5" }), "Chat with rider"]
          )
        )
    ])
  ]);
}
