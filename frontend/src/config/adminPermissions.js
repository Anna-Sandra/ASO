/** Maps admin sidebar tab id → permission key (must match backend adminPermissions.ts). */
export function adminTabToPermissionKey(tabId) {
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
    default:
      return null;
  }
}

export const ADMIN_PERMISSION_GROUPS = [
  "Sections",
  "User actions",
  "Application actions",
  "Moderation",
  "Order actions"
];
