import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { h } from "utils/h";
import { storageGetJSON, storageSetJSON, StorageKeys } from "utils/storage";

const CartContext = createContext({
  items: [],
  add: () => {},
  remove: () => {},
  setQty: () => {},
  setCustomization: () => {},
  clear: () => {},
  subtotal: 0,
  count: 0
});

const KEY = StorageKeys.CART;

const NO_CART_CATEGORIES = new Set([]);

function normalizeCustomization(s) {
  const t = String(s || "").trim();
  return t.length > 280 ? t.slice(0, 280) : t;
}

function addonKeyFromProduct(p) {
  const labels = p && typeof p === "object" && Array.isArray(p.selectedAddonLabels) ? p.selectedAddonLabels : [];
  return labels
    .map((s) => String(s).trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join("|");
}

function stableLineKey(product, customization) {
  const id = product && typeof product === "object" ? product.id : "";
  const cust = normalizeCustomization(customization);
  const ak = addonKeyFromProduct(product);
  return `${String(id)}::${cust}::${ak}`;
}

function migrateLoadedItem(p) {
  if (!p || typeof p !== "object") return null;
  const cust = normalizeCustomization(p.customization);
  const lk = stableLineKey(p, cust);
  return { ...p, customization: cust, _lineKey: p._lineKey || lk };
}

function load() {
  const parsed = storageGetJSON(KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(migrateLoadedItem).filter(Boolean);
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(load);

  useEffect(() => {
    storageSetJSON(KEY, items);
  }, [items]);

  const add = useCallback((product, qty = 1, customization = "") => {
    if (!product || NO_CART_CATEGORIES.has(product.category)) return;
    const q = Number(qty) || 1;
    const cust = normalizeCustomization(customization);
    const lk = stableLineKey(product, cust);
    setItems((prev) => {
      const i = prev.findIndex((row) => row._lineKey === lk || (row.id === product.id && normalizeCustomization(row.customization) === cust && addonKeyFromProduct(row) === addonKeyFromProduct(product)));
      if (i === -1) return [...prev, { ...product, qty: q, customization: cust, _lineKey: lk }];
      const next = [...prev];
      next[i] = { ...next[i], qty: next[i].qty + q, customization: cust, _lineKey: lk, ...product };
      return next;
    });
  }, []);

  /** Remove one cart line by its stable line key (`row._lineKey`). */
  const remove = useCallback((lineKey) => setItems((prev) => prev.filter((p) => p._lineKey !== lineKey)), []);

  const setQty = useCallback((lineKey, qty) => {
    setItems((prev) =>
      prev
        .map((p) => (p._lineKey === lineKey ? { ...p, qty: Math.max(0, Number(qty) || 0) } : p))
        .filter((p) => p.qty > 0)
    );
  }, []);

  const setCustomization = useCallback((lineKey, text) => {
    const cust = normalizeCustomization(text);
    setItems((prev) => {
      const idx = prev.findIndex((p) => p._lineKey === lineKey);
      if (idx === -1) return prev;
      const row = prev[idx];
      const nextKey = stableLineKey({ ...row, selectedAddonLabels: row.selectedAddonLabels }, cust);
      const clashIdx = prev.findIndex((j, ji) => ji !== idx && j.id === row.id && normalizeCustomization(j.customization) === cust && addonKeyFromProduct(j) === addonKeyFromProduct(row));
      if (clashIdx >= 0) {
        const next = [...prev];
        next[clashIdx] = {
          ...next[clashIdx],
          qty: next[clashIdx].qty + row.qty,
          customization: cust,
          _lineKey: stableLineKey(row, cust)
        };
        next.splice(idx, 1);
        return next;
      }
      const next = [...prev];
      next[idx] = { ...row, customization: cust, _lineKey: nextKey };
      return next;
    });
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const subtotal = items.reduce((s, p) => s + (Number(p.price) || 0) * (Number(p.qty) || 0), 0);
  const count = items.reduce((s, p) => s + p.qty, 0);

  const value = useMemo(
    () => ({ items, add, remove, setQty, setCustomization, clear, subtotal, count }),
    [items, subtotal, count, add, remove, setQty, setCustomization, clear]
  );

  return h(CartContext.Provider, { value }, children);
}

export function useCart() {
  return useContext(CartContext);
}
