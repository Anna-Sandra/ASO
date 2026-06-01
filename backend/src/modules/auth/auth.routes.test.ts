import test from "node:test";
import assert from "node:assert/strict";
import authRoutes from "./auth.routes";

type Layer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ name: string }>;
  };
};

function routeLayer(path: string, method: "post" | "get"): Layer {
  const layer = (authRoutes as unknown as { stack: Layer[] }).stack.find(
    (l) => l.route?.path === path && Boolean(l.route?.methods?.[method])
  );
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  return layer;
}

test("auth refresh route is protected by CSRF middleware", () => {
  const layer = routeLayer("/refresh", "post");
  const names = (layer.route?.stack || []).map((s) => s.name);
  assert.ok(names.includes("requireCsrf"));
});

test("auth logout route is protected by CSRF middleware", () => {
  const layer = routeLayer("/logout", "post");
  const names = (layer.route?.stack || []).map((s) => s.name);
  assert.ok(names.includes("requireCsrf"));
});

