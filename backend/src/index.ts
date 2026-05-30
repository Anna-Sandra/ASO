import { createServer } from "node:http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import { createApp } from "./app";
import { connectDb } from "./config/db";
import { env, getEmailTransportDiagnostics, isEmailTransportConfigured } from "./config/env";
import { setupDeliverySockets } from "./modules/deliveries/delivery.socket";
import { warmupOllamaInBackground } from "./config/ollamaWarmup";
import { runAutoConfirmDeliveredOrders } from "./modules/orders/orderAutoConfirm.job";

async function main() {
  try {
    await connectDb();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      "[db] MongoDB connection failed — API still starts. Env-based platform admin can sign in; most routes need the database.",
      err
    );
  }
  const app = createApp();
  const server = createServer(app);
  const io = new Server(server, {
    cors: { origin: env.APP_ORIGIN, credentials: true }
  });
  setupDeliverySockets(io);

  // Render (and most PaaS) inject PORT and route health checks to the process; bind all interfaces.
  const listenHost = "0.0.0.0";
  server.listen(env.PORT, listenHost, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://${listenHost}:${env.PORT} (PORT from env)`);
    const emailDiag = getEmailTransportDiagnostics();
    console.log(
      `[email] transport=${emailDiag.mode} configured=${isEmailTransportConfigured()}${emailDiag.hints.length ? ` hints=${emailDiag.hints.join(" ")}` : ""}`
    );
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

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      // eslint-disable-next-line no-console
      console.error(
        `Port ${env.PORT} is already in use. Another process is listening (often a leftover node). Find PID: netstat -ano | findstr :${env.PORT} — last column is PID. Then: taskkill /PID <pid> /F  Or set a different PORT in .env.`
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

