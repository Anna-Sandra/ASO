import { storeUsesMenuSections } from "config/catalog";

/** Only send menuSectionId for food restaurants, and only when it exists on the current store. */
export function resolveMenuSectionIdForStore(menuSectionId, menuSections, businessType) {
  if (!storeUsesMenuSections(businessType)) return undefined;
  const id = String(menuSectionId || "").trim();
  if (!id) return undefined;
  if (!Array.isArray(menuSections) || !menuSections.some((s) => String(s.id) === id)) return undefined;
  return id;
}
