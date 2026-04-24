import express from "express";
import path from "path";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

import { env } from "./config/env";
import { protect } from "./middleware/auth";
import { requireActiveAccount } from "./middleware/requireActiveAccount";
import { errorHandler, notFound } from "./middleware/errorHandler";
import { mongoSanitize } from "./middleware/sanitize";
import { validateBody } from "./middleware/validate";
import { deleteAccount } from "./modules/auth/auth.controller";
import { deleteAccountSchema } from "./modules/auth/auth.schemas";
import authRoutes from "./modules/auth/auth.routes";
import orderRoutes from "./modules/orders/order.routes";
import conversationRoutes from "./modules/conversations/conversation.routes";
import adminRoutes from "./modules/admin/admin.routes";
import reportRoutes from "./modules/reports/report.routes";
import paymentsRoutes from "./modules/payments/payments.routes";
import productRoutes from "./modules/products/product.routes";
import uploadRoutes from "./modules/uploads/upload.routes";
import vendorRoutes from "./modules/vendor/vendor.routes";
import { stripeWebhook } from "./modules/payments/payments.controller";

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
      credentials: true
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

  // Stripe webhook must be registered BEFORE JSON parsing
  app.post("/api/payments/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhook);

  app.use(express.json({ limit: "1mb" }));
  app.use(mongoSanitize);

  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  app.get("/", (_req, res) => res.json({ ok: true, service: "backend-api" }));
  app.get("/health", (_req, res) =>
    res.json({
      ok: true,
      /** If these are missing in JSON, this process is an old build — run `npm run build` in backend and restart. */
      accountDeletion: { post: "/api/auth/delete-account", delete: "/api/auth/account" },
      uploads: { profileImage: "POST /api/uploads/profile-image" }
    })
  );

  /** Account deletion on the root app (before the auth router) so these paths always register. */
  const accountDeletion = [protect, requireActiveAccount, validateBody(deleteAccountSchema), deleteAccount] as const;
  app.post("/api/auth/delete-account", ...accountDeletion);
  app.post("/api/auth/account/delete", ...accountDeletion);
  app.delete("/api/auth/account", ...accountDeletion);

  app.use("/api/auth", authRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/uploads", uploadRoutes);
  app.use("/api/products", productRoutes);
  app.use("/api/conversations", conversationRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/orders", orderRoutes);
  app.use("/api/vendor", vendorRoutes);
  app.use("/api/payments", paymentsRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

