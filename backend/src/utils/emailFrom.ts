/** Parse `Name <email@example.com>` or a bare email into Brevo/nodemailer sender fields. */
export function parseEmailFrom(from: string): { name: string; email: string } {
  const raw = (from || "").trim();
  const angled = raw.match(/^(.+?)\s*<([^>]+)>$/);
  if (angled) {
    const name = angled[1].trim().replace(/^["']|["']$/g, "");
    return { name: name || "SHOPIQGH", email: angled[2].trim().toLowerCase() };
  }
  if (raw.includes("@")) {
    return { name: "SHOPIQGH", email: raw.toLowerCase() };
  }
  return { name: raw || "SHOPIQGH", email: "" };
}
