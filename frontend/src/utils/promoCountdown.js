import { useEffect, useState } from "react";
import { h } from "utils/h";

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

  const days = Math.floor(left / 86400);
  const hoursOfDay = Math.floor((left % 86400) / 3600);

  return {
    text,
    /** Under 1 hour remaining (flash deal urgency — red timer in UI). */
    urgent: left > 0 && left < ONE_HOUR_SEC,
    ended: left === 0,
    secondsLeft: left,
    days,
    hours: hoursOfDay,
    minutes: mm,
    seconds: ss
  };
}

function pad2(n) {
  return String(Math.max(0, n)).padStart(2, "0");
}

/**
 * HH / MM / SS (or D / H / M) countdown blocks for deal heroes and cards.
 * @param {{ secondsLeft: number; ended?: boolean; urgent?: boolean; compact?: boolean; className?: string }} props
 */
export function PromoTimerPills({ secondsLeft, ended = false, urgent = false, compact = false, className = "" }) {
  const s = Math.max(0, Number(secondsLeft) || 0);
  const d = Math.floor(s / 86400);
  const hh = Math.floor((s % 86400) / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const units =
    d > 0
      ? [
          { k: "d", v: pad2(d), l: "Days" },
          { k: "h", v: pad2(hh), l: "Hrs" },
          { k: "m", v: pad2(mm), l: "Min" }
        ]
      : [
          { k: "h", v: pad2(hh), l: "Hrs" },
          { k: "m", v: pad2(mm), l: "Min" },
          { k: "s", v: pad2(ss), l: "Sec" }
        ];

  const box = compact
    ? "min-w-[2.15rem] rounded-lg px-1.5 py-1"
    : "min-w-[2.6rem] rounded-xl px-2 py-1.5 sm:min-w-[3rem]";
  const num = compact
    ? "font-mono text-xs font-black tabular-nums sm:text-sm"
    : "font-mono text-sm font-black tabular-nums sm:text-base";
  const lab = compact ? "text-[8px] font-bold uppercase tracking-wider" : "text-[9px] font-bold uppercase tracking-wider";
  const tone = ended
    ? "bg-slate-900/55 text-white/80 ring-1 ring-white/15"
    : urgent
      ? "bg-rose-600 text-white shadow-md shadow-rose-900/40 ring-1 ring-white/20"
      : "bg-black/45 text-white ring-1 ring-white/25 backdrop-blur-sm";

  return h(
    "div",
    {
      className: `inline-flex items-end gap-1 ${className}`.trim(),
      "aria-label": ended ? "Deal ended" : "Time left"
    },
    units.map((u, i) =>
      h("div", { key: u.k, className: "flex items-end gap-1" }, [
        h("div", { className: `${box} text-center ${tone}` }, [
          h("div", { className: num }, ended ? "00" : u.v),
          h("div", { className: `${lab} opacity-80` }, u.l)
        ]),
        i < units.length - 1 ? h("span", { className: "mb-2 text-xs font-black text-white/70", "aria-hidden": true }, ":") : null
      ])
    )
  );
}
