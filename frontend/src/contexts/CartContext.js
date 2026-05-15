import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { h } from "../h";

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

const KEY = "campusmart_cart_v1";

const NO_CART_CATEGORIES = new Set(["services", "food_drinks"]);

function normalizeCustomization(s) {
  const t = String(s || "").trim();
  return t.length > 280 ? t.slice(0, 280) : t;
}

function stableLineKey(productId, customization) {
  return `${String(productId)}::${normalizeCustomization(customization)}`;
}

function migrateLoadedItem(p) {
  if (!p || typeof p !== "object") return null;
  if (NO_CART_CATEGORIES.has(p.category)) return null;
  const cust = normalizeCustomization(p.customization);
  const lk = stableLineKey(p.id, cust);
  return { ...p, customization: cust, _lineKey: p._lineKey || lk };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(migrateLoadedItem).filter(Boolean);
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items]);

  const add = useCallback((product, qty = 1, customization = "") => {
    if (!product || NO_CART_CATEGORIES.has(product.category)) return;
    const q = Number(qty) || 1;
    const cust = normalizeCustomization(customization);
    const lk = stableLineKey(product.id, cust);
    setItems((prev) => {
      const i = prev.findIndex((row) => row._lineKey === lk || (row.id === product.id && normalizeCustomization(row.customization) === cust));
      if (i === -1) return [...prev, { ...product, qty: q, customization: cust, _lineKey: lk }];
      const next = [...prev];
      next[i] = { ...next[i], qty: next[i].qty + q, customization: cust, _lineKey: lk };
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
      const nextKey = stableLineKey(row.id, cust);
      const clashIdx = prev.findIndex((j, ji) => ji !== idx && j.id === row.id && normalizeCustomization(j.customization) === cust);
      if (clashIdx >= 0) {
        const next = [...prev];
        next[clashIdx] = {
          ...next[clashIdx],
          qty: next[clashIdx].qty + row.qty,
          customization: cust,
          _lineKey: stableLineKey(row.id, cust)
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
