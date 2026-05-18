/**
 * CRA inlines REACT_APP_* at `npm run build`. If Production is baked with localhost,
 * the deployed SPA keeps calling localhost. On Vercel we fail fast with a clear message.
 */
"use strict";

if (process.env.ALLOW_LOCALHOST_API_BUILD === "1") process.exit(0);
if (process.env.VERCEL !== "1") process.exit(0);

const raw = process.env.REACT_APP_API_URL || "";
const u = raw.replace(/\/$/, "");
const bad = !u || /localhost/i.test(u) || /127\.0\.0\.1/.test(u);

if (!bad) process.exit(0);

console.error(`
[Vercel] Invalid REACT_APP_API_URL=${JSON.stringify(raw || "(empty)")}.

Create React App bakes env vars into the JS bundle at build time — changing them later
(Project → Settings → Environment Variables) requires a **new deployment**.

Fix: Project → Settings → Environment Variables → add for Production (+ Preview):

  REACT_APP_API_URL=https://YOUR-API.onrender.com

(no trailing slash). Then **Redeploy**. Do not rely on frontend/.env for production;
that file is ignored by git and is not uploaded to Vercel.

Override this check only if intentional: ALLOW_LOCALHOST_API_BUILD=1
`);

process.exit(1);
