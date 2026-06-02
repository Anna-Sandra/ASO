import { createServer } from "node:http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import { createApp } from "./app";
import { connectDb } from "./config/db";
import { env, getEmailTransportDiagnostics, isEmailTransportConfigured } from "./config/env";
import { isOtpConsoleLogEnabled } from "./utils/otpLog";
import { setupDeliverySockets } from "./modules/deliveries/delivery.socket";
import { warmupOllamaInBackground } from "./config/ollamaWarmup";
import { runAutoConfirmDeliveredOrders } from "./modules/orders/orderAutoConfirm.job";
import { runAbandonedCartReminders } from "./modules/orders/orderAbandonedReminder.job";
import { getUploadStorageDiagnostics } from "./utils/uploadStorage";

function startBackgroundDb() {
  void connectDb().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(
      "[db] MongoDB connection failed — API still runs. Env-based platform admin can sign in; most routes need the database.",
      err
    );
  });
}

async function main() {
  const app = createApp();
  const server = createServer(app);
  const io = new Server(server, {
    cors: { origin: env.APP_ORIGIN, credentials: true }
  });
  setupDeliverySockets(io);

  // Render (and most PaaS) inject PORT and route health checks to the process; bind all interfaces.
  const listenHost = "0.0.0.0";
  const port = Number(process.env.PORT) || env.PORT;
  server.listen(port, listenHost, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://${listenHost}:${port} (PORT from env)`);
    startBackgroundDb();
    const emailDiag = getEmailTransportDiagnostics();
    console.log(
      `[email] transport=${emailDiag.mode} configured=${isEmailTransportConfigured()}${emailDiag.hints.length ? ` hints=${emailDiag.hints.join(" ")}` : ""}`
    );
    const uploadDiag = getUploadStorageDiagnostics();
    console.log(
      `[uploads] storage=${uploadDiag.storage} persistent=${uploadDiag.persistent}${
        uploadDiag.warning ? ` — ${uploadDiag.warning}` : ""
      }`
    );
    if (isOtpConsoleLogEnabled()) {
      console.log(
        env.LOG_OTP_IN_CONSOLE
          ? "[otp] LOG_OTP_IN_CONSOLE=true — OTPs will appear in server logs (e.g. Render Logs). Disable after debugging."
          : "[otp] Non-production — OTPs are logged to this console automatically."
      );
    }
    if (env.OLLAMA_BASE_URL.trim() && !env.GROQ_API_KEY.trim()) {
      warmupOllamaInBackground();
    }
  });

  const AUTO_CONFIRM_MS = 60 * 60 * 1000;
  setInterval(() => {
    if (mongoose.connection.readyState !== 1) return;
    void runAutoConfirmDeliveredOrders().catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[jobs] auto-confirm delivered orders:", err);
    });
  }, AUTO_CONFIRM_MS);
  setTimeout(() => {
    if (mongoose.connection.readyState !== 1) return;
    void runAutoConfirmDeliveredOrders().catch(() => {});
  }, 45_000);

  const ABANDONED_CART_MS = 30 * 60 * 1000;
  setInterval(() => {
    if (mongoose.connection.readyState !== 1) return;
    void runAbandonedCartReminders().catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[jobs] abandoned cart reminders:", err);
    });
  }, ABANDONED_CART_MS);
  setTimeout(() => {
    if (mongoose.connection.readyState !== 1) return;
    void runAbandonedCartReminders().catch(() => {});
  }, 90_000);

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      // eslint-disable-next-line no-console
      console.error(
        `Port ${port} is already in use. Another process is listening (often a leftover node). Find PID: netstat -ano | findstr :${port} — last column is PID. Then: taskkill /PID <pid> /F  Or set a different PORT in .env.`
      );
    } else {
      // eslint-disable-next-line no-console
      console.error(err);
    }
    process.exit(1);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

