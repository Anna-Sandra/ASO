import { createApp } from "./app";
import { connectDb } from "./config/db";
import { env } from "./config/env";

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

  const server = app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`API listening on http://localhost:${env.PORT}`);
  });

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

