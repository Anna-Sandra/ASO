import { Router } from "express";
import { protect, authorize } from "../../middleware/auth";
import { requireAdminEnvSecret } from "../../middleware/adminSecret";
import { requireActiveAccount } from "../../middleware/requireActiveAccount";
import { validateBody, validateQuery } from "../../middleware/validate";
import {
  adminDashboard,
  approveProduct,
  deleteAdminProduct,
  getAdminConversation,
  getAdminPlatformSettings,
  getAdminRevenue,
  getAdminSellerBalances,
  getAdminUserSummary,
  listAdminConversations,
  listAdminOrders,
  listAdminProducts,
  listAdminReports,
  listAdminUsers,
  patchAdminOrder,
  patchAdminPlatformSettings,
  patchAdminProduct,
  patchAdminReport,
  patchAdminUser,
  rejectProduct,
  resetAdminUserPassword
} from "./admin.controller";
import {
  adminListQuerySchema,
  adminOrderPatchSchema,
  adminOrdersQuerySchema,
  adminPatchUserSchema,
  adminPlatformSettingsSchema,
  adminProductPatchSchema,
  adminProductsQuerySchema,
  adminRejectProductSchema,
  adminReportPatchSchema,
  adminReportsQuerySchema,
  adminResetPasswordSchema,
  adminUsersQuerySchema
} from "./admin.schemas";

const router = Router();

router.get("/dashboard", protect, requireActiveAccount, authorize("admin"), requireAdminEnvSecret, adminDashboard);
router.get("/users", protect, requireActiveAccount, authorize("admin"), requireAdminEnvSecret, validateQuery(adminUsersQuerySchema), listAdminUsers);
router.patch("/users/:id", protect, requireActiveAccount, authorize("admin"), requireAdminEnvSecret, validateBody(adminPatchUserSchema), patchAdminUser);
router.get("/products", protect, requireActiveAccount, authorize("admin"), requireAdminEnvSecret, validateQuery(adminProductsQuerySchema), listAdminProducts);
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
router.get("/settings", protect, requireActiveAccount, authorize("admin"), requireAdminEnvSecret, getAdminPlatformSettings);
router.patch(
  "/settings",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  validateBody(adminPlatformSettingsSchema),
  patchAdminPlatformSettings
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
router.get("/conversations/:id", protect, requireActiveAccount, authorize("admin"), requireAdminEnvSecret, getAdminConversation);
router.get("/users/:id/summary", protect, requireActiveAccount, authorize("admin"), requireAdminEnvSecret, getAdminUserSummary);
router.post(
  "/users/:id/reset-password",
  protect,
  requireActiveAccount,
  authorize("admin"),
  requireAdminEnvSecret,
  validateBody(adminResetPasswordSchema),
  resetAdminUserPassword
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
router.delete("/products/:id", protect, requireActiveAccount, authorize("admin"), requireAdminEnvSecret, deleteAdminProduct);

export default router;
