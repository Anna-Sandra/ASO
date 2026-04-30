import type { ProductDoc } from "../products/product.model";
import type { PlatformSettingsDoc } from "./platformSettings.model";

type ListingPolicyPick = Pick<
  PlatformSettingsDoc,
  | "listingAutoModerationEnabled"
  | "listingKeywordBlockEnabled"
  | "listingAutoRejectKeywords"
  | "listingKeywordViolationAction"
  | "listingDefaultApprovalMode"
>;

export function buildListingHaystack(parts: { name: string; description: string; tags: string[] }): string {
  const tags = Array.isArray(parts.tags) ? parts.tags.map((t) => String(t)) : [];
  return `${parts.name}\n${parts.description}\n${tags.join(" ")}`;
}

export function evaluateListingKeywords(
  settings: ListingPolicyPick,
  haystack: string
): { hit: false } | { hit: true; keyword: string; action: "reject" | "flag" } {
  if (!settings.listingAutoModerationEnabled || !settings.listingKeywordBlockEnabled) {
    return { hit: false };
  }
  const kws = (settings.listingAutoRejectKeywords || [])
    .map((k) => String(k).trim().toLowerCase())
    .filter((k) => k.length > 0);
  if (!kws.length) return { hit: false };
  const text = haystack.toLowerCase();
  for (const kw of kws) {
    if (text.includes(kw)) {
      const action = settings.listingKeywordViolationAction === "reject_auto" ? "reject" : "flag";
      return { hit: true, keyword: kw, action };
    }
  }
  return { hit: false };
}

export type ListingPublishOutcome = {
  status: ProductDoc["status"];
  flagged: boolean;
  rejectionReason: string | null;
};

/**
 * Resolves status when the seller intends to publish (body.status === "active" from their POV).
 * Edits to a live listing always re-enter the approval queue (unless auto-rejected by keyword).
 */
export function resolveListingPublishOutcome(params: {
  settings: ListingPolicyPick;
  name: string;
  description: string;
  tags: string[];
  beforeStatus: ProductDoc["status"];
  modTouched: boolean;
}): ListingPublishOutcome {
  const { settings, name, description, tags, beforeStatus, modTouched } = params;
  const hay = buildListingHaystack({ name, description, tags });
  const kw = evaluateListingKeywords(settings, hay);

  if (kw.hit && kw.action === "reject") {
    return {
      status: "rejected",
      flagged: false,
      rejectionReason: `Automatic moderation: listing text matched restricted keyword “${kw.keyword}”.`
    };
  }
  if (kw.hit && kw.action === "flag") {
    return {
      status: "pending_approval",
      flagged: true,
      rejectionReason: null
    };
  }

  if (beforeStatus === "active" && modTouched) {
    return { status: "pending_approval", flagged: false, rejectionReason: null };
  }

  if (beforeStatus === "active" && !modTouched) {
    return { status: "active", flagged: false, rejectionReason: null };
  }

  if (settings.listingDefaultApprovalMode === "auto_approve") {
    return { status: "active", flagged: false, rejectionReason: null };
  }

  return { status: "pending_approval", flagged: false, rejectionReason: null };
}
