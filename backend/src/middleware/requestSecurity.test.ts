import test from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { requestSecurity } from "./requestSecurity";

function run(req: Partial<Request>) {
  const r = req as Request;
  const res = { setHeader: () => {} } as unknown as Response;
  let err: unknown;
  let called = false;
  requestSecurity(r, res, (e?: unknown) => {
    err = e;
    called = !e;
  });
  return { err, called };
}

test("requestSecurity blocks TRACE", () => {
  const { err, called } = run({ method: "TRACE", path: "/api/health", originalUrl: "/api/health" });
  assert.equal(called, false);
  assert.equal((err as { status?: number })?.status, 405);
});

test("requestSecurity blocks path traversal patterns", () => {
  const { err } = run({ method: "GET", path: "/api/../admin", originalUrl: "/api/../admin" });
  assert.equal((err as { status?: number })?.status, 400);
});

test("requestSecurity allows normal API paths", () => {
  const { called } = run({ method: "GET", path: "/api/products", originalUrl: "/api/products" });
  assert.equal(called, true);
});
