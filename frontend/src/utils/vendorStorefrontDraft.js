import { storageGetJSON, storageRemove, storageSetJSON } from "utils/storage";

const DRAFT_PREFIX = "SHOPIQGH_store_draft_";

function draftKey(storeSlug) {
  return `${DRAFT_PREFIX}${String(storeSlug || "").trim().toLowerCase()}`;
}

export function readStorefrontDraft(storeSlug) {
  const d = storageGetJSON(draftKey(storeSlug), null);
  return d && typeof d === "object" ? d : null;
}

export function writeStorefrontDraft(storeSlug, patch) {
  const slug = String(storeSlug || "").trim();
  if (!slug) return;
  const prev = readStorefrontDraft(slug) || {};
  storageSetJSON(draftKey(slug), {
    ...prev,
    ...patch,
    updatedAt: Date.now()
  });
}

/** Merge saved business with unsaved vendor draft (owner preview + manage page). */
export function businessWithStorefrontDraft(business, storeSlug) {
  if (!business || !storeSlug) return business;
  const draft = readStorefrontDraft(storeSlug);
  if (!draft) return business;

  const merged = { ...business };
  const svc = draft.service;
  if (svc && typeof svc === "object") {
    if (svc.pickupAvailable !== undefined) merged.pickupAvailable = Boolean(svc.pickupAvailable);
    if (svc.deliveryAvailable !== undefined) merged.deliveryAvailable = Boolean(svc.deliveryAvailable);
    if (svc.deliveryFee !== undefined) {
      merged.deliveryFee = svc.deliveryFee === "" || svc.deliveryFee == null ? null : Number(svc.deliveryFee);
    }
    if (svc.estimatedDeliveryMins !== undefined) {
      merged.estimatedDeliveryMins =
        svc.estimatedDeliveryMins === "" || svc.estimatedDeliveryMins == null
          ? null
          : Number(svc.estimatedDeliveryMins);
    }
  }
  if (typeof draft.description === "string") merged.description = draft.description;
  if (typeof draft.locationLabel === "string") merged.locationLabel = draft.locationLabel;
  return merged;
}

export function clearStorefrontDraftSection(storeSlug, section) {
  const slug = String(storeSlug || "").trim();
  if (!slug) return;
  const prev = readStorefrontDraft(slug);
  if (!prev) return;
  const next = { ...prev };
  if (section === "service") delete next.service;
  else delete next[section];
  const keys = Object.keys(next).filter((k) => k !== "updatedAt");
  if (!keys.length) storageRemove(draftKey(slug));
  else storageSetJSON(draftKey(slug), next);
}
