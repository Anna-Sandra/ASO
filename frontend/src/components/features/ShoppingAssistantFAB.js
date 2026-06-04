import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, X } from "lucide-react";
import { getApiBase , apiErrorMessage} from "services/api";
import { getOrCreateSaveSessionId } from "utils/saveSession";
import { useAuth } from "context";
import { h } from "utils/h";
import { Button, TextInput } from "components/ui";
import { SITE_NAME } from "config/brand";

/** Mirrors backend `ORDER_HELP_INTENT` so we can answer payment/order questions when the API is offline. */
const ORDER_PAY_INTENT =
  /\b(how\s+(do|to|can)\s+(i|you|we)\s+)?(order|buy|purchase|checkout|pay|cart)|\bhow\s+to\s+order|\bwhere\s+(do\s+i|can\s+i)\s+(order|buy|checkout)|\boder\b|i\s+want\s+to\s+(order|buy)/i;

const ORDER_HELP_FULL_MARKER = "🛍️ Most products (you see a price + Buy):";

function wantsOrderPayHelp(msg) {
  return ORDER_PAY_INTENT.test(String(msg || "").trim());
}

function lastAssistantContent(msgs) {
  if (!Array.isArray(msgs)) return "";
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "assistant") return msgs[i].content || "";
  }
  return "";
}

/** Same steps as the server catalog fallback — shown when fetch fails (API down / wrong URL). */
function offlineOrderPayMarkdown(siteName, short) {
  if (short) {
    return (
      `⏩ Quick reminder on ${siteName}: 🛒 Buy → 🧺 Cart → 📋 Checkout → 💳 Paystack. ` +
        `🍽️ Call-to-order food: Place Order on the listing. 📩 Services: Send request.`
    );
  }
  return (
    `💳 How to pay on ${siteName}\n\n` +
      `${ORDER_HELP_FULL_MARKER}\n` +
      `1. 🛒 Tap Buy on the product you want (no account needed; it goes to your cart).\n` +
      `2. 🧺 Open Cart (cart button / drawer).\n` +
      `3. 📋 Tap Checkout and enter email and phone — guest checkout is fine.\n` +
      `4. 💳 Pay with Paystack on the checkout screen.\n\n` +
      `🍽️ Food (buy): open the dish → buy — details on the page.\n\n` +
      `📩 Services (quotes): Send request on the listing (sign-in may be required).\n\n` +
      `🔓 Signing in is optional — useful for order history. 🛒`
  );
}

function apiUnreachableNote() {
  const isDev = process.env.NODE_ENV === "development";
  const dev =
    "Dev tip: run the backend on port 4000 (`npm run dev` in the `backend` folder). If `frontend/.env` sets `REACT_APP_API_URL` to `http://localhost:4000`, either start the API or remove that line and restart `npm start` so `/api` uses the dev-server proxy.";
  const prod =
    "Set `REACT_APP_API_URL` in the frontend build to your live API URL, rebuild, and ensure the API is running.";
  return `\n\n---\n_Live product picks need the assistant API._ ${isDev ? dev : prod}`;
}

/** @returns {Array<{type: 'text'|'img'|'link', value?: string, alt?: string, url?: string, to?: string, label?: string}>} */
function splitAssistantMarkdown(text) {
  if (typeof text !== "string" || !text.length) return [{ type: "text", value: "" }];
  const re = /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\((\/[^)\s]+|https?:[^)\s]+)\)/g;
  const parts = [];
  let last = 0;
  let m = re.exec(text);
  while (m !== null) {
    if (m.index > last) parts.push({ type: "text", value: text.slice(last, m.index) });
    if (m[1] !== undefined && m[2]) {
      parts.push({ type: "img", alt: m[1] || "", url: m[2] });
    } else if (m[3] && m[4]) {
      parts.push({ type: "link", label: m[3], to: m[4] });
    }
    last = m.index + m[0].length;
    m = re.exec(text);
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts.length ? parts : [{ type: "text", value: text }];
}

function isSafeAssistantExternalUrl(url) {
  if (typeof url !== "string" || !/^https:\/\//i.test(url.trim())) return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" && Boolean(u.hostname);
  } catch {
    return false;
  }
}

