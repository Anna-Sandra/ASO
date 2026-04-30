import test from "node:test";
import assert from "node:assert/strict";
import { isPaystackRefundRemoteSettled } from "./paystackRefundSync";

test("isPaystackRefundRemoteSettled treats processed as settled", () => {
  assert.equal(isPaystackRefundRemoteSettled("processed"), true);
  assert.equal(isPaystackRefundRemoteSettled("Processed"), true);
  assert.equal(isPaystackRefundRemoteSettled("pending"), false);
  assert.equal(isPaystackRefundRemoteSettled("processing"), false);
  assert.equal(isPaystackRefundRemoteSettled(""), false);
});
