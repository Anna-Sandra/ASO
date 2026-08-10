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
  Maximize2,
  MessageCircle,
  Minus,
  Phone,
  Plus,
  Sparkles,
  X
} from "lucide-react";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import "leaflet/dist/leaflet.css";
import { apiFetch, apiErrorMessage } from "services/api";
import { openDeliverySocket } from "services/deliverySocket";
import { formatGhc } from "utils/money";
import { useTheme } from "context";

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
  `<div style="display:flex;width:44px;height:44px;border-radius:14px;background:linear-gradient(145deg,#16a34a,#22c55e);align-items:center;justify-content:center;box-shadow:0 10px 24px rgba(22,163,74,.38);border:3px solid #fff;"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/><path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2"/><path d="M14 21V7"/></svg></div>`,
  [44, 44],
  [22, 44]
);

const RIDER_MARKER_ICON = divMarker(
  `<div class="delivery-rider-marker-pulse" style="display:flex;width:46px;height:46px;border-radius:999px;background:linear-gradient(145deg,#f97316,#ea580c);align-items:center;justify-content:center;border:3px solid #fff;"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M5 18h2"/><path d="M17 18h2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/><path d="M9 18V8l4-3 5 3v10"/><path d="M9 11h8"/></svg></div>`,
  [46, 46],
  [23, 23]
);

const CUSTOMER_MARKER_ICON = divMarker(
  `<div style="display:flex;width:44px;height:44px;border-radius:999px;background:linear-gradient(145deg,#ef4444,#dc2626);align-items:center;justify-content:center;box-shadow:0 10px 22px rgba(239,68,68,.38);border:3px solid #fff;"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div>`,
  [44, 44],
  [22, 44]
);

/** @typedef {"buyer" | "rider"} DeliveryLiveMode */
/** @typedef {"default" | "trackModal" | "embedded"} DeliveryLiveVariant */

const LIGHT_TILE = {
  url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  attribution: '&copy; <a href="https://carto.com/">CARTO</a> · OSM'
};

const DARK_TILE = {
  url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  attribution: '&copy; <a href="https://carto.com/">CARTO</a> · OSM'
};