function isAllowedAssistantImageUrl(url) {
  const base = String(getApiBase() || "").trim().replace(/\/$/, "");
  if (!base || typeof url !== "string" || !/^https?:\/\//i.test(url)) return false;
  try {
    return new URL(url).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

function BubbleContent({ mine, content }) {
  if (mine || typeof content !== "string") {
    return content;
  }
  const parts = splitAssistantMarkdown(content);
  return h(
    "div",
    { className: "space-y-2 whitespace-pre-wrap break-words leading-relaxed [word-break:break-word]" },
    parts.map((p, idx) => {
      if (p.type === "text") {
        return h("span", { key: `t-${idx}` }, p.value || "");
      }
      if (p.type === "link" && p.to) {
        const dest = String(p.to).trim();
        const internal = dest.startsWith("/") && !dest.startsWith("//");
        if (internal) {
          return h(
            Link,
            {
              key: `l-${idx}`,
              to: dest,
              className: "inline font-semibold text-sky-600 underline underline-offset-2 hover:text-sky-500 dark:text-sky-300"
            },
            p.label || dest
          );
        }
        if (!isSafeAssistantExternalUrl(dest)) {
          return h("span", { key: `l-${idx}`, className: "text-slate-500" }, p.label || "[link removed]");
        }
        return h(
          "a",
          {
            key: `l-${idx}`,
            href: dest,
            className: "inline font-semibold text-sky-600 underline underline-offset-2 hover:text-sky-500 dark:text-sky-300",
            target: "_blank",
            rel: "noopener noreferrer"
          },
          p.label || dest
        );
      }
      if (p.type === "img") {
        if (!isAllowedAssistantImageUrl(p.url)) {
          return h(
            "p",
            { key: `b-${idx}`, className: "text-[11px] text-slate-400 dark:text-slate-500" },
            "[Image link only works for this store’s media]"
          );
        }
        return h("img", {
          key: `i-${idx}`,
          src: p.url,
          alt: p.alt || "Product",
          loading: "lazy",
          className: "max-h-40 w-full max-w-full rounded-xl border border-slate-200/80 object-cover dark:border-white/10",
          decoding: "async"
        });
      }
      return null;
    })
  );
}

function Bubble({ mine, children }) {
  return h(
    "div",
    {
      className: `max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm sm:max-w-[85%] ${
        mine ? "ml-auto bg-sky-600 text-white" : "mr-auto bg-white text-slate-800 dark:bg-night-800 dark:text-slate-100"
      }`
    },
    h(BubbleContent, { mine, content: children })
  );
}

export function ShoppingAssistantFAB() {
  const { accessToken } = useAuth();
  const [open, setOpen] = useState(false);
  const msgIdRef = useRef(0);
  /** @type {Array<{id: number, role: string, content: string}>} */
  const [messages, setMessages] = useState(() => [
    {
      id: msgIdRef.current++,
      role: "assistant",
      content:
        "Hi 👋 I'm your SHOPIQGH shopping assistant — here to help you find food, fashion, electronics, and more from local sellers. What are you looking for today?"
    }
  ]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, messages, busy]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || busy) return;
    const prior = messages;
    const userMsg = { id: msgIdRef.current++, role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setDraft("");
    setBusy(true);
    try {
      const history = prior
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-4)
        .map((m) => ({
          role: m.role === "user" ? "user" : "assistant",
          content: m.content
        }));

      const apiBase = String(getApiBase() || "").trim().replace(/\/$/, "");
      if (!apiBase && process.env.NODE_ENV === "production") {
        throw new Error("Set REACT_APP_API_URL in frontend/.env to your production API URL and rebuild.");
      }
      /** In dev without REACT_APP_API_URL, `/api/*` routes through setupProxy.js so SSE still streams tokens. */
      const chatUrl = apiBase ? `${apiBase}/api/assistant/chat` : "/api/assistant/chat";

      const headers = new Headers({ "Content-Type": "application/json", Accept: "text/event-stream" });
      if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
      const sid = getOrCreateSaveSessionId();
      if (sid) headers.set("X-Save-Session", sid);

      const res = await fetch(chatUrl, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify({ message: text, history, stream: true })
      });

      if (!res.ok) {
        let msg = `Request failed (${res.status})`;
        try {
          const j = await res.json();
          if (typeof j?.message === "string") msg = j.message;
          else if (typeof j?.error === "string") msg = j.error;
          else if (j?.error?.message) msg = j.error.message;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }

      const ct = res.headers.get("content-type") || "";

      if (!ct.includes("text/event-stream")) {
        const data = await res.json();
        const reply = typeof data?.reply === "string" ? data.reply.trim() : "No reply.";
        setMessages((prev) => [...prev, { id: msgIdRef.current++, role: "assistant", content: reply }]);
        return;
      }

      const assistantId = msgIdRef.current++;
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

      const reader = res.body && res.body.getReader();
      if (!reader) throw new Error("No response stream from assistant.");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      const flushBlocks = () => {
        for (;;) {
          const sep = buffer.indexOf("\n\n");
          if (sep < 0) break;
          const block = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const line = block.split("\n").find((ln) => ln.startsWith("data:"));
          if (!line) continue;
          const raw = line.replace(/^data:\s*/, "").trim();
          if (!raw) continue;
          let j;
          try {
            j = JSON.parse(raw);
          } catch {
            continue;
          }
          if (typeof j.delta === "string" && j.delta.length) {
            fullText += j.delta;
            const t = fullText;
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: t } : m)));
          }
          if (j.done === true && typeof j.reply === "string") {
            fullText = j.reply;
            const t = fullText;
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: t } : m)));
          }
          if (j.error && typeof j.reply === "string") {
            fullText = j.reply;
            const t = fullText;
            setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, content: t } : m)));
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        flushBlocks();
      }
      flushBlocks();
      buffer += "\n\n";
      flushBlocks();

      const final = fullText.trim();
      if (!final) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: "I couldn't load a reply just now — try again, or browse Food & drinks from the home page." }
              : m
          )
        );
      }
    } catch (ex) {
      const raw =
        typeof ex?.message === "string" ? ex.message : "Could not reach the assistant endpoint.";
      const networkFail = /failed to fetch|networkerror|load failed|connection refused/i.test(raw);
      let content;
      if (networkFail && wantsOrderPayHelp(text)) {
        const prevA = lastAssistantContent(prior);
        const short = prevA.includes(ORDER_HELP_FULL_MARKER);
        content = offlineOrderPayMarkdown(SITE_NAME, short) + apiUnreachableNote();
      } else if (networkFail) {
        content =
          "Can't reach the shopping assistant API right now.\n\n" +
          (process.env.NODE_ENV === "development"
            ? "Start the backend on port 4000, or leave REACT_APP_API_URL unset in frontend/.env and restart npm start so /api is proxied to the API."
            : "Check that REACT_APP_API_URL points at your running API and redeploy the frontend.");
      } else {
        content = raw;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: msgIdRef.current++,
          role: "assistant",
          content
        }
      ]);
    } finally {
      setBusy(false);
    }
  }, [busy, draft, messages, accessToken]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return h(
    React.Fragment,
    null,
    h(
      "div",
      { className: "pointer-events-none fixed bottom-20 right-3 z-[45] flex flex-col items-end sm:bottom-6 sm:right-5" },
      [
        open &&
          h(
            "div",
            {
              key: "panel",
              className:
                "animate-notice-pop pointer-events-auto mb-3 flex max-h-[min(70vh,520px)] w-[min(94vw,400px)] flex-col overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl dark:border-white/10 dark:bg-night-900"
            },
            [
              h(
                "div",
                {
                  key: "head",
                  className:
                    "flex shrink-0 items-center justify-between border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-violet-50 px-4 py-3 dark:border-white/10 dark:from-indigo-950/40 dark:to-violet-950/30"
                },
                [
                  h(
                    "div",
                    { key: "title-row", className: "flex items-center gap-2" },
                    [
                      h(Sparkles, { key: "ic", className: "h-5 w-5 text-violet-600 dark:text-violet-300", "aria-hidden": true }),
                      h("span", { key: "ttl", className: "font-display text-sm font-bold text-slate-900 dark:text-white" }, "Shopping assistant")
                    ]
                  ),
                  h(
                    "button",
                    {
                      key: "close-panel",
                      type: "button",
                      className: "tap-target rounded-xl border border-white/70 p-1.5 hover:bg-white/60 dark:border-white/10 dark:hover:bg-white/10",
                      onClick: () => setOpen(false),
                      "aria-label": "Close assistant"
                    },
                    h(X, { className: "h-4 w-4 text-slate-600 dark:text-slate-300" })
                  )
                ]
              ),
              h(
                "div",
                {
                  key: "msgs",
                  ref: scrollRef,
                  className: "min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 text-sm sm:min-h-[220px]"
                },
                messages.map((m) => h(Bubble, { key: m.id, mine: m.role === "user" }, m.content))
              ),
              h("div", { key: "in", className: "flex shrink-0 gap-2 border-t border-white/15 bg-white/90 p-2 dark:bg-night-950/90" }, [
                h(TextInput, {
                  key: "draft",
                  className: "flex-1 !rounded-2xl",
                  placeholder: "Ask about products, prices, pickup…",
                  value: draft,
                  onChange: (e) => setDraft(e.target.value),
                  onKeyDown: (e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }
                }),
                h(Button, {
                  key: "send",
                  type: "button",
                  variant: "primary",
                  className: "!rounded-full",
                  loading: busy,
                  onClick: () => void send()
                }, "Send")
              ])
            ].filter(Boolean)
          ),
        h(
          "button",
          {
            key: "fab",
            type: "button",
            onClick: () => setOpen((o) => !o),
            className:
              "pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-sky-500 text-white shadow-xl shadow-indigo-900/40 ring-4 ring-white/50 transition hover:brightness-105 dark:ring-night-950/60",
            "aria-label": open ? "Close shopping assistant" : "Open shopping assistant",
            title: "Ask SHOPIQGH assistant"
          },
          h(Sparkles, { className: "h-6 w-6", "aria-hidden": true })
        )
      ].filter(Boolean)
    )
  );
}
