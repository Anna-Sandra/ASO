import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { getOrCreateSettings } from "./platformSettings.service";

export const getPublicPlatformConfig = asyncHandler(async (_req: Request, res: Response) => {
  const doc = await getOrCreateSettings();
  res.set("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
  res.json({
    siteName: doc.siteName || "Campus Mart",
    siteDescription: doc.siteDescription || "",
    supportEmail: (doc.supportEmail || "").trim(),
    maintenanceMode: !!doc.maintenanceMode,
    maintenanceMessage: doc.maintenanceMessage || "",
    allowPublicRegistration: doc.allowPublicRegistration !== false,
    allowVendorApplications: doc.allowVendorApplications !== false,
    payments: {
      momoEnabled: !!doc.momoEnabled,
      cardEnabled: !!doc.stripeEnabled,
      bankEnabled: !!doc.bankEnabled
    }
  });
});
