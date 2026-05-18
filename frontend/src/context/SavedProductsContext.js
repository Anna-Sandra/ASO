import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "services/api";
import { useAuth } from "context";
import { h } from "utils/h";

const SavedProductsContext = createContext(null);

export function SavedProductsProvider({ children }) {
  const { accessToken } = useAuth();
  const [savedIds, setSavedIds] = useState(() => new Set());
  const [loaded, setLoaded] = useState(false);

  const authHeaders = useCallback(() => {
    const hdr = {};
    if (accessToken) hdr.Authorization = `Bearer ${accessToken}`;
    return hdr;
  }, [accessToken]);

  const refreshSaved = useCallback(async () => {
    if (!accessToken) {
      setSavedIds(new Set());
      setLoaded(true);
      return;
    }
    try {
      const d = await apiFetch("/api/products/saves/ids", { headers: authHeaders() });
      const arr = Array.isArray(d.ids) ? d.ids : [];
      setSavedIds(new Set(arr.map(String)));
    } catch {
      setSavedIds(new Set());
    } finally {
      setLoaded(true);
    }
  }, [accessToken, authHeaders]);

  useEffect(() => {
    setLoaded(false);
    refreshSaved();
  }, [refreshSaved]);

  const toggleSaved = useCallback(
    async (productId) => {
      const id = String(productId);
      const d = await apiFetch("/api/products/saves/toggle", {
        method: "POST",
        headers: authHeaders(),
        json: { productId: id }
      });
      const saved = Boolean(d.saved);
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (saved) next.add(id);
        else next.delete(id);
        return next;
      });
      return saved;
    },
    [authHeaders]
  );

  const value = useMemo(
    () => ({
      savedIds,
      savedLoaded: loaded,
      refreshSaved,
      toggleSaved,
      isSaved: (id) => savedIds.has(String(id))
    }),
    [savedIds, loaded, refreshSaved, toggleSaved]
  );

  return h(SavedProductsContext.Provider, { value }, children);
}

export function useSavedProducts() {
  const ctx = useContext(SavedProductsContext);
  if (!ctx) {
    throw new Error("useSavedProducts must be used within SavedProductsProvider");
  }
  return ctx;
}
