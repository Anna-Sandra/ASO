import { Router } from "express";
import { protect, authorize, requireSuperAdmin } from "../../middleware/auth";
import { requireAdminEnvSecret } from "../../middleware/adminSecret";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { validateBody, validateQuery } from "../../middleware/validate";
import { attachAdminPermissions, requireAdminPermission } from "../../middleware/adminPermissions";
import {
  adminBadges,
  adminBulkCleanup,
  adminDashboard,
  approveProduct,
  approveProductsBulk,
  approveAdminBusiness,
  listAdminBusinesses,
  rejectAdminBusiness,
  deleteAdminOrder,
  deleteAdminProduct,
  deleteAdminReport,
  deleteAdminCourierApplication,
  deleteAdminUser,
  deleteAdminVendorApplication,
  listCourierApplications,
  listVendorApplications,
  patchAdminCourierApplication,
  patchAdminVendorApplication,
  resendVendorApplicationActivation,
  syncVendorApplicationSellerRole,
  getAdminConversation,
  getAdminConversationWithUser,
  getAdminPlatformSettings,
  getAdminMyPermissions,
  getAdminRevenue,
  getAdminSellerBalances,
  getAdminUserSummary,
  demoteUserToBuyerAccess,
  grantAdmin,
  revokeAdmin,
  listAdminConversations,
  listAdminEmailLogs,
  listAdminOrders,
  listAdminProducts,
  listAdminReports,
  listAdminUsers,
  markAdminOrderPaid,
  patchAdminOrder,
  postAdminMessageToUser,
  refundAdminOrderPaystack,
  patchAdminPlatformSettings,
  patchAdminProduct,
  patchAdminReport,
  patchAdminUser,
  postAdminSettingsEmailTest,
  rejectProduct,
  reactivateSellerListings,
  resetAdminUserPassword
} from "./admin.controller";
import { autoTagAllProductsAdmin } from "../products/product.controller";
import {
  adminApprovePromotion,
  adminCreatePlatformPromotion,
  adminListPromotions,
  adminRejectPromotion
} from "../promotions/promotion.controller";
import {
  adminCreatePromotionSchema,
  adminPromotionsQuerySchema,
  adminRejectPromotionSchema
} from "../promotions/promotion.schemas";
import {
  adminListQuerySchema,
  adminOrderPatchSchema,
  adminOrdersQuerySchema,
  adminPatchUserSchema,
  adminPlatformSettingsSchema,
  adminEmailLogsQuerySchema,
  adminEmailTestSchema,
  adminProductPatchSchema,
  adminProductsQuerySchema,
  adminBusinessesQuerySchema,
  adminRejectBusinessSchema,
  adminRejectProductSchema,
  adminApproveProductsBulkSchema,
  adminReportPatchSchema,
  adminReportsQuerySchema,
  adminResetPasswordSchema,
  adminUsersQuerySchema,
  adminRidersQuerySchema,
  adminCreateVendorSchema,
  grantAdminBodySchema
} from "./admin.schemas";
import { conversationMessageSchema } from "../conversations/conversation.schemas";
import { adminVendorApplicationsQuerySchema, patchVendorApplicationSchema } from "../vendorApplications/vendorApplication.schemas";
import { adminCourierApplicationsQuerySchema, patchCourierApplicationSchema } from "../courierApplications/courierApplication.schemas";
import { adminCreateRiderSchema } from "../deliveries/delivery.schemas";
import { listAdminRiders, postAdminCreateRider } from "../deliveries/riderAdmin.controller";
import { postAdminCreateVendor } from "./vendorAdmin.controller";

const router = Router();

const adminBase = [
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  attachAdminPermissions
] as const;

const p = requireAdminPermission;

router.get("/permissions", ...adminBase, getAdminMyPermissions);

router.use(...adminBase);

router.get("/riders", p("riders"), validateQuery(adminRidersQuerySchema), listAdminRiders);
router.post(
  "/riders",
  requireSuperAdmin,
  validateBody(adminCreateRiderSchema),
  postAdminCreateRider
);
router.post("/vendors", requireSuperAdmin, validateBody(adminCreateVendorSchema), postAdminCreateVendor);

