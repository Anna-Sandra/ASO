import React, { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { apiFetch } from "./api";
import { useAuth } from "./contexts";
import { h } from "./h";
import { Button, TextInput } from "./ui";

function Bubble({ mine, children }) {
  return h(
    "div",
    {
      className: `max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm sm:max-w-[85%] ${
        mine ? "ml-auto bg-sky-600 text-white" : "mr-auto bg-white text-slate-800 dark:bg-night-800 dark:text-slate-100"
      }`
    },
    children
  );
}

export function ShoppingAssistantFAB() {
  const { accessToken } = useAuth();
  const [open, setOpen] = useState(false);
  /** @type {Array<{role: string, content: string}>} */
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hi — I'm the Campus Mart guide. Ask about listings, budgets, campus delivery basics, or how to report an issue. If your server connects Ollama locally, replies get richer without paid APIs."
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
    const userMsg = { role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setDraft("");
    setBusy(true);
    try {
      const history = prior
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-14)
        .map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));
      const hdr = {};
      if (accessToken) hdr.Authorization = `Bearer ${accessToken}`;
      const data = await apiFetch("/api/assistant/chat", {
        method: "POST",
        headers: hdr,
        json: {
          message: text,
          history
        }
      });
      const reply = typeof data?.reply === "string" ? data.reply.trim() : "No reply.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (ex) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: typeof ex?.message === "string" ? ex.message : "Could not reach the assistant endpoint."
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
                  h("div", { className: "flex items-center gap-2" }, [
                    h(Sparkles, { className: "h-5 w-5 text-violet-600 dark:text-violet-300", "aria-hidden": true }),
                    h("span", { className: "font-display text-sm font-bold text-slate-900 dark:text-white" }, "Mart assistant")
                  ]),
                  h(
                    "button",
                    {
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
                { ref: scrollRef, className: "min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 text-sm sm:min-h-[220px]" },
                messages.map((m, i) => h(Bubble, { key: i, mine: m.role === "user" }, m.content))
              ),
              h("div", { key: "in", className: "flex shrink-0 gap-2 border-t border-white/15 bg-white/90 p-2 dark:bg-night-950/90" }, [
                h(TextInput, {
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
                h(Button, { type: "button", variant: "primary", className: "!rounded-full", loading: busy, onClick: () => void send() }, "Send")
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
            title: "Ask Campus Mart assistant"
          },
          h(Sparkles, { className: "h-6 w-6", "aria-hidden": true })
        )
      ].filter(Boolean)
    )
  );
}
