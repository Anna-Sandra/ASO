/**
 * Quick Brevo check: node scripts/test-brevo.mjs [recipient@email.com]
 * Requires BREVO_API_KEY and EMAIL_FROM (Gmail must be verified under Brevo → Senders).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

function parseFrom(from) {
  const raw = (from || "").trim();
  const m = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  if (raw.includes("@")) return { name: "SHOPIQGH", email: raw.toLowerCase() };
  return { name: raw || "SHOPIQGH", email: "" };
}

const apiKey = (process.env.BREVO_API_KEY || "").trim();
const sender = parseFrom(process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM || "");
const to = (process.argv[2] || sender.email || "").trim().toLowerCase();

if (!apiKey) {
  console.error("BREVO_API_KEY is missing in backend/.env");
  process.exit(1);
}
if (!sender.email) {
  console.error("Set EMAIL_FROM=SHOPIQGH <you@gmail.com> (verified in Brevo → Senders)");
  process.exit(1);
}
if (!to) {
  console.error("Usage: node scripts/test-brevo.mjs recipient@example.com");
  process.exit(1);
}

const res = await fetch("https://api.brevo.com/v3/smtp/email", {
  method: "POST",
  headers: {
    "api-key": apiKey,
    "Content-Type": "application/json",
    Accept: "application/json"
  },
  body: JSON.stringify({
    sender: { name: process.env.BREVO_SENDER_NAME?.trim() || sender.name, email: sender.email },
    to: [{ email: to }],
    subject: "SHOPIQGH Brevo test",
    htmlContent: `<p>Brevo is configured. ${new Date().toISOString()}</p>`
  })
});

const body = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error("Brevo failed:", body.message || body, `(HTTP ${res.status})`);
  process.exit(1);
}
console.log("Brevo OK — check inbox for:", to);
