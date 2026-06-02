import { env } from "../config/env";

export type FaceMatchStatus = "matched" | "mismatch" | "manual_review";

export type FaceMatchResult = {
  status: FaceMatchStatus;
  confidence: number | null;
  provider: string;
  reason: string;
  checkedAt: Date;
};

function looksLikeImageUrl(url: string): boolean {
  const u = String(url || "").trim().toLowerCase();
  return /\.(jpg|jpeg|png|webp)(\?|$)/.test(u);
}

async function compareFacesWithFacePlusPlus(idImageUrl: string, selfieUrl: string): Promise<FaceMatchResult> {
  const form = new URLSearchParams();
  form.set("api_key", env.FACEPP_API_KEY);
  form.set("api_secret", env.FACEPP_API_SECRET);
  form.set("image_url1", idImageUrl);
  form.set("image_url2", selfieUrl);

  const r = await fetch("https://api-us.faceplusplus.com/facepp/v3/compare", {
    method: "POST",
    body: form
  });
  const data = (await r.json().catch(() => ({}))) as {
    confidence?: unknown;
    error_message?: unknown;
  };
  if (!r.ok) {
    const msg = typeof data.error_message === "string" ? data.error_message : `HTTP ${r.status}`;
    throw new Error(`Face++ compare failed: ${msg}`);
  }
  const confidenceRaw = Number(data.confidence);
  const confidence = Number.isFinite(confidenceRaw) ? confidenceRaw : null;
  if (confidence == null) {
    return {
      status: "manual_review",
      confidence: null,
      provider: "faceplusplus",
      reason: "No confidence score returned by provider.",
      checkedAt: new Date()
    };
  }
  if (confidence >= env.KYC_FACE_MATCH_MIN_CONFIDENCE) {
    return {
      status: "matched",
      confidence,
      provider: "faceplusplus",
      reason: "Face similarity passed automatic threshold.",
      checkedAt: new Date()
    };
  }
  return {
    status: "mismatch",
    confidence,
    provider: "faceplusplus",
    reason: "Face similarity below automatic approval threshold.",
    checkedAt: new Date()
  };
}

/** Compare ID photo and selfie with configured provider; gracefully falls back to manual review. */
export async function verifyVendorIdentityWithSelfie(idImageUrl: string, selfieUrl: string): Promise<FaceMatchResult> {
  const idUrl = String(idImageUrl || "").trim();
  const selfie = String(selfieUrl || "").trim();
  const checkedAt = new Date();
  if (!idUrl || !selfie) {
    return {
      status: "manual_review",
      confidence: null,
      provider: "none",
      reason: "ID image and selfie are both required.",
      checkedAt
    };
  }
  if (!looksLikeImageUrl(idUrl)) {
    return {
      status: "manual_review",
      confidence: null,
      provider: "none",
      reason: "ID must be an image for automatic face matching.",
      checkedAt
    };
  }
  if (!looksLikeImageUrl(selfie)) {
    return {
      status: "manual_review",
      confidence: null,
      provider: "none",
      reason: "Selfie must be an image.",
      checkedAt
    };
  }

  if (env.KYC_FACE_MATCH_PROVIDER !== "faceplusplus" || !env.FACEPP_API_KEY || !env.FACEPP_API_SECRET) {
    return {
      status: "manual_review",
      confidence: null,
      provider: "none",
      reason: "Automatic face-match provider is not configured.",
      checkedAt
    };
  }

  try {
    return await compareFacesWithFacePlusPlus(idUrl, selfie);
  } catch (err) {
    return {
      status: "manual_review",
      confidence: null,
      provider: "faceplusplus",
      reason: err instanceof Error ? err.message : "Automatic face match failed.",
      checkedAt
    };
  }
}

