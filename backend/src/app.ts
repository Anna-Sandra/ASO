import express from "express";
import path from "path";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import { env } from "./config/env";
import { authorize, optionalProtect, protect } from "./middleware/auth";
import { requireAdminEnvSecret } from "./middleware/adminSecret";
import { requireActiveAccount } from "./middleware/requireActiveAccount";
import { errorHandler, notFound } from "./middleware/errorHandler";
import { mongoSanitize } from "./middleware/sanitize";
import { validateBody, validateQuery } from "./middleware/validate";
import { deleteAccount } from "./modules/auth/auth.controller";
import { deleteAccountSchema } from "./modules/auth/auth.schemas";
import authRoutes from "./modules/auth/auth.routes";
import orderRoutes from "./modules/orders/order.routes";
import conversationRoutes from "./modules/conversations/conversation.routes";
import adminRoutes from "./modules/admin/admin.routes";
import { adminRidersQuerySchema } from "./modules/admin/admin.schemas";
import { markAdminOrderPaid } from "./modules/admin/admin.controller";
import { listAdminRiders } from "./modules/deliveries/riderAdmin.controller";
import reportRoutes from "./modules/reports/report.routes";
import paymentsRoutes from "./modules/payments/payments.routes";
import productRoutes from "./modules/products/product.routes";
import { recommendProducts } from "./modules/products/product.controller";
import { recommendedProductsQuerySchema } from "./modules/products/product.schemas";
import uploadRoutes from "./modules/uploads/upload.routes";
import { uploadBookPdf, uploadBookPdfMiddleware } from "./modules/uploads/upload.controller";
import vendorRoutes from "./modules/vendor/vendor.routes";
import vendorApplicationRoutes from "./modules/vendorApplications/vendorApplication.routes";
import courierApplicationRoutes from "./modules/courierApplications/courierApplication.routes";
import { postAssistantChat } from "./modules/assistant/assistant.controller";
import { assistantChatSchema } from "./modules/assistant/assistant.schemas";
import platformRoutes from "./modules/platform/platform.routes";
import notificationRoutes from "./modules/notifications/notification.routes";
import deliveryRoutes from "./modules/deliveries/delivery.routes";
import {
  initPaystackGuide,
  paystackWebhook,
  stripeWebhook,
  verifyPaystackByReference
} from "./modules/payments/payments.controller";
import { paystackInitGuideSchema } from "./modules/payments/payments.schemas";

