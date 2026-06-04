import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeAdminPermissionsWithUserOverrides,
  pruneAdminPermissionOverrides,
  resolveAdminPermissions
} from "./adminPermissions";

test("mergeAdminPermissionsWithUserOverrides applies per-user denials", () => {
  const global = resolveAdminPermissions({ payments: true, dashboard: true, users: false });
  const effective = mergeAdminPermissionsWithUserOverrides(global, { payments: false });
  assert.equal(effective.payments, false);
  assert.equal(effective.dashboard, true);
  assert.equal(effective.users, false);
});

test("pruneAdminPermissionOverrides drops keys that match global", () => {
  const global = resolveAdminPermissions({ payments: true });
  const pruned = pruneAdminPermissionOverrides(global, { payments: true, dashboard: false });
  assert.deepEqual(pruned, { dashboard: false });
});
