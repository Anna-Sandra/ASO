import test from "node:test";
import assert from "node:assert/strict";
import { detectFileKind } from "./fileMagic";

test("detectFileKind identifies JPEG PNG GIF WebP PDF", () => {
  assert.equal(detectFileKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "jpeg");
  assert.equal(detectFileKind(Buffer.from([0x89, 0x50, 0x4e, 0x47])), "png");
  assert.equal(detectFileKind(Buffer.from("GIF89a", "ascii")), "gif");
  const webp = Buffer.alloc(12);
  webp.write("RIFF", 0, 4, "ascii");
  webp.write("WEBP", 8, 4, "ascii");
  assert.equal(detectFileKind(webp), "webp");
  assert.equal(detectFileKind(Buffer.from("%PDF-1.4", "ascii")), "pdf");
  assert.equal(detectFileKind(Buffer.from([0x00, 0x00])), null);
});
