export type FileKind = "jpeg" | "png" | "webp" | "gif" | "pdf";

/** Sniff allowed file types from the first bytes (do not trust Content-Type alone). */
export function detectFileKind(buf: Buffer): FileKind | null {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.length >= 6 && buf.slice(0, 3).toString("ascii") === "GIF") return "gif";
  if (
    buf.length >= 12 &&
    buf.slice(0, 4).toString("ascii") === "RIFF" &&
    buf.slice(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  if (buf.slice(0, 4).toString("ascii") === "%PDF") return "pdf";
  return null;
}

export function fileKindAllowed(kind: FileKind | null, allowed: readonly FileKind[]): kind is FileKind {
  return kind != null && allowed.includes(kind);
}
