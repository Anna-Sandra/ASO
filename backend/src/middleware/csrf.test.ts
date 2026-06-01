import test from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { requireCsrf } from "./csrf";

function makeReq(cookieToken?: string, headerToken?: string): Request {
  return {
    cookies: cookieToken ? { csrfToken: cookieToken } : {},
    headers: headerToken ? { "x-csrf-token": headerToken } : {}
  } as unknown as Request;
}

function makeRes(): Response {
  return {} as Response;
}

test("requireCsrf passes when header matches cookie", () => {
  const req = makeReq("abc123", "abc123");
  const res = makeRes();
  let called = false;
  requireCsrf(req, res, (err?: unknown) => {
    assert.equal(err, undefined);
    called = true;
  });
  assert.equal(called, true);
});

test("requireCsrf fails when token missing or mismatched", () => {
  const req = makeReq("abc123", "different");
  const res = makeRes();
  let received: any = null;
  requireCsrf(req, res, (err?: unknown) => {
    received = err;
  });
  assert.equal(received?.status, 403);
  assert.equal(received?.code, "CSRF_CHECK_FAILED");
});

