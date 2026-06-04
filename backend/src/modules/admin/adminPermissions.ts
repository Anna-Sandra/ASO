import type { Request } from "express";
import { User } from "../auth/user.model";
import { getOrCreateSettings } from "../platform/platformSettings.service";

/** Permission keys for limited (non–super) admins. Super admins always have full access. */
export const ADMIN_PERMISSION_KEYS = [
  "dashboard",
  "users",
  "users_manage",
  "users_reset_password",
  "riders",
  "vendor_apps",
  "vendor_apps_manage",
  "courier_apps",
  "courier_apps_manage",
  "sellers",
  "sellers_manage",
  "stores",
  "stores_manage",
  "listings",
  "listings_manage",
  "orders",
  "orders_manage",
  "orders_refund",
  "orders_mark_paid",
  "payments",
  "reports",
  "reports_manage",
  "messages",
  "messages_reply",
  "promotions",
  "promotions_manage",
  "logs"
] as const;

export type AdminPermissionKey = (typeof ADMIN_PERMISSION_KEYS)[number];

export type AdminPermissionsMap = Record<AdminPermissionKey, boolean>;

export const ADMIN_PERMISSION_CATALOG: {
  key: AdminPermissionKey;
  label: string;
  description: string;
  group: string;
}[] = [
  { key: "dashboard", label: "Dashboard", description: "Overview stats and badges", group: "Sections" },
  { key: "users", label: "Users (view)", description: "Browse buyer, seller, and admin accounts", group: "Sections" },
  {
    key: "users_manage",
    label: "Users (manage)",
    description: "Suspend, ban, verify sellers, subscription exempt",
    group: "User actions"
  },
  {
    key: "users_reset_password",
    label: "Reset user passwords",
    description: "Set a new password for any user",
    group: "User actions"
  },
  { key: "riders", label: "Riders & couriers", description: "View delivery partner accounts", group: "Sections" },
  {
    key: "vendor_apps",
    label: "Vendor requests (view)",
    description: "See vendor applications",
    group: "Sections"
  },
  {
    key: "vendor_apps_manage",
    label: "Vendor requests (decide)",
    description: "Approve, reject, resend activation",
    group: "Application actions"
  },
  {
    key: "courier_apps",
    label: "Courier requests (view)",
    description: "See courier applications",
    group: "Sections"
  },
  {
    key: "courier_apps_manage",
    label: "Courier requests (decide)",
    description: "Approve or reject courier applications",
    group: "Application actions"
  },
  { key: "sellers", label: "Seller verification (view)", description: "Seller verification queue", group: "Sections" },
  {
    key: "sellers_manage",
    label: "Seller verification (decide)",
    description: "Approve or reject seller verification",
    group: "Application actions"
  },
  { key: "stores", label: "Stores (view)", description: "Store approval queue", group: "Sections" },
  {
    key: "stores_manage",
    label: "Stores (approve/reject)",
    description: "Approve or reject storefronts",
    group: "Application actions"
  },
  { key: "listings", label: "Listings (view)", description: "Browse all products", group: "Sections" },
  {
    key: "listings_manage",
    label: "Listings (moderate)",
    description: "Approve, reject, edit, bulk approve, auto-tag",
    group: "Moderation"
  },
  { key: "orders", label: "Orders (view)", description: "Browse orders", group: "Sections" },
  {
    key: "orders_manage",
    label: "Orders (update)",
    description: "Change order status and fulfillment fields",
    group: "Order actions"
  },
  {
    key: "orders_refund",
    label: "Issue Paystack refunds",
    description: "Refund paid orders via Paystack",
    group: "Order actions"
  },
  {
    key: "orders_mark_paid",
    label: "Mark orders paid",
    description: "Manually mark an order as paid",
    group: "Order actions"
  },
  { key: "payments", label: "Payments & revenue", description: "Transactions and seller balances", group: "Sections" },
  { key: "reports", label: "Reports (view)", description: "User reports and complaints", group: "Sections" },
  {
    key: "reports_manage",
    label: "Reports (resolve)",
    description: "Update report status and priority",
    group: "Moderation"
  },
  { key: "messages", label: "Messages (view)", description: "Support and moderation threads", group: "Sections" },
  {
    key: "messages_reply",
    label: "Messages (reply)",
    description: "Send messages to users as support",
    group: "Moderation"
  },
  {
    key: "promotions",
    label: "Deals & coupons (view)",
    description: "View promotion submissions",
    group: "Sections"
  },
  {
    key: "promotions_manage",
    label: "Deals & coupons (manage)",
    description: "Create, approve, or reject promotions",
    group: "Moderation"
  },
  { key: "logs", label: "System logs", description: "Email log and activity feed", group: "Sections" }
];

