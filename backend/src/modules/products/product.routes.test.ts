import test from "node:test";
import assert from "node:assert/strict";
import productRoutes from "./product.routes";

type Layer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ name: string }>;
  };
};

function routeLayer(path: string, method: "post" | "patch" | "delete"): Layer {
  const layer = (productRoutes as unknown as { stack: Layer[] }).stack.find(
    (l) => l.route?.path === path && Boolean(l.route?.methods?.[method])
  );
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  return layer;
}

test("create product route enforces vendor subscription middleware", () => {
  const layer = routeLayer("/", "post");
  const names = (layer.route?.stack || []).map((s) => s.name);
  assert.ok(names.includes("requireVendorSubscription"));
});

test("update product route enforces vendor subscription middleware", () => {
  const layer = routeLayer("/:id", "patch");
  const names = (layer.route?.stack || []).map((s) => s.name);
  assert.ok(names.includes("requireVendorSubscription"));
});

test("delete product route enforces vendor subscription middleware", () => {
  const layer = routeLayer("/:id", "delete");
  const names = (layer.route?.stack || []).map((s) => s.name);
  assert.ok(names.includes("requireVendorSubscription"));
});

