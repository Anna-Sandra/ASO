import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { h, f } from "./h";

const CartContext = createContext({
  items: [],
  add: () => {},
  remove: () => {},
  setQty: () => {},
  clear: () => {},
  subtotal: 0,
  count: 0
});

const KEY = "brewmart_cart_v1";

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
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

  const add = (product, qty = 1) => {
    setItems((prev) => {
      const i = prev.findIndex((p) => p.id === product.id);
      if (i === -1) return [...prev, { ...product, qty }];
      const next = [...prev];
      next[i] = { ...next[i], qty: next[i].qty + qty };
      return next;
    });
  };

  const remove = (id) => setItems((prev) => prev.filter((p) => p.id !== id));

  const setQty = (id, qty) => {
    setItems((prev) =>
      prev
        .map((p) => (p.id === id ? { ...p, qty: Math.max(0, qty) } : p))
        .filter((p) => p.qty > 0)
    );
  };

  const clear = () => setItems([]);

  const subtotal = items.reduce((s, p) => s + p.price * p.qty, 0);
  const count = items.reduce((s, p) => s + p.qty, 0);

  const value = useMemo(
    () => ({ items, add, remove, setQty, clear, subtotal, count }),
    [items, subtotal, count]
  );

  return h(CartContext.Provider, { value }, children);
}

export function useCart() {
  return useContext(CartContext);
}
