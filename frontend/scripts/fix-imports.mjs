/**
 * One-off import path updater after src/ restructure. Run from frontend/: node scripts/fix-imports.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, "..", "src");

const replacements = [
  [/from "\.\/api"/g, 'from "@/services/api"'],
  [/from "\.\/deliverySocket"/g, 'from "@/services/deliverySocket"'],
  [/from "\.\/contexts"/g, 'from "@/context"'],
  [/from "\.\/contexts\//g, 'from "@/context/'],
  [/from "\.\/savedProductsContext"/g, 'from "@/context/SavedProductsContext"'],
  [/from "\.\/h"/g, 'from "@/utils/h"'],
  [/from "\.\/money"/g, 'from "@/utils/money"'],
  [/from "\.\/ghanaPhone"/g, 'from "@/utils/ghanaPhone"'],
  [/from "\.\/authJwt"/g, 'from "@/utils/authJwt"'],
  [/from "\.\/saveSession"/g, 'from "@/utils/saveSession"'],
  [/from "\.\/orderStatusDisplay"/g, 'from "@/utils/orderStatusDisplay"'],
  [/from "\.\/catalog"/g, 'from "@/config/catalog"'],
  [/from "\.\/listingCategoryFields"/g, 'from "@/config/listingCategoryFields"'],
  [/from "\.\/checkoutPricing"/g, 'from "@/hooks/useCheckoutPricing"'],
  [/from "\.\/ui"/g, 'from "@/components/ui"'],
  [/from "\.\/screensBuyer"/g, 'from "@/pages/buyer/screensBuyer"'],
  [/from "\.\/screensVendor"/g, 'from "@/pages/vendor/screensVendor"'],
  [/from "\.\/screensAuth"/g, 'from "@/pages/auth/screensAuth"'],
  [/from "\.\/screensAdmin"/g, 'from "@/pages/admin/screensAdmin"'],
  [/from "\.\/screensAdminLogin"/g, 'from "@/pages/admin/screensAdminLogin"'],
  [/from "\.\/screensNotifications"/g, 'from "@/pages/notifications/screensNotifications"'],
  [/from "\.\/screensLegal"/g, 'from "@/pages/legal/screensLegal"'],
  [/from "\.\/screensCourierApply"/g, 'from "@/pages/applications/screensCourierApply"'],
  [/from "\.\/screensVendorApply"/g, 'from "@/pages/applications/screensVendorApply"'],
  [/from "\.\/screensUserReports"/g, 'from "@/pages/reports/screensUserReports"'],
  [/from "\.\/marketplaceHubScreens"/g, 'from "@/pages/marketplace/marketplaceHubScreens"'],
  [/from "\.\/vendorBusinessStudio"/g, 'from "@/pages/vendor/vendorBusinessStudio"'],
  [/from "\.\/vendorStorefrontStudio"/g, 'from "@/pages/vendor/vendorStorefrontStudio"'],
  [/from "\.\/vendorStoreMenu"/g, 'from "@/pages/vendor/vendorStoreMenu"'],
  [/from "\.\/vendorOnboardingWizard"/g, 'from "@/pages/vendor/vendorOnboardingWizard"'],
  [/from "\.\/vendorServiceInquiries"/g, 'from "@/pages/vendor/vendorServiceInquiries"'],
  [/from "\.\/vendorCharts"/g, 'from "@/components/charts/vendorCharts"'],
  [/from "\.\/TrackOrderModal"/g, 'from "@/components/features/TrackOrderModal"'],
  [/from "\.\/DeliveryLive"/g, 'from "@/components/features/DeliveryLive"'],
  [/from "\.\/ShoppingAssistantFAB"/g, 'from "@/components/features/ShoppingAssistantFAB"'],
  [/from "\.\/RiderDashboard"/g, 'from "@/pages/rider/RiderDashboard"']
];

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, files);
    else if (p.endsWith(".js") || p.endsWith(".mjs")) files.push(p);
  }
  return files;
}

let changed = 0;
for (const file of walk(srcRoot)) {
  let text = fs.readFileSync(file, "utf8");
  let next = text;
  for (const [re, rep] of replacements) next = next.replace(re, rep);
  if (next !== text) {
    fs.writeFileSync(file, next);
    changed++;
  }
}
console.log(`Updated imports in ${changed} files`);
