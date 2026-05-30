import { useCallback, useEffect, useRef, useState } from "react";
import { sanitizeErrorMessage } from "utils/userFacingError";

const defaultOpts = { enableHighAccuracy: true, maximumAge: 8000, timeout: 15000 };

/**
 * Browser geolocation with optional live watch — used for vendor store pin, riders, buyers on maps.
 */
export function useGeolocation() {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState("");
  const [watching, setWatching] = useState(false);
  const watchIdRef = useRef(null);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current != null && typeof navigator.geolocation?.clearWatch === "function") {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setWatching(false);
  }, []);

  const applyPos = useCallback((pos) => {
    setPosition({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyM: pos.coords.accuracy,
      at: Date.now()
    });
    setError("");
  }, []);

  const getOnce = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const msg = "Location is not available in this browser. Use a phone or tablet with GPS, or enter your address manually.";
        setError(msg);
        reject(new Error(msg));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          applyPos(pos);
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: pos.coords.accuracy
          });
        },
        (err) => {
          const msg = sanitizeErrorMessage(
            err.message,
            "We could not get your location. Allow location permission in your browser settings, then tap Try again."
          );
          setError(msg);
          reject(new Error(msg));
        },
        defaultOpts
      );
    });
  }, [applyPos]);

  const startWatch = useCallback(
    (onUpdate) => {
      if (!navigator.geolocation) {
        setError("Location is not available in this browser. Enter your address manually instead.");
        return;
      }
      clearWatch();
      setWatching(true);
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const payload = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracyM: pos.coords.accuracy,
            at: Date.now()
          };
          applyPos(pos);
          onUpdate?.(payload);
        },
        (err) =>
          setError(
            sanitizeErrorMessage(err.message, "Location sharing stopped. Allow GPS permission and turn sharing on again.")
          ),
        defaultOpts
      );
    },
    [applyPos, clearWatch]
  );

  useEffect(() => () => clearWatch(), [clearWatch]);

  return { position, error, watching, getOnce, startWatch, clearWatch, setError };
}
