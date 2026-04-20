import test from "node:test";
import assert from "node:assert/strict";

import { HttpError } from "./httpError";

test("HttpError stores status, message, and optional code", () => {
  const err = new HttpError(401, "Unauthorized", "AUTH_REQUIRED");

  assert.equal(err.status, 401);
  assert.equal(err.message, "Unauthorized");
  assert.equal(err.code, "AUTH_REQUIRED");
});

test("HttpError works without a code", () => {
  const err = new HttpError(404, "Not Found");

  assert.equal(err.status, 404);
  assert.equal(err.message, "Not Found");
  assert.equal(err.code, undefined);
});
