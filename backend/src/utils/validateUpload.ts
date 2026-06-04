import fs from "fs/promises";
import type { Express } from "express";
import { HttpError } from "./httpError";
import { detectFileKind, fileKindAllowed, type FileKind } from "./fileMagic";

async function readUploadHeader(file: Express.Multer.File, max = 64): Promise<Buffer> {
  if (file.buffer?.length) return file.buffer.subarray(0, max);
  if (file.path) {
    const fh = await fs.open(file.path, "r");
    try {
      const buf = Buffer.alloc(max);
      const { bytesRead } = await fh.read(buf, 0, max, 0);
      return buf.subarray(0, bytesRead);
    } finally {
      await fh.close();
    }
  }
  throw new HttpError(400, "Invalid upload payload.");
}

/** Reject spoofed MIME / extension after multer accepts the file. */
export async function assertUploadedFileKinds(file: Express.Multer.File, allowed: readonly FileKind[]) {
  const header = await readUploadHeader(file);
  const kind = detectFileKind(header);
  if (!fileKindAllowed(kind, allowed)) {
    throw new HttpError(400, "File content does not match an allowed image or document type.");
  }
}

export async function assertUploadedFilesKinds(files: Express.Multer.File[], allowed: readonly FileKind[]) {
  for (const f of files) {
    await assertUploadedFileKinds(f, allowed);
  }
}
