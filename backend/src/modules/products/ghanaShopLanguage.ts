/**
 * Map casual Ghana English, Pidgin, and common Twi phrases to catalogue-friendly search text.
 * Applied before synonym expansion and optional Groq — not a full translation engine.
 */

const PHRASE_REWRITES: { pattern: RegExp; append: string }[] = [
  { pattern: /\b(me\s+p[ɛe]\s+aduan|mepaakyew.*aduan|p[ɛe]\s+aduan)\b/i, append: "food hungry eat" },
  { pattern: /\b(chale|chalee).*(chop|eat|food|hungry)\b/i, append: "food eat hungry" },
  { pattern: /\b(i\s+wan(t)?\s+chop|wan\s+chop|make\s+i\s+chop|something\s+to\s+chop)\b/i, append: "food eat" },
  { pattern: /\b(something\s+warm|keep\s+me\s+warm|cold\s+weather|harmattan)\b/i, append: "jacket sweater hoodie warm clothing" },
  { pattern: /\b(something\s+nice\s+to\s+wear|outfit|dress\s+up|go\s+out)\b/i, append: "fashion clothes dress" },
  { pattern: /\b(phone\s+charger|charge\s+my\s+phone|power\s+bank|powerbank)\b/i, append: "charger powerbank electronics" },
  { pattern: /\b(hair\s+stuff|do\s+my\s+hair|braids?|weave|wig)\b/i, append: "beauty hair braids weave" },
  { pattern: /\b(book\s+for\s+class|textbook|course\s+material)\b/i, append: "books academic textbook" },
  { pattern: /\b(kicks|trainers|sneakers)\b/i, append: "shoes sneakers fashion" },
  { pattern: /\b(fix\s+my\s+phone|phone\s+repair|laptop\s+repair)\b/i, append: "services repair electronics" },
  { pattern: /\b(waakye|jollof|banku|fufu|kenkey|kelewele|gari)\b/i, append: "food" }
];

/** Normalize shopper text for search + assistant (Ghana-local language). */
export function normalizeGhanaShopperQuery(raw: string): string {
  let q = String(raw || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!q) return q;

  const extras = new Set<string>();
  for (const { pattern, append } of PHRASE_REWRITES) {
    if (pattern.test(q)) {
      for (const w of append.split(/\s+/)) extras.add(w);
    }
  }

  if (!extras.size) return q.slice(0, 280);
  return `${q} ${[...extras].join(" ")}`.replace(/\s+/g, " ").trim().slice(0, 280);
}
