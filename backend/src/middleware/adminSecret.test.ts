import test from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, Response } from "express";
import { requireAdminEnvSecret } from "./adminSecret";
import { env } from "../config/env";
import { ADMIN_GATE_COOKIE, setAdminAccessGateCookie } from "./adminGate";

function makeReq(
  secret?: string,
  cookies?: Record<string, string>,
  extraHeaders?: Record<string, string>
): Request {
  return {
    headers: {
      ...(secret ? { "x-admin-secret": secret } : {}),
      ...(extraHeaders || {})
    },
    cookies: cookies || {}
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

test("requireAdminEnvSecret passes when admin gate cookie is valid", () => {
  const original = env.ADMIN_ACCESS_SECRET;
  (env as { ADMIN_ACCESS_SECRET: string }).ADMIN_ACCESS_SECRET = "top-secret-at-least-24-chars!!";
  let gate = "";
  const res = {
    cookie(name: string, value: string) {
      if (name === ADMIN_GATE_COOKIE) gate = value;
    }
  } as unknown as Response;
  setAdminAccessGateCookie(res, "507f1f77bcf86cd799439011");
  const req = makeReq(undefined, { [ADMIN_GATE_COOKIE]: gate });
  let called = false;
  requireAdminEnvSecret(req, makeRes(), (err?: unknown) => {
    assert.equal(err, undefined);
    called = true;
  });
  assert.equal(called, true);
  (env as { ADMIN_ACCESS_SECRET: string }).ADMIN_ACCESS_SECRET = original;
});

test("requireAdminEnvSecret passes when X-Admin-Gate header is valid", () => {
  const original = env.ADMIN_ACCESS_SECRET;
  (env as { ADMIN_ACCESS_SECRET: string }).ADMIN_ACCESS_SECRET = "top-secret-at-least-24-chars!!";
  let gate = "";
  const res = {
    cookie(name: string, value: string) {
      if (name === ADMIN_GATE_COOKIE) gate = value;
    }
  } as unknown as Response;
  setAdminAccessGateCookie(res, "507f1f77bcf86cd799439011");
  const req = makeReq(undefined, {}, { "x-admin-gate": gate });
  let called = false;
  requireAdminEnvSecret(req, makeRes(), (err?: unknown) => {
    assert.equal(err, undefined);
    called = true;
  });
  assert.equal(called, true);
  (env as { ADMIN_ACCESS_SECRET: string }).ADMIN_ACCESS_SECRET = original;
});
