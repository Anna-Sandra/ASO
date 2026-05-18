import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "services/api";
import { productCategoryForBusinessType, storeUsesMenuSections } from "config/catalog";

/**
 * Loads the seller's stores and optional menu sections for product create/edit.
 * Menu sections are only loaded for food / restaurant stores.
 * Pre-selects from `?store=<slug>` or when the seller has exactly one store.
 */
export function useVendorStorePicker(accessToken) {
  const [searchParams] = useSearchParams();
  const storeSlugParam = String(searchParams.get("store") || "").trim();

  const [businesses, setBusinesses] = useState([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [businessId, setBusinessId] = useState("");
  const [menuSections, setMenuSections] = useState([]);
  const [menuSectionId, setMenuSectionId] = useState("");

  useEffect(() => {
    if (!accessToken) {
      setBusinesses([]);
      setStoresLoading(false);
      return;
    }
    let cancelled = false;
    setStoresLoading(true);
    apiFetch("/api/businesses/mine", { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((d) => {
        if (cancelled) return;
        setBusinesses(Array.isArray(d.businesses) ? d.businesses : []);
      })
      .catch(() => {
        if (!cancelled) setBusinesses([]);
      })
      .finally(() => {
        if (!cancelled) setStoresLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!businesses.length || businessId) return;
    const fromSlug = storeSlugParam
      ? businesses.find((b) => String(b.slug || "").trim() === storeSlugParam)
      : null;
    if (fromSlug) setBusinessId(fromSlug.id);
    else setBusinessId(businesses[0].id);
  }, [businesses, storeSlugParam, businessId]);

  const selectedBusiness = useMemo(
    () => businesses.find((b) => b.id === businessId) || null,
    [businesses, businessId]
  );

  const isFoodStore = storeUsesMenuSections(selectedBusiness?.businessType);

  useEffect(() => {
    if (!isFoodStore) {
      setMenuSections([]);
      setMenuSectionId("");
      return;
    }
    if (!accessToken || !selectedBusiness?.slug) {
      setMenuSections([]);
      return;
    }
    let cancelled = false;
    apiFetch(`/api/businesses/${encodeURIComponent(selectedBusiness.slug)}/menu-sections`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
      .then((d) => {
        if (cancelled) return;
        setMenuSections(Array.isArray(d.menuSections) ? d.menuSections : []);
      })
      .catch(() => {
        if (!cancelled) setMenuSections([]);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedBusiness?.slug, isFoodStore]);

  useEffect(() => {
    if (!isFoodStore) {
      setMenuSectionId("");
      return;
    }
    setMenuSectionId((prev) => {
      if (!prev) return "";
      if (menuSections.some((s) => String(s.id) === String(prev))) return prev;
      return "";
    });
  }, [menuSections, isFoodStore]);

  const applyBusinessCategory = useCallback(
    (onCategoryChange) => {
      if (!selectedBusiness || typeof onCategoryChange !== "function") return;
      onCategoryChange(productCategoryForBusinessType(selectedBusiness.businessType));
    },
    [selectedBusiness]
  );

  const selectBusiness = useCallback(
    (id, onCategoryChange) => {
      setBusinessId(id);
      setMenuSectionId("");
      const biz = businesses.find((b) => b.id === id);
      if (biz && typeof onCategoryChange === "function") {
        onCategoryChange(productCategoryForBusinessType(biz.businessType));
      }
    },
    [businesses]
  );

  return {
    businesses,
    storesLoading,
    businessId,
    setBusinessId,
    selectBusiness,
    menuSections,
    menuSectionId,
    setMenuSectionId,
    selectedBusiness,
    storeSlugParam,
    applyBusinessCategory,
    isFoodStore
  };
}
