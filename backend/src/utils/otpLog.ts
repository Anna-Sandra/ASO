import { env } from "../config/env";

/** True in development, or when LOG_OTP_IN_CONSOLE is set (e.g. on Render while debugging). */
export function isOtpConsoleLogEnabled(): boolean {
  return env.NODE_ENV !== "production" || env.LOG_OTP_IN_CONSOLE;
}

/**
 * Prints OTP to server stdout (visible in Render → Logs). Never use in API JSON responses.
 */
export function logOtpToConsole(purpose: string, email: string, otp: string): void {
  if (!isOtpConsoleLogEnabled()) return;
  const addr = String(email || "").trim().toLowerCase() || "(no email)";
  // eslint-disable-next-line no-console
  console.log("[shopiqgh:otp]", { purpose, email: addr, otp, expiresInMinutes: 10 });
}