export const DEFAULT_ADMIN_PERMISSIONS: AdminPermissionsMap = Object.fromEntries(
  ADMIN_PERMISSION_KEYS.map((k) => [k, true])
) as AdminPermissionsMap;

const LABEL_BY_KEY = Object.fromEntries(ADMIN_PERMISSION_CATALOG.map((c) => [c.key, c.label])) as Record<
  AdminPermissionKey,
  string
>;

export function resolveAdminPermissions(
  stored: Record<string, unknown> | null | undefined
): AdminPermissionsMap {
  const out = { ...DEFAULT_ADMIN_PERMISSIONS };
  if (!stored || typeof stored !== "object") return out;
  for (const key of ADMIN_PERMISSION_KEYS) {
    if (typeof stored[key] === "boolean") out[key] = stored[key];
  }
  return out;
}

/** Per-admin overrides stored on the user document (only explicit keys). */
export function resolveUserAdminPermissionOverrides(
  stored: Record<string, unknown> | null | undefined
): Partial<AdminPermissionsMap> {
  const out: Partial<AdminPermissionsMap> = {};
  if (!stored || typeof stored !== "object") return out;
  for (const key of ADMIN_PERMISSION_KEYS) {
    if (typeof stored[key] === "boolean") out[key] = stored[key];
  }
  return out;
}

export function mergeAdminPermissionsWithUserOverrides(
  global: AdminPermissionsMap,
  userOverrides: Partial<AdminPermissionsMap>
): AdminPermissionsMap {
  const out = { ...global };
  for (const key of ADMIN_PERMISSION_KEYS) {
    if (typeof userOverrides[key] === "boolean") out[key] = userOverrides[key] as boolean;
  }
  return out;
}

/** Drop override keys that match the global default (keeps user documents small). */
export function pruneAdminPermissionOverrides(
  global: AdminPermissionsMap,
  overrides: Partial<AdminPermissionsMap>
): Partial<AdminPermissionsMap> {
  const out: Partial<AdminPermissionsMap> = {};
  for (const key of ADMIN_PERMISSION_KEYS) {
    if (typeof overrides[key] !== "boolean") continue;
    if (overrides[key] !== global[key]) out[key] = overrides[key];
  }
  return out;
}

export function allAdminPermissionsTrue(): AdminPermissionsMap {
  return { ...DEFAULT_ADMIN_PERMISSIONS };
}

export function permissionDeniedMessage(...keys: AdminPermissionKey[]): string {
  const labels = keys.map((k) => LABEL_BY_KEY[k] || k);
  return `You do not have permission for: ${labels.join(", ")}.`;
}

export async function loadGlobalAdminPermissions(): Promise<AdminPermissionsMap> {
  const doc = await getOrCreateSettings();
  return resolveAdminPermissions(doc.adminPermissions as Record<string, unknown> | undefined);
}

export async function loadAdminPermissionsForRequest(req: Request): Promise<AdminPermissionsMap> {
  if (req.user?.role !== "admin") return { ...DEFAULT_ADMIN_PERMISSIONS };
  if (req.user.adminLevel === "super") return allAdminPermissionsTrue();
  const global = await loadGlobalAdminPermissions();
  if (!req.user?.id) return global;
  const u = await User.findById(req.user.id).select("adminPermissions").lean();
  const overrides = resolveUserAdminPermissionOverrides(
    (u as { adminPermissions?: Record<string, unknown> } | null)?.adminPermissions
  );
  return mergeAdminPermissionsWithUserOverrides(global, overrides);
}

export function requestHasAdminPermission(req: Request, ...keys: AdminPermissionKey[]): boolean {
  if (req.user?.role !== "admin") return false;
  if (req.user.adminLevel === "super") return true;
  const perms = req.adminPermissions ?? DEFAULT_ADMIN_PERMISSIONS;
  return keys.every((k) => perms[k] === true);
}

/** Maps admin UI tab id to the permission required to open that section. */
export function adminTabToPermissionKey(tabId: string): AdminPermissionKey | null {
  switch (tabId) {
    case "dashboard":
      return "dashboard";
    case "users":
      return "users";
    case "riders":
      return "riders";
    case "vendor-apps":
      return "vendor_apps";
    case "stores":
      return "stores";
    case "promotions":
      return "promotions";
    case "courier-apps":
      return "courier_apps";
    case "sellers":
      return "sellers";
    case "listings":
      return "listings";
    case "orders":
      return "orders";
    case "payments":
      return "payments";
    case "reports":
      return "reports";
    case "messages":
      return "messages";
    case "logs":
      return "logs";
    case "settings":
      return null;
    default:
      return null;
  }
}