export function createApp() {
  const app = express();
  // Respect one reverse proxy hop (common on hosting platforms/load balancers).
  app.set("trust proxy", 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" }
    })
  );
  app.use(
    cors({
      origin: env.APP_ORIGIN,
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "X-Save-Session", "X-Admin-Secret"]
    })
  );

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false
    })
  );

  app.use(morgan("dev"));
  app.use(cookieParser());

  // Payment webhooks must be registered BEFORE JSON parsing (raw body for signature verification).
  app.post("/api/payments/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhook);
  app.post("/api/payments/paystack/webhook", express.raw({ type: "application/json" }), paystackWebhook);
  /** Paystack guide path — same handler as /api/payments/paystack/webhook */
  app.post("/api/paystack/webhook", express.raw({ type: "application/json" }), paystackWebhook);

  app.use(express.json({ limit: "1mb" }));
  app.use(mongoSanitize);

  /** Paystack guide paths on the root app (also under POST /api/payments/paystack/init for the same handlers). */
  app.post(
    "/api/paystack/init",
    protect,
    requireActiveAccount,
    validateBody(paystackInitGuideSchema),
    initPaystackGuide
  );
  app.get(
    "/api/paystack/verify/:ref",
    protect,
    requireActiveAccount,
    verifyPaystackByReference
  );

  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  app.get("/", (_req, res) => res.json({ ok: true, service: "backend-api" }));
  app.get("/health", (_req, res) =>
    res.json({
      ok: true,
      /** If these are missing in JSON, this process is an old build — run `npm run build` in backend and restart. */
      accountDeletion: { post: "/api/auth/delete-account", delete: "/api/auth/account" },
      reports: {
        listMine: "GET /api/reports (or GET /api/reports/me)",
        create: "POST /api/reports"
      },
      adminOrderMarkPaid: "POST /api/admin/orders/:id/mark-paid",
      adminOrderMarkPaidOrdersPath: "POST /api/orders/:id/admin/mark-paid",
      uploads: {
        profileImage: "POST /api/uploads/profile-image",
        bookPdf: "POST /api/uploads/book-pdf (field: file; seller|admin; PDF only; max 15MB)",
        vendorVerification: "POST /api/uploads/vendor-verification (field: file; buyer; JPEG/PNG/PDF; max 5MB)",
        reportEvidence: "POST /api/uploads/report-evidence (field: file; buyer|seller; JPEG/PNG/WebP; max 5MB)"
      },
      assistant: { chat: "POST /api/assistant/chat" }
    })
  );

  /** Account deletion on the root app (before the auth router) so these paths always register. */
  const accountDeletion = [protect, requireActiveAccount, validateBody(deleteAccountSchema), deleteAccount] as const;
  app.post("/api/auth/delete-account", ...accountDeletion);
  app.post("/api/auth/account/delete", ...accountDeletion);
  app.delete("/api/auth/account", ...accountDeletion);

  app.use("/api/platform", platformRoutes);
  /**
   * Chat assistant — mounted here (not only on a sub-router) so `npm start` builds always expose the path even if
   * a stale compiled router module omitted it.
   */
  app.post(
    "/api/assistant/chat",
    optionalProtect,
    validateBody(assistantChatSchema),
    postAssistantChat
  );
  app.use("/api/auth", authRoutes);
  app.use("/api/reports", reportRoutes);
  /** Same handler as the uploads router — registered on the root app so this POST always resolves (avoids stale `dist/upload.routes` misses). */
  app.post(
    "/api/uploads/book-pdf",
    protect,
    requireActiveAccount,
    authorize("seller", "admin"),
    uploadBookPdfMiddleware,
    uploadBookPdf
  );
  app.use("/api/uploads", uploadRoutes);
  /**
   * Registered here (before `/api/products` router) so `GET …/recommended` is never swallowed by `GET …/:id`
   * when an older deployed `dist` lacks the `/recommended` entry under the products router (id becomes the
   * string `"recommended"` → invalid ObjectId → "Invalid product id" on the storefront).
   */
  app.get(
    "/api/products/recommended",
    optionalProtect,
    validateQuery(recommendedProductsQuerySchema),
    recommendProducts
  );
  app.use("/api/products", productRoutes);
  app.use("/api/conversations", conversationRoutes);
  /**
   * Registers before `/api/admin` router so POST always hits — avoids 404 when a stale compiled admin router lacks this route.
   */
  app.post(
    "/api/admin/orders/:id/mark-paid",
    protect,
    requireActiveAccount,
    authorize("admin"),
    requireAdminEnvSecret,
    markAdminOrderPaid
  );
  /** Same handler; registered before `orderRoutes` so deployments always expose this POST even if dist/router is stale. */
  app.post(
    "/api/orders/:id/admin/mark-paid",
    protect,
    requireActiveAccount,
    authorize("admin"),
    requireAdminEnvSecret,
    markAdminOrderPaid
  );
  /**
   * Same pattern as `/api/admin/orders/:id/mark-paid`: ensure rider list resolves even when an old compiled
   * `admin.routes.js` omitting GET `/riders` is still deployed.
   */
  app.get(
    "/api/admin/riders",
    protect,
    requireActiveAccount,
    authorize("admin"),
    requireAdminEnvSecret,
    validateQuery(adminRidersQuerySchema),
    listAdminRiders
  );
  app.use("/api/admin", adminRoutes);
  app.use("/api/orders", orderRoutes);
  app.use("/api/vendor", vendorRoutes);
  app.use("/api/vendor-applications", vendorApplicationRoutes);
  app.use("/api/courier-applications", courierApplicationRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/payments", paymentsRoutes);
  app.use("/api/deliveries", deliveryRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

