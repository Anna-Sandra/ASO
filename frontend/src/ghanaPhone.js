import { h } from "./h";

/** National 9 digits only (strips non-digits, leading zeros). */
export function ghanaLocalDigitsOnly(raw) {
  return String(raw ?? "")
    .replace(/\D/g, "")
    .replace(/^0+/, "")
    .slice(0, 9);
}

/** `+233` + 9 digits, or empty if incomplete. */
export function formatGhanaPhoneE164(localDigits) {
  const d = ghanaLocalDigitsOnly(localDigits);
  return d.length === 9 ? `+233${d}` : "";
}

/** Load stored E.164 / mixed input into 9-digit local for the input field. */
export function ghanaLocalFromStored(full) {
  const s = String(full ?? "").trim();
  if (!s) return "";
  const digits = s.replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("233")) return digits.slice(3, 12);
  if (digits.length === 10 && digits.startsWith("0")) return digits.slice(1, 10);
  if (digits.length === 9) return digits;
  return ghanaLocalDigitsOnly(s);
}

/**
 * Same UX as checkout MoMo: fixed 🇬🇭 +233 + 9-digit national input.
 * `value` / `onChange` use the **local 9-digit** string only.
 */
export function GhanaPhoneField({ value, onChange, id, disabled, hint }) {
  return h("div", { className: "space-y-1.5" }, [
    h(
      "div",
      {
        className:
          "flex min-h-[48px] overflow-hidden rounded-2xl border border-slate-300/70 bg-white/70 shadow-inner dark:border-white/10 dark:bg-night-900/60"
      },
      [
        h(
          "span",
          {
            className:
              "flex shrink-0 items-center gap-2 border-r border-slate-300/70 px-3 text-sm text-slate-700 dark:border-white/10 dark:text-slate-200"
          },
          [
            h("span", { key: "flag", className: "text-lg leading-none", "aria-hidden": true }, "🇬🇭"),
            h("span", { key: "cc", className: "font-mono text-sm font-semibold" }, "+233")
          ]
        ),
        h("input", {
          id,
          className:
            "min-w-0 flex-1 border-0 bg-transparent px-3 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-100",
          value,
          onChange: (e) => onChange(ghanaLocalDigitsOnly(e.target.value)),
          placeholder: "24 123 4567",
          inputMode: "numeric",
          autoComplete: "tel-national",
          maxLength: 10,
          disabled: Boolean(disabled)
        })
      ]
    ),
    hint !== false &&
      h(
        "p",
        { key: "hint", className: "text-xs text-slate-500 dark:text-slate-400" },
        typeof hint === "string" ? hint : "9 digits after +233 (leading 0 optional)."
      )
  ].filter(Boolean));
}
