import test from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { requireAdminEnvSecret } from "./adminSecret";
import { env } from "../config/env";

function makeReq(secret?: string): Request {
  return {
    headers: secret ? { "x-admin-secret": secret } : {}
  } as unknown as Request;
}

function makeRes(): Response {
  return {} as Response;
}

test("requireAdminEnvSecret rejects when configured and missing header", () => {
  const original = env.ADMIN_ACCESS_SECRET;
  (env as { ADMIN_ACCESS_SECRET: string }).ADMIN_ACCESS_SECRET = "top-secret";
  const req = makeReq();
  const res = makeRes();
  let received: any = null;
  requireAdminEnvSecret(req, res, (err?: unknown) => {
    received = err;
  });
  assert.equal(received?.status, 403);
  (env as { ADMIN_ACCESS_SECRET: string }).ADMIN_ACCESS_SECRET = original;
});

test("requireAdminEnvSecret passes when header matches configured secret", () => {
  const original = env.ADMIN_ACCESS_SECRET;
  (env as { ADMIN_ACCESS_SECRET: string }).ADMIN_ACCESS_SECRET = "top-secret";
  const req = makeReq("top-secret");
  const res = makeRes();
  let called = false;
  requireAdminEnvSecret(req, res, (err?: unknown) => {
    assert.equal(err, undefined);
    called = true;
  });
  assert.equal(called, true);
  (env as { ADMIN_ACCESS_SECRET: string }).ADMIN_ACCESS_SECRET = original;
});