function haversineKm(aLat, aLng, bLat, bLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function bearingDeg(aLat, aLng, bLat, bLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const φ1 = toRad(aLat);
  const φ2 = toRad(bLat);
  const Δλ = toRad(bLng - aLng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function navHintFromBearing(deg) {
  if (deg >= 337.5 || deg < 22.5) return { icon: "↑", label: "Continue straight" };
  if (deg < 67.5) return { icon: "↗", label: "Bear right" };
  if (deg < 112.5) return { icon: "→", label: "Turn right" };
  if (deg < 157.5) return { icon: "↘", label: "Bear right" };
  if (deg < 202.5) return { icon: "↓", label: "U-turn ahead" };
  if (deg < 247.5) return { icon: "↙", label: "Bear left" };
  if (deg < 292.5) return { icon: "←", label: "Turn left" };
  return { icon: "↖", label: "Bear left" };
}

const TIMELINE_STAGES = [
  { key: "order_placed", label: "Order placed", rank: 0 },
  { key: "confirmed", label: "Vendor accepted", rank: 1 },
  { key: "preparing", label: "Preparing", rank: 2 },
  { key: "ready_for_pickup", label: "Ready for pickup", rank: 3 },
  { key: "rider_assigned", label: "Rider assigned", rank: 4, virtual: true },
  { key: "picked_up", label: "Picked up", rank: 5 },
  { key: "on_the_way", label: "On the way", rank: 6 },
  { key: "delivered", label: "Delivered", rank: 7 }
];

/** @deprecated use TIMELINE_STAGES */
const STAGE_LABELS = Object.fromEntries(TIMELINE_STAGES.map((s) => [s.key, s.label]));
STAGE_LABELS.cancelled = "Cancelled";

/** @deprecated use TIMELINE_STAGES */
const STAGE_ORDER = TIMELINE_STAGES.filter((s) => !s.virtual).map((s) => s.key);

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

function formatDeliveredAt(at) {
  try {
    const d = new Date(at);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

function maskPhone(phone) {
  const raw = String(phone || "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 6) return raw;
  const local = digits.length >= 10 ? digits.slice(-10) : digits;
  return `${local.slice(0, 3)} XXX ${local.slice(-4)}`;
}

/** @param {{ currentStage?: string; assignedRiderId?: string | null }} delivery */
function getTimelineRank(delivery) {
  const st = delivery?.currentStage || "order_placed";
  if (st === "cancelled") return -1;
  const byStage = {
    order_placed: 0,
    confirmed: 1,
    preparing: 2,
    ready_for_pickup: 3,
    picked_up: 5,
    on_the_way: 6,
    delivered: 7
  };
  if (st === "delivered") return 7;
  if (st === "on_the_way") return 6;
  if (st === "picked_up") return 5;
  if (delivery?.assignedRiderId && (st === "ready_for_pickup" || (byStage[st] ?? 0) <= 3)) return 4;
  return byStage[st] ?? 0;
}

/** @param {{ history: Array<{ stage: string; at?: string | Date; note?: string }> }} p */
function timelineTimeFor(delivery, stageKey, history) {
  if (stageKey === "rider_assigned") {
    if (delivery?.riderAssignedAt) return formatClock(delivery.riderAssignedAt);
    const hit = [...(history || [])].find((x) => String(x.note || "").toLowerCase().includes("rider assigned"));
    return hit?.at ? formatClock(hit.at) : "";
  }
  return timeForStage({ history }, stageKey);
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

/** Floating zoom + locate + fullscreen (theme-aware). */
function MapFloatingControls({ mode, dark }) {
  const map = useMap();
  const [locErr, setLocErr] = useState("");
  const btn =
    dark
      ? "flex h-10 w-10 items-center justify-center border border-white/15 bg-night-900/95 text-slate-100 shadow-lg backdrop-blur transition hover:bg-night-800"
      : "flex h-10 w-10 items-center justify-center border border-slate-200/90 bg-white text-slate-700 shadow-lg transition hover:bg-slate-50";

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

  const toggleFs = () => {
    const el = map.getContainer()?.parentElement;
    if (!el) return;
    if (!document.fullscreenElement) {
      void el.requestFullscreen?.();
    } else {
      void document.exitFullscreen?.();
    }
  };

  return el(
    "div",
    {
      className:
        "pointer-events-none absolute bottom-4 right-4 z-[600] flex flex-col gap-2 [&_button]:pointer-events-auto",
      style: { zIndex: 600 }
    },
    [
      el(
        "button",
        {
          key: "fs",
          type: "button",
          title: "Fullscreen",
          onClick: toggleFs,
          className: `${btn} rounded-xl`
        },
        el(Maximize2, { className: "h-4 w-4" })
      ),
      el(
        "button",
        {
          key: "loc",
          type: "button",
          title: mode === "rider" ? "My location" : "Locate me",
          onClick: locate,
          className: `${btn} rounded-xl`
        },
        el(Crosshair, { className: "h-[18px] w-[18px]" })
      ),
      el(
        "div",
        { key: "zoom", className: "flex flex-col overflow-hidden rounded-xl shadow-lg" },
        [
          el(
            "button",
            {
              key: "zin",
              type: "button",
              title: "Zoom in",
              onClick: () => map.zoomIn(),
              className: `${btn} rounded-none border-b-0`
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
              className: `${btn} rounded-none`
            },
            el(Minus, { className: "h-[18px] w-[18px]" })
          )
        ]
      ),
      locErr ? el("p", { key: "err", className: "max-w-[9rem] text-[10px] font-medium text-rose-500" }, locErr) : null
    ].filter(Boolean)
  );
}

/**
 * @param {{ mode: DeliveryLiveMode; accessToken: string; orderId: string; className?: string; variant?: DeliveryLiveVariant }} props
 */
export function DeliveryLive({ mode, accessToken, orderId, className, variant = "default", onUpdate, guestSecret }) {
  const { dark } = useTheme();
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState("");
  const [busyStage, setBusyStage] = useState("");
  const [geoSharing, setGeoSharing] = useState(false);
  const [geoErr, setGeoErr] = useState("");
  /** Live browser GPS for the rider map (optimistic; also posted to API). */
  const [liveRiderPos, setLiveRiderPos] = useState(/** @type {null | [number, number]} */ (null));
  /** @type {React.MutableRefObject<any>} */
  const watchRef = useRef(null);
  const lastSocketEmitRef = useRef(0);
  const socketRef = useRef(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const [lastLivePulse, setLastLivePulse] = useState(0);
  const [showDeliverOtp, setShowDeliverOtp] = useState(false);
  const [deliveryOtp, setDeliveryOtp] = useState("");
  const [receivedByName, setReceivedByName] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [resendingOtp, setResendingOtp] = useState(false);

  const authHeaders = useCallback(() => {
    const headers = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    else if (guestSecret) headers["X-Guest-Order-Secret"] = guestSecret;
    return headers;
  }, [accessToken, guestSecret]);

  const canLoad = Boolean(orderId && (accessToken || guestSecret));

  const loadBundle = useCallback(async () => {
    const d = await apiFetch(`/api/deliveries/order/${encodeURIComponent(orderId)}`, {
      headers: authHeaders()
    });
    setBundle(d);
    return d;
  }, [authHeaders, orderId]);

  useEffect(() => {
    if (!canLoad) return undefined;
    let cancelled = false;
    setFetchErr("");
    setLoading(true);
    loadBundle()
      .catch((ex) => {
        if (!cancelled) setFetchErr(apiErrorMessage(ex, "We could not load delivery tracking. Try refreshing the page."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canLoad, loadBundle]);

  useEffect(() => {
    if (!canLoad) return undefined;
    const s = openDeliverySocket(
      accessToken || "",
      !accessToken && guestSecret ? { guestSecret, guestOrderId: orderId } : undefined
    );
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

    const onUpdateEvt = (p) => {
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
    s.on("delivery:update", onUpdateEvt);

    // Guests (and flaky sockets): refresh bundle periodically so the map still moves.
    const pollMs = accessToken ? 20000 : 8000;
    const pollId = setInterval(() => {
      void loadBundle().catch(() => {});
    }, pollMs);

    return () => {
      clearInterval(pollId);
      s.off("connect", onConn);
      s.off("disconnect", onDisc);
      s.off("delivery:location", onLoc);
      s.off("delivery:update", onUpdateEvt);
      s.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, guestSecret, orderId, canLoad, loadBundle]);

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
      setBundle((prev) => {
        if (!prev?.delivery) return prev;
        return {
          ...prev,
          delivery: {
            ...prev.delivery,
            riderLatitude: lat,
            riderLongitude: lng,
            riderLocationUpdatedAt: new Date().toISOString()
          }
        };
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
        setLiveRiderPos([lat, lng]);
        setGeoErr("");
        emitRiderCoords(lat, lng);
        void postRiderCoords(lat, lng).catch((ex) => {
          setGeoErr(apiErrorMessage(ex, "Could not share your GPS. Check location permission."));
        });
      },
      () => setGeoErr("Location permission denied or unavailable. Allow location for this site."),
      { enableHighAccuracy: true, maximumAge: 8000, timeout: 20000 }
    );
    return () => {
      if (watchRef.current != null && typeof navigator.geolocation?.clearWatch === "function") {
        navigator.geolocation.clearWatch(watchRef.current);
      }
      watchRef.current = null;
    };
  }, [geoSharing, mode, emitRiderCoords, postRiderCoords]);

  // Auto-start live GPS for riders on an active delivery so the map shows you → customer.
  useEffect(() => {
    if (mode !== "rider") return;
    const st = bundle?.delivery?.currentStage;
    if (!st || st === "delivered" || st === "cancelled") return;
    setGeoSharing(true);
  }, [mode, bundle?.delivery?.currentStage, orderId]);

  useEffect(() => {
    setLiveRiderPos(null);
  }, [orderId]);
  const patchStage = async (stage, proof) => {
    setBusyStage(stage);
    try {
      const body = { stage };
      if (proof) {
        if (proof.deliveryOtp) body.deliveryOtp = proof.deliveryOtp;
        if (proof.receivedByName) body.receivedByName = proof.receivedByName;
        if (proof.deliveryNote) body.deliveryNote = proof.deliveryNote;
      }
      const { delivery } = await apiFetch(`/api/deliveries/order/${encodeURIComponent(orderId)}/stage`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: body
      });
      setBundle((prev) => (prev ? { ...prev, delivery } : prev));
      setShowDeliverOtp(false);
      setDeliveryOtp("");
      setReceivedByName("");
      setDeliveryNote("");
      if (typeof onUpdate === "function") onUpdate({ delivery, stage });
    } catch (ex) {
      setGeoErr(apiErrorMessage(ex, "Could not update delivery status. Try again."));
    } finally {
      setBusyStage("");
    }
  };

  const resendCustomerOtp = async () => {
    setResendingOtp(true);
    setGeoErr("");
    try {
      await apiFetch(`/api/deliveries/order/${encodeURIComponent(orderId)}/resend-delivery-otp`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        json: {}
      });
      await loadBundle();
    } catch (ex) {
      setGeoErr(apiErrorMessage(ex, "Could not resend the code. Check the order has a customer phone or email."));
    } finally {
      setResendingOtp(false);
    }
  };

  const submitDeliveryOtp = async () => {
    const code = deliveryOtp.replace(/\D/g, "");
    if (code.length !== 6) {
      setGeoErr("Enter the 6-digit code from the customer.");
      return;
    }
    setBusyStage("delivered");
    setGeoErr("");
    try {
      await patchStage("delivered", {
        deliveryOtp: code,
        receivedByName: receivedByName.trim(),
        deliveryNote: deliveryNote.trim()
      });
    } catch (ex) {
      setGeoErr(apiErrorMessage(ex, "Could not complete delivery. Check the code and try again."));
      setBusyStage("");
    }
  };

  const delivery = bundle?.delivery;
  const rider = bundle?.rider;
  const order = bundle?.order;

  const serverRl = typeof delivery?.riderLatitude === "number" ? delivery.riderLatitude : null;
  const serverRln = typeof delivery?.riderLongitude === "number" ? delivery.riderLongitude : null;
  const rl = liveRiderPos?.[0] ?? serverRl;
  const rln = liveRiderPos?.[1] ?? serverRln;
  const dl = typeof delivery?.dropoffLatitude === "number" ? delivery.dropoffLatitude : null;
  const dln = typeof delivery?.dropoffLongitude === "number" ? delivery.dropoffLongitude : null;

  const vendorApprox = useMemo(() => {
    // Only show a pickup pin once we know both courier + drop-off (heuristic offset).
    if (rl == null || rln == null || dl == null || dln == null) return null;
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
    if (rl != null && rln != null) pts.push([rl, rln]);
    if (dl != null && dln != null) pts.push([dl, dln]);
    const z = pts.length >= 2 ? 14 : 13;
    return { center: [lat, lng], zoom: z, fitPoints: pts };
  }, [rl, rln, dl, dln]);

  const riderNextActions = () => {
    const st = delivery?.currentStage;
    if (!st || st === "delivered" || st === "cancelled") return [];
    if (st === "on_the_way") return [{ stage: "delivered", label: "Mark delivered" }];
    if (st === "picked_up") return [{ stage: "on_the_way", label: "On the way" }];
    // Any earlier stage (order placed → ready for pickup): rider can mark pickup
    return [{ stage: "picked_up", label: "Mark picked up" }];
  };

  const wrapCls = className || "";
  const omitPageHeader = variant === "trackModal" || variant === "embedded";
  const compactMap = variant === "trackModal";
  /** Timeline + delivery side panel stay dense on full page too (map/summary bands still follow {@link compactMap}). */
  const compactPanels = true;
  const recentLive =
    (mode === "buyer" && Date.now() - lastLivePulse < 12000) ||
    (mode === "rider" && liveRiderPos != null);

  /** Primary route: rider → customer drop-off. */
  const routeToCustomer = useMemo(() => {
    if (rl != null && rln != null && dl != null && dln != null) return [[rl, rln], [dl, dln]];
    return null;
  }, [rl, rln, dl, dln]);

  const pickupToRider = useMemo(() => {
    if (vendorApprox && rl != null && rln != null) return [vendorApprox, [rl, rln]];
    return null;
  }, [vendorApprox, rl, rln]);
  const orderShort = `#${String(orderId).slice(-8).toUpperCase()}`;
  const statusLabel = delivery ? STAGE_LABELS[delivery.currentStage] || delivery.currentStage : "";
  const timelineRank = getTimelineRank(delivery);
  const isDeliveredFinal = delivery?.currentStage === "delivered";

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

  if (!canLoad) {
    return el(
      "p",
      { className: `text-sm font-medium text-amber-700 dark:text-amber-200 ${wrapCls}` },
      "Open Track order from the same browser you used to pay (guest checkout), or sign in with the email on the order."
    );
  }

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
        "Delivery tracking appears here once your order is paid and the seller enables delivery for it."
      ])
    );
  }

  const mapHeightClass = compactMap
    ? "h-[200px] min-h-[180px] sm:h-[220px]"
    : variant === "embedded"
      ? "h-[min(62vw,520px)] min-h-[300px] sm:min-h-[380px]"
      : "h-[min(52vw,420px)] min-h-[280px] sm:min-h-[320px]";

  const timelineBody = TIMELINE_STAGES.map((stageDef, idx) => {
    const stageKey = stageDef.key;
    const rank = stageDef.rank;
    const active = timelineRank === rank && !isDeliveredFinal && delivery.currentStage !== "cancelled";
    const done = timelineRank > rank || (isDeliveredFinal && rank <= timelineRank);
    const pending = !(done || active);
    const tclock = done || active ? timelineTimeFor(delivery, stageKey, historySortedChrono) : "";

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
            idx < TIMELINE_STAGES.length - 1
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
            el("p", { className: tlTitleCls }, stageDef.label),
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
        {
          key: "map-slot",
          className: `delivery-map-shell relative bg-slate-100 dark:bg-night-950 ${mapHeightClass} w-full ring-1 ring-black/5 dark:ring-white/10`
        },
        [
          el(
            MapContainer,
            {
              center,
              zoom,
              scrollWheelZoom: true,
              zoomControl: false,
              className: "h-full w-full [&_.leaflet-pane]:transition-none"
            },
            fitPoints.length >= 2 ? el(FitDeliveryBounds, { points: fitPoints }) : el(MapRecenter, { center, zoom }),
            el(TileLayer, {
              key: dark ? "dark-tiles" : "light-tiles",
              attribution: dark ? DARK_TILE.attribution : LIGHT_TILE.attribution,
              url: dark ? DARK_TILE.url : LIGHT_TILE.url
            }),
            vendorApprox &&
              el(
                Marker,
                { position: vendorApprox, icon: VENDOR_MARKER_ICON },
                el(
                  Popup,
                  { className: "rounded-xl" },
                  el("div", { className: "text-sm font-semibold text-emerald-800" }, vendorTooltip || "Vendor"),
                  el("p", { className: "mt-1 text-xs text-slate-500" }, "Pickup point")
                )
              ),
            rl != null && rln != null
              ? el(
                  Marker,
                  {
                    key: `rider-${rl.toFixed(5)}-${rln.toFixed(5)}`,
                    position: [rl, rln],
                    icon: RIDER_MARKER_ICON,
                    zIndexOffset: 800
                  },
                  el(
                    Popup,
                    { className: "rounded-xl" },
                    [
                      el("p", { key: "nm", className: "text-sm font-bold text-slate-900" }, rider?.displayName || (mode === "rider" ? "You (rider)" : "Courier")),
                      el(
                        "p",
                        { key: "vh", className: "mt-1 text-xs text-slate-600" },
                        liveRiderPos || recentLive
                          ? "Live GPS · moving"
                          : liveConnected
                            ? "Last known location"
                            : "Connecting…"
                      )
                    ]
                  )
                )
              : null,
            dl != null && dln != null
              ? el(
                  Marker,
                  { position: [dl, dln], icon: CUSTOMER_MARKER_ICON, zIndexOffset: 600 },
                  el(
                    Popup,
                    { className: "rounded-xl" },
                    [
                      el(
                        "p",
                        { key: "tit", className: "text-sm font-bold text-rose-700 dark:text-rose-300" },
                        delivery.dropoffLabel?.trim() || (mode === "buyer" ? "Your drop-off" : "Customer")
                      ),
                      el("p", { key: "dst", className: "mt-1 text-xs text-slate-600 dark:text-slate-400" }, "Delivery destination")
                    ]
                  )
                )
              : null,
            routeToCustomer &&
              el(Polyline, {
                key: "route-customer",
                positions: routeToCustomer,
                pathOptions: {
                  color: dark ? "#fb923c" : "#ea580c",
                  weight: 6,
                  opacity: 0.95,
                  lineCap: "round",
                  lineJoin: "round"
                }
              }),
            pickupToRider &&
              el(Polyline, {
                key: "route-pickup",
                positions: pickupToRider,
                pathOptions: {
                  color: dark ? "#38bdf8" : "#0ea5e9",
                  weight: 4,
                  opacity: 0.65,
                  dashArray: "6 10",
                  lineCap: "round"
                }
              }),
            el(MapFloatingControls, { mode, dark })
          ),
          mode === "rider" && (rl == null || rln == null)
            ? el(
                "div",
                {
                  key: "gps-wait",
                  className:
                    "pointer-events-none absolute inset-x-3 top-3 z-[520] rounded-xl border border-orange-300/50 bg-orange-500/95 px-3 py-2 text-center text-xs font-semibold text-white shadow-lg"
                },
                geoSharing
                  ? geoErr || "Getting your location… allow GPS in the browser to see you on the map."
                  : "Turn on Share my GPS to show your position and route to the customer."
              )
            : null,
          (() => {
            if (rl == null || rln == null || dl == null || dln == null) return null;
            const km = haversineKm(rl, rln, dl, dln);
            const m = Math.round(km * 1000);
            const brg = bearingDeg(rl, rln, dl, dln);
            const hint = navHintFromBearing(brg);
            const road = String(delivery?.dropoffLabel || "").trim() || "Toward customer";
            return el(
              "div",
              {
                key: "nav-card",
                className:
                  "pointer-events-none absolute left-3 top-3 z-[500] max-w-[min(100%,18rem)] rounded-2xl border border-white/15 bg-slate-950/90 px-3 py-2.5 text-white shadow-xl backdrop-blur-md dark:bg-black/80"
              },
              [
                el("div", { key: "row", className: "flex items-center gap-3" }, [
                  el(
                    "div",
                    {
                      key: "ic",
                      className:
                        "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-lg font-black shadow-lg shadow-orange-900/40"
                    },
                    hint.icon
                  ),
                  el("div", { key: "tx", className: "min-w-0" }, [
                    el("p", { className: "text-sm font-bold leading-tight" }, hint.label),
                    el(
                      "p",
                      { className: "mt-0.5 text-xs font-semibold text-orange-300" },
                      m >= 1000 ? `${km.toFixed(1)} km` : `${m} m`
                    ),
                    el("p", { className: "mt-0.5 truncate text-[11px] text-slate-300" }, road)
                  ])
                ]),
                el("p", { key: "then", className: "mt-2 border-t border-white/10 pt-2 text-[11px] text-slate-400" }, [
                  el("span", { className: "mr-1 font-semibold text-slate-200" }, "Then"),
                  "Continue to drop-off"
                ])
              ]
            );
          })(),
          el(
            "div",
            {
              key: "legend",
              className: compactMap
                ? "pointer-events-none absolute bottom-3 left-2 z-[500] rounded-lg border border-white/80 bg-white/95 px-2 py-1.5 text-[10px] shadow-md backdrop-blur-sm dark:border-white/10 dark:bg-night-900/92"
                : "pointer-events-none absolute bottom-4 left-4 z-[500] rounded-xl border border-white/80 bg-white/95 px-3 py-2.5 text-[11px] shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-night-900/92"
            },
            [
              el("p", { className: compactMap ? "mb-1 text-[9px] font-bold uppercase tracking-wider text-slate-400" : "mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400" }, "Legend"),
              el(
                "div",
                { className: compactMap ? "flex flex-col gap-1 text-slate-700 dark:text-slate-200" : "flex flex-col gap-1.5 text-slate-700 dark:text-slate-200" },
                [
                  ["bg-emerald-500", "Vendor"],
                  ["bg-orange-500", "Rider"],
                  ["bg-rose-500", mode === "buyer" ? "You" : "Customer"]
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
                "Delivery timeline"
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
                          `Rider: ${rider.displayName || "Courier"}`
                        ),
                        rider.vehicleType
                          ? el(
                              "p",
                              { className: "mt-0.5 text-[10px] text-slate-500 dark:text-slate-400" },
                              `Vehicle: ${String(rider.vehicleType)}`
                            )
                          : null,
                        riderPhoneDigits
                          ? el(
                              "p",
                              {
                                key: "tel",
                                className: "mt-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300"
                              },
                              `Phone: ${mode === "buyer" ? maskPhone(rider.phone) : rider.phone}`
                            )
                          : null,
                        riderPhoneDigits && mode === "buyer"
                          ? el(
                              "a",
                              {
                                key: "tel-link",
                                href: `tel:${riderPhoneDigits}`,
                                className:
                                  "mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-sky-600 hover:text-sky-700 dark:text-sky-400"
                              },
                              el(Phone, { className: "h-3 w-3 shrink-0" }),
                              "Call rider"
                            )
                          : riderPhoneDigits
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

            isDeliveredFinal &&
              el(
                "div",
                {
                  key: "proof-card",
                  className:
                    "rounded-lg border border-emerald-200/80 bg-emerald-50/60 p-2.5 dark:border-emerald-900/50 dark:bg-emerald-950/25"
                },
                [
                  el("p", { className: "text-[9px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-200" }, "Delivery confirmed"),
                  delivery.deliveredAt
                    ? el("p", { key: "at", className: "mt-1 text-[11px] text-slate-700 dark:text-slate-200" }, [
                        el("span", { className: "font-semibold" }, "Delivered at: "),
                        formatDeliveredAt(delivery.deliveredAt)
                      ])
                    : null,
                  el(
                    "p",
                    { key: "otp-note", className: "mt-1 text-[11px] text-slate-600 dark:text-slate-300" },
                    "Verified with the customer’s delivery code (no photo stored)."
                  ),
                  delivery.receivedByName
                    ? el("p", { key: "recv", className: "mt-1 text-[11px] text-slate-700 dark:text-slate-200" }, [
                        el("span", { className: "font-semibold" }, "Received by: "),
                        delivery.receivedByName
                      ])
                    : null,
                  delivery.deliveryNote
                    ? el("p", { key: "note", className: "mt-1 text-[11px] text-slate-700 dark:text-slate-200" }, delivery.deliveryNote)
                    : null,
                  delivery.proofPhotoUrl
                    ? el("div", { key: "photo", className: "mt-2" }, [
                        el("p", { className: "text-[10px] font-semibold text-slate-600 dark:text-slate-300" }, "Legacy photo:"),
                        el("img", {
                          src: delivery.proofPhotoUrl,
                          alt: "Delivery proof",
                          className: "mt-1 max-h-36 w-full rounded-lg border border-white/80 object-cover shadow-sm dark:border-white/10"
                        })
                      ])
                    : null
                ].filter(Boolean)
              ),

            mode === "buyer" &&
              delivery?.currentStage === "on_the_way" &&
              !isDeliveredFinal &&
              el(
                "div",
                {
                  key: "buyer-otp",
                  className:
                    "rounded-lg border border-amber-200/90 bg-amber-50/90 p-2.5 dark:border-amber-900/50 dark:bg-amber-950/30"
                },
                [
                  el("p", { className: "text-[9px] font-bold uppercase tracking-wider text-amber-900 dark:text-amber-100" }, "Delivery code"),
                  el(
                    "p",
                    { className: "mt-1 text-[11px] leading-relaxed text-amber-950 dark:text-amber-50" },
                    delivery.deliveryOtpSentAt
                      ? "We sent a 6-digit code to your phone and/or email. Do not share it until you have your order. Only give it to the rider when they arrive."
                      : "Your rider is on the way. You will receive a 6-digit code by SMS or email shortly — keep it private until you have your items."
                  ),
                  delivery.deliveryOtpSentAt
                    ? el(
                        "p",
                        { key: "sent-at", className: "mt-1 text-[10px] text-amber-800/90 dark:text-amber-200/80" },
                        `Sent ${formatDeliveredAt(delivery.deliveryOtpSentAt)} · expires in 30 minutes`
                      )
                    : null
                ].filter(Boolean)
              ),

            mode === "buyer" &&
              itemsList.length > 0 &&
              el(
                "div",
                {
                  key: "order-card",
                  className:
                    "rounded-lg border border-slate-100 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-night-900/70"
                },
                [
                  el(
                    "p",
                    {
                      className: "text-[9px] font-bold uppercase tracking-wider text-slate-400"
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
                      className:
                        "mt-1 flex items-center justify-between border-t border-slate-200 pt-2 dark:border-white/10"
                    },
                    [
                      el(
                        "span",
                        { className: "text-[10px] font-semibold text-slate-900 dark:text-white" },
                        "Total"
                      ),
                      el(
                        "span",
                        { className: "text-xs font-bold text-emerald-600 dark:text-emerald-400" },
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
                    "rounded-2xl border border-orange-200/80 bg-orange-50/90 p-4 dark:border-orange-900/50 dark:bg-orange-950/30"
                },
                [
                  el("p", { className: "text-xs font-bold uppercase tracking-wide text-orange-900 dark:text-orange-200" }, "Rider controls"),
                  !showDeliverOtp
                    ? el("div", { key: "acts", className: "mt-3 flex flex-wrap gap-2" }, [
                        ...riderNextActions().map((a) =>
                          el(
                            "button",
                            {
                              key: a.stage,
                              type: "button",
                              disabled: Boolean(busyStage),
                              className:
                                "rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-orange-900/20 hover:brightness-105 disabled:opacity-60",
                              onClick: () =>
                                a.stage === "delivered" ? setShowDeliverOtp(true) : patchStage(a.stage)
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
                      ])
                    : el("div", { key: "otp-form", className: "mt-3 space-y-3" }, [
                        el(
                          "p",
                          { className: "text-xs leading-relaxed text-amber-950 dark:text-amber-100" },
                          "Enter the customer’s 6-digit delivery code to mark delivered. The code was sent when you went on the way."
                        ),
                        delivery.deliveryOtpSentAt
                          ? el(
                              "p",
                              { key: "sent", className: "text-[11px] text-emerald-800 dark:text-emerald-200" },
                              `Code sent ${formatDeliveredAt(delivery.deliveryOtpSentAt)}`
                            )
                          : null,
                        el("label", { key: "otp-l", className: "block text-[11px] font-semibold text-slate-700 dark:text-slate-200" }, [
                          "Customer code",
                          el("input", {
                            type: "text",
                            inputMode: "numeric",
                            pattern: "[0-9]*",
                            maxLength: 6,
                            value: deliveryOtp,
                            onChange: (e) => setDeliveryOtp(e.target.value.replace(/\D/g, "").slice(0, 6)),
                            placeholder: "6-digit code",
                            className:
                              "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-center text-lg font-bold tracking-[0.35em] dark:border-white/15 dark:bg-night-950 dark:text-white"
                          })
                        ]),
                        el(
                          "button",
                          {
                            key: "resend",
                            type: "button",
                            disabled: resendingOtp || Boolean(busyStage),
                            className: "text-[11px] font-semibold text-sky-700 underline dark:text-sky-300",
                            onClick: () => void resendCustomerOtp()
                          },
                          resendingOtp ? "Resending code…" : "Resend code to customer"
                        ),
                        el("label", { key: "recv-l", className: "block text-[11px] font-semibold text-slate-700 dark:text-slate-200" }, [
                          "Received by (optional)",
                          el("input", {
                            type: "text",
                            value: receivedByName,
                            onChange: (e) => setReceivedByName(e.target.value),
                            placeholder: "Customer name",
                            maxLength: 120,
                            className:
                              "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-night-950 dark:text-white"
                          })
                        ]),
                        el("label", { key: "note-l", className: "block text-[11px] font-semibold text-slate-700 dark:text-slate-200" }, [
                          "Delivery note (optional)",
                          el("textarea", {
                            value: deliveryNote,
                            onChange: (e) => setDeliveryNote(e.target.value),
                            placeholder: "e.g. Left with hostel porter",
                            maxLength: 500,
                            rows: 2,
                            className:
                              "mt-1 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-night-950 dark:text-white"
                          })
                        ]),
                        el("div", { key: "btns", className: "flex flex-wrap gap-2" }, [
                          el(
                            "button",
                            {
                              type: "button",
                              disabled: Boolean(busyStage),
                              className:
                                "flex-1 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-orange-900/20 hover:brightness-105 disabled:opacity-60",
                              onClick: submitDeliveryOtp
                            },
                            busyStage === "delivered" ? "Submitting…" : "Mark delivered"
                          ),
                          el(
                            "button",
                            {
                              type: "button",
                              disabled: Boolean(busyStage),
                              className:
                                "rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-white/15 dark:bg-night-950 dark:text-slate-200",
                              onClick: () => {
                                setShowDeliverOtp(false);
                                setDeliveryOtp("");
                                setGeoErr("");
                              }
                            },
                            "Cancel"
                          )
                        ])
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
            className: "border-t border-slate-100 px-3 py-2 sm:px-4 dark:border-white/10"
          },
          el(
            "a",
            {
              href: `sms:${riderPhoneDigits}?body=${encodeURIComponent(`SHOPIQGH order ${orderShort} · `)}`,
              className:
                "flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 text-[11px] font-semibold text-sky-600 shadow-sm transition hover:border-sky-300 hover:bg-sky-50/50 dark:border-white/15 dark:bg-night-900 dark:text-sky-400 dark:hover:bg-night-800"
            },
            [el(MessageCircle, { key: "i", className: "h-4 w-4" }), "Chat with rider"]
          )
        )
    ])
  ]);
}
