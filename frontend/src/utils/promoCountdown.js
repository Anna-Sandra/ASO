import { useEffect, useState } from "react";

const ONE_HOUR_SEC = 3600;

/** Ongoing discount deals use a far-future backend `endsAt`; hide flash-style timers for those. */
export function isPerpetualPromoEnd(endsAtIso) {
  if (!endsAtIso) return false;
  try {
    return new Date(String(endsAtIso)).getFullYear() >= 2090;
  } catch {
    return false;
  }
}

/**
 * Compact copy for product cards (e.g. "2h 34m left").
 * @param {number} secondsLeft
 */
export function humanCountdownBrief(secondsLeft) {
  if (secondsLeft <= 0) return "Ended";
  const d = Math.floor(secondsLeft / 86400);
  const hh = Math.floor((secondsLeft % 86400) / 3600);
  const mm = Math.floor((secondsLeft % 3600) / 60);
  const ss = secondsLeft % 60;
  if (d > 0) return `${d}d ${hh}h left`;
  if (hh > 0) return `${hh}h ${mm}m left`;
  if (mm > 0) return `${mm}m left`;
  return `${ss}s left`;
}

/**
 * Countdown for promotion end times. `urgent` is true when under 1 hour (flash-deal UX).
 * @param {string | null | undefined} endsAtIso
 */
export function usePromoCountdown(endsAtIso) {
  const [left, setLeft] = useState(0);

  useEffect(() => {
    const end = endsAtIso ? new Date(endsAtIso).getTime() : 0;
    const tick = () => {
      const ms = Math.max(0, end - Date.now());
      setLeft(Math.floor(ms / 1000));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endsAtIso]);

  const hh = Math.floor(left / 3600);
  const mm = Math.floor((left % 3600) / 60);
  const ss = left % 60;
  const pad = (n) => String(n).padStart(2, "0");
  const text = `${pad(hh)}:${pad(mm)}:${pad(ss)}`;

  return {
    text,
    /** Under 1 hour remaining (flash deal urgency — red timer in UI). */
    urgent: left > 0 && left < ONE_HOUR_SEC,
    ended: left === 0,
    secondsLeft: left
  };
}