router.get("/dashboard", p("dashboard"), adminDashboard);
router.get("/badges", p("dashboard"), adminBadges);
router.get("/users", p("users"), validateQuery(adminUsersQuerySchema), listAdminUsers);
router.post("/users/grant-admin", requireSuperAdmin, validateBody(grantAdminBodySchema), grantAdmin);
router.post("/users/revoke-admin", requireSuperAdmin, validateBody(grantAdminBodySchema), revokeAdmin);
router.post("/users/demote-to-buyer", validateBody(grantAdminBodySchema), demoteUserToBuyerAccess);
router.patch("/users/:id", p("users", "users_manage"), validateBody(adminPatchUserSchema), patchAdminUser);
router.post(
  "/sellers/:id/reactivate-listings",
  p("sellers", "sellers_manage"),
  reactivateSellerListings
);
router.get(
  "/businesses",
  p("stores"),
  validateQuery(adminBusinessesQuerySchema),
  listAdminBusinesses
);
router.post("/businesses/:id/approve", p("stores", "stores_manage"), approveAdminBusiness);
router.post(
  "/businesses/:id/reject",
  p("stores", "stores_manage"),
  validateBody(adminRejectBusinessSchema),
  rejectAdminBusiness
);
router.get("/products", p("listings"), validateQuery(adminProductsQuerySchema), listAdminProducts);
router.post(
  "/products/bulk-approve",
  p("listings", "listings_manage"),
  validateBody(adminApproveProductsBulkSchema),
  approveProductsBulk
);
router.post("/products/:id/approve", p("listings", "listings_manage"), approveProduct);
router.post("/products/auto-tag-all", p("listings", "listings_manage"), autoTagAllProductsAdmin);
router.post(
  "/products/:id/reject",
  p("listings", "listings_manage"),
  validateBody(adminRejectProductSchema),
  rejectProduct
);
router.get("/orders", p("orders"), validateQuery(adminOrdersQuerySchema), listAdminOrders);
router.get("/revenue", p("payments"), getAdminRevenue);
router.get("/sellers/balances", p("payments"), getAdminSellerBalances);
router.get(
  "/vendor-applications",
  p("vendor_apps"),
  validateQuery(adminVendorApplicationsQuerySchema),
  listVendorApplications
);
router.patch(
  "/vendor-applications/:id",
  p("vendor_apps", "vendor_apps_manage"),
  validateBody(patchVendorApplicationSchema),
  patchAdminVendorApplication
);
router.post(
  "/vendor-applications/:id/resend-activation",
  p("vendor_apps", "vendor_apps_manage"),
  resendVendorApplicationActivation
);
router.post(
  "/vendor-applications/:id/sync-seller-role",
  p("vendor_apps", "vendor_apps_manage"),
  syncVendorApplicationSellerRole
);
router.get(
  "/courier-applications",
  p("courier_apps"),
  validateQuery(adminCourierApplicationsQuerySchema),
  listCourierApplications
);
router.patch(
  "/courier-applications/:id",
  p("courier_apps", "courier_apps_manage"),
  validateBody(patchCourierApplicationSchema),
  patchAdminCourierApplication
);
router.get("/settings", requireSuperAdmin, getAdminPlatformSettings);
router.patch(
  "/settings",
  requireSuperAdmin,
  validateBody(adminPlatformSettingsSchema),
  patchAdminPlatformSettings
);
router.post(
  "/settings/email-test",
  requireSuperAdmin,
  validateBody(adminEmailTestSchema),
  postAdminSettingsEmailTest
);
router.get("/email-logs", p("logs"), validateQuery(adminEmailLogsQuerySchema), listAdminEmailLogs);
router.get("/reports", p("reports"), validateQuery(adminReportsQuerySchema), listAdminReports);
router.patch(
  "/reports/:id",
  p("reports", "reports_manage"),
  validateBody(adminReportPatchSchema),
  patchAdminReport
);
router.get("/conversations", p("messages"), validateQuery(adminListQuerySchema), listAdminConversations);
router.get("/conversations/with-user/:userId", p("messages"), getAdminConversationWithUser);
router.post(
  "/conversations/with-user/:userId/messages",
  p("messages", "messages_reply"),
  validateBody(conversationMessageSchema),
  postAdminMessageToUser
);
router.get("/conversations/:id", p("messages"), getAdminConversation);
router.get("/users/:id/summary", p("users"), getAdminUserSummary);
router.post(
  "/users/:id/reset-password",
  p("users_reset_password"),
  validateBody(adminResetPasswordSchema),
  resetAdminUserPassword
);
router.post("/orders/:id/refund-paystack", p("orders", "orders_refund"), refundAdminOrderPaystack);
router.post("/orders/:id/mark-paid", p("orders", "orders_mark_paid"), markAdminOrderPaid);
router.patch(
  "/orders/:id",
  p("orders", "orders_manage"),
  validateBody(adminOrderPatchSchema),
  patchAdminOrder
);
router.patch(
  "/products/:id",
  p("listings", "listings_manage"),
  validateBody(adminProductPatchSchema),
  patchAdminProduct
);
router.delete("/products/:id", requireSuperAdmin, deleteAdminProduct);
router.delete("/reports/:id", requireSuperAdmin, deleteAdminReport);
router.delete("/orders/:id", requireSuperAdmin, deleteAdminOrder);
router.delete("/vendor-applications/:id", requireSuperAdmin, deleteAdminVendorApplication);
router.delete("/courier-applications/:id", requireSuperAdmin, deleteAdminCourierApplication);
router.delete("/users/:id", requireSuperAdmin, deleteAdminUser);
router.post("/cleanup", requireSuperAdmin, adminBulkCleanup);

router.get(
  "/promotions",
  p("promotions"),
  validateQuery(adminPromotionsQuerySchema),
  adminListPromotions
);
router.post(
  "/promotions",
  p("promotions", "promotions_manage"),
  validateBody(adminCreatePromotionSchema),
  adminCreatePlatformPromotion
);
router.post("/promotions/:id/approve", p("promotions", "promotions_manage"), adminApprovePromotion);
router.post(
  "/promotions/:id/reject",
  p("promotions", "promotions_manage"),
  validateBody(adminRejectPromotionSchema),
  adminRejectPromotion
);

export default router;
