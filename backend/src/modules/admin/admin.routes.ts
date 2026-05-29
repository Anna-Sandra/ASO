import { Router } from "express";
import { protect, authorize, requireSuperAdmin } from "../../middleware/auth";
import { requireAdminEnvSecret } from "../../middleware/adminSecret";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { validateBody, validateQuery } from "../../middleware/validate";
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
  getAdminConversation,
  getAdminConversationWithUser,
  getAdminPlatformSettings,
  getAdminRevenue,
  getAdminSellerBalances,
  getAdminUserSummary,
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
  resetAdminUserPassword
} from "./admin.controller";
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
  grantAdminBodySchema
} from "./admin.schemas";
import { conversationMessageSchema } from "../conversations/conversation.schemas";
import { adminVendorApplicationsQuerySchema, patchVendorApplicationSchema } from "../vendorApplications/vendorApplication.schemas";
import { adminCourierApplicationsQuerySchema, patchCourierApplicationSchema } from "../courierApplications/courierApplication.schemas";
import { adminCreateRiderSchema } from "../deliveries/delivery.schemas";
import { listAdminRiders, postAdminCreateRider } from "../deliveries/riderAdmin.controller";

const router = Router();

router.get(
  "/riders",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  validateQuery(adminRidersQuerySchema),
  listAdminRiders
);

router.post(
  "/riders",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  validateBody(adminCreateRiderSchema),
  postAdminCreateRider
);

router.get("/dashboard", protect, requireActiveAccount, authorize("admin"), requireAdminEnvSecret, adminDashboard);
router.get("/badges", protect, requireActiveAccount, authorize("admin"), requireAdminEnvSecret, adminBadges);
router.get("/users", protect, requireActiveAccount, authorize("admin"), requireAdminEnvSecret, validateQuery(adminUsersQuerySchema), listAdminUsers);
router.post(
  "/users/grant-admin",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  requireSuperAdmin,
  validateBody(grantAdminBodySchema),
  grantAdmin
);
router.post(
  "/users/revoke-admin",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  requireSuperAdmin,
  validateBody(grantAdminBodySchema),
  revokeAdmin
);
router.patch("/users/:id", protect, requireActiveAccount, authorize("admin"), requireAdminEnvSecret, validateBody(adminPatchUserSchema), patchAdminUser);
router.get(
  "/businesses",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  validateQuery(adminBusinessesQuerySchema),
  listAdminBusinesses
);
router.post("/businesses/:id/approve", protect, requireActiveAccount, authorize("admin"), requireAdminEnvSecret, approveAdminBusiness);
router.post(
  "/businesses/:id/reject",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  validateBody(adminRejectBusinessSchema),
  rejectAdminBusiness
);
router.get("/products", protect, requireActiveAccount, authorize("admin"), requireAdminEnvSecret, validateQuery(adminProductsQuerySchema), listAdminProducts);
router.post(
  "/products/bulk-approve",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  validateBody(adminApproveProductsBulkSchema),
  approveProductsBulk
);
router.post("/products/:id/approve", protect, requireActiveAccount, authorize("admin"), requireAdminEnvSecret, approveProduct);
router.post(
  "/products/:id/reject",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  validateBody(adminRejectProductSchema),
  rejectProduct
);
router.get("/orders", protect, requireActiveAccount, authorize("admin"), requireAdminEnvSecret, validateQuery(adminOrdersQuerySchema), listAdminOrders);
router.get("/revenue", protect, requireActiveAccount, authorize("admin"), requireAdminEnvSecret, getAdminRevenue);
router.get("/sellers/balances", protect, requireActiveAccount, authorize("admin"), requireAdminEnvSecret, getAdminSellerBalances);
router.get(
  "/vendor-applications",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  validateQuery(adminVendorApplicationsQuerySchema),
  listVendorApplications
);
router.patch(
  "/vendor-applications/:id",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  validateBody(patchVendorApplicationSchema),
  patchAdminVendorApplication
);
router.get(
  "/courier-applications",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  validateQuery(adminCourierApplicationsQuerySchema),
  listCourierApplications
);
router.patch(
  "/courier-applications/:id",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  validateBody(patchCourierApplicationSchema),
  patchAdminCourierApplication
);
router.get("/settings", protect, requireActiveAccount, authorize("admin"), requireAdminEnvSecret, getAdminPlatformSettings);
router.patch(
  "/settings",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  requireSuperAdmin,
  validateBody(adminPlatformSettingsSchema),
  patchAdminPlatformSettings
);
router.post(
  "/settings/email-test",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  requireSuperAdmin,
  validateBody(adminEmailTestSchema),
  postAdminSettingsEmailTest
);
router.get(
  "/email-logs",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  validateQuery(adminEmailLogsQuerySchema),
  listAdminEmailLogs
);
router.get("/reports", protect, requireActiveAccount, authorize("admin"), requireAdminEnvSecret, validateQuery(adminReportsQuerySchema), listAdminReports);
router.patch(
  "/reports/:id",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  validateBody(adminReportPatchSchema),
  patchAdminReport
);
router.get("/conversations", protect, requireActiveAccount, authorize("admin"), requireAdminEnvSecret, validateQuery(adminListQuerySchema), listAdminConversations);
router.get("/conversations/with-user/:userId", protect, requireActiveAccount, authorize("admin"), requireAdminEnvSecret, getAdminConversationWithUser);
router.post(
  "/conversations/with-user/:userId/messages",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  validateBody(conversationMessageSchema),
  postAdminMessageToUser
);
router.get("/conversations/:id", protect, requireActiveAccount, authorize("admin"), requireAdminEnvSecret, getAdminConversation);
router.get("/users/:id/summary", protect, requireActiveAccount, authorize("admin"), requireAdminEnvSecret, getAdminUserSummary);
router.post(
  "/users/:id/reset-password",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  requireSuperAdmin,
  validateBody(adminResetPasswordSchema),
  resetAdminUserPassword
);
router.post(
  "/orders/:id/refund-paystack",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  refundAdminOrderPaystack
);
router.post(
  "/orders/:id/mark-paid",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  markAdminOrderPaid
);
router.patch(
  "/orders/:id",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  validateBody(adminOrderPatchSchema),
  patchAdminOrder
);
router.patch(
  "/products/:id",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  validateBody(adminProductPatchSchema),
  patchAdminProduct
);
router.delete(
  "/products/:id",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  requireSuperAdmin,
  deleteAdminProduct
);
router.delete(
  "/reports/:id",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  requireSuperAdmin,
  deleteAdminReport
);
router.delete(
  "/orders/:id",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  requireSuperAdmin,
  deleteAdminOrder
);
router.delete(
  "/vendor-applications/:id",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  requireSuperAdmin,
  deleteAdminVendorApplication
);
router.delete(
  "/courier-applications/:id",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  requireSuperAdmin,
  deleteAdminCourierApplication
);
router.delete(
  "/users/:id",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  requireSuperAdmin,
  deleteAdminUser
);
router.post(
  "/cleanup",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  requireSuperAdmin,
  adminBulkCleanup
);

router.get(
  "/promotions",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  validateQuery(adminPromotionsQuerySchema),
  adminListPromotions
);
router.post(
  "/promotions",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  validateBody(adminCreatePromotionSchema),
  adminCreatePlatformPromotion
);
router.post(
  "/promotions/:id/approve",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  adminApprovePromotion
);
router.post(
  "/promotions/:id/reject",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  validateBody(adminRejectPromotionSchema),
  adminRejectPromotion
);

export default router;
