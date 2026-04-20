import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { useAuth } from "./AuthContext";
import { useNotice } from "./NoticeContext";
import { useTheme } from "./ThemeContext";
import { h, f } from "./h";
import { apiFetch } from "./api";
import { Button, Field, GlassPanel, InlineNotice, LogoMark, RefImage, TextInput, ThemeToggleButton } from "./ui";

/** Prefer server message from `apiFetch` errors; avoid empty or generic fallbacks. */
function apiErrorMessage(ex, fallback) {
  const m = ex && typeof ex.message === "string" ? ex.message.trim() : "";
  if (m && m !== "Validation error") return m;
  if (ex?.status === 400) return fallback || "Check your input and try again.";
  return m || fallback || "Something went wrong. Try again.";
}

/** After login/register as buyer: return to guarded route (e.g. /checkout) or storefront. */
function postBuyerAuthRedirectPath(state) {
  const from = state && typeof state.from === "string" ? state.from : null;
  if (!from || !from.startsWith("/")) return "/";
  if (from.startsWith("/login") || from.startsWith("/register")) return "/";
  if (from.startsWith("/vendor")) return "/";
  if (from.startsWith("/orders")) return "/";
  if (from === "/shop" || from.startsWith("/shop?")) return "/";
  return from;
}

function buyerWelcomeLabel(user, identifierFallback) {
  const d = user?.displayName && String(user.displayName).trim();
  if (d) return d;
  const em = user?.email && String(user.email).split("@")[0];
  if (em) return em;
  if (user?.phone) return String(user.phone).replace(/\s+/g, "").slice(-10) || String(user.phone);
  const id = identifierFallback && String(identifierFallback).trim();
  if (id) {
    if (id.includes("@")) return id.split("@")[0];
    return id.length > 12 ? id.slice(-10) : id;
  }
  return "there";
}

/** e.g. "(Y) Yaa" — initial in parentheses + display or fallback label */
function userAvatarLetter(user) {
  if (!user) return "?";
  const name = String(user.displayName || "").trim();
  if (name.length) {
    const ch = name.charAt(0);
    if (/[a-zA-Z]/i.test(ch)) return ch.toUpperCase();
    if (/[0-9]/.test(ch)) return ch;
  }
  const em = String(user.email || "").trim();
  if (em.length) {
    const local = em.split("@")[0] || em;
    const ch = local.charAt(0);
    if (/[a-zA-Z0-9]/.test(ch)) return ch.toUpperCase();
  }
  const raw = String(user.phone || "").trim();
  if (raw.length) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length) return digits.charAt(0);
  }
  return "?";
}

function buyerDisplayHandle(user, identifierFallback) {
  const label = buyerWelcomeLabel(user, identifierFallback);
  const L = userAvatarLetter(user) || (label ? String(label).charAt(0).toUpperCase() : "?");
  return `(${L}) ${label}`;
}

export function LoginPage() {
  const nav = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { toast } = useNotice();
  const [loginMode, setLoginMode] = useState("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const data = await login(identifier.trim(), password);
      const role = data?.user?.role;
      if (role === "seller") {
        nav("/vendor/dashboard", { replace: true });
      } else {
        const who = buyerDisplayHandle(data?.user, identifier);
        toast(`Welcome, ${who}!`, { variant: "success" });
        nav(postBuyerAuthRedirectPath(location.state), { replace: true });
      }
    } catch (ex) {
      const msg = apiErrorMessage(
        ex,
        "We couldn't sign you in. Check your email or phone and password, then try again."
      );
      if (ex.status === 403 && /verify/i.test(msg)) {
        setErr(
          `${msg} If you're testing locally, your admin can set AUTH_SKIP_EMAIL_VERIFICATION in the server environment.`
        );
      } else {
        setErr(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return h("div", { className: "relative min-h-screen overflow-hidden" }, [
    h(RefImage, {
      key: "bg",
      n: 17,
      alt: "",
      className: "pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40 dark:opacity-25"
    }),
    h("div", {
      key: "overlay",
      className:
        "absolute inset-0 bg-gradient-to-b from-slate-100/90 via-slate-100/80 to-slate-200/90 dark:from-night-950/95 dark:via-night-950/90 dark:to-slate-950/95"
    }),
    h(
      "div",
      { key: "content", className: "relative z-10 mx-auto flex min-h-screen max-w-lg flex-col px-4 py-8 sm:px-6" },
      [
        h("div", { key: "topbar", className: "mb-6 flex items-center justify-between" }, [
          h(Link, { key: "home", to: "/", className: "flex items-center gap-2" }, [
            h(LogoMark, { key: "lm" }),
            h(
              "span",
              { key: "nm", className: "font-display text-xl font-semibold text-slate-900 dark:text-white" },
              "Campus Mart"
            )
          ]),
        ]),
        h(GlassPanel, { key: "panel", className: "mx-auto w-full max-w-md" }, [
          h("h1", { key: "t1", className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, "Welcome back"),
          h("p", { key: "sub", className: "mt-1 text-sm text-slate-600 dark:text-slate-400" }, "Sign in to continue shopping."),
          h(
            "form",
            { key: "frm", className: "mt-6 space-y-4", onSubmit },
            [
              h(Field, { key: "f-id", label: loginMode === "email" ? "Email" : "Phone number" }, h(TextInput, {
                type: loginMode === "email" ? "email" : "tel",
                autoComplete: "username",
                value: identifier,
                onChange: (e) => setIdentifier(e.target.value),
                placeholder: loginMode === "email" ? "you@email.com" : "+233...",
                required: true
              })),
              h("div", { key: "mode", className: "grid grid-cols-2 gap-2" }, [
                h(
                  Button,
                  {
                    key: "email",
                    type: "button",
                    variant: loginMode === "email" ? "primary" : "ghost",
                    className: "!min-h-[28px] !px-2.5 !py-1 !text-[11px]",
                    onClick: () => {
                      setLoginMode("email");
                      setIdentifier("");
                    }
                  },
                  "Email"
                ),
                h(
                  Button,
                  {
                    key: "phone",
                    type: "button",
                    variant: loginMode === "phone" ? "primary" : "ghost",
                    className: "!min-h-[28px] !px-2.5 !py-1 !text-[11px]",
                    onClick: () => {
                      setLoginMode("phone");
                      setIdentifier("");
                    }
                  },
                  "Phone"
                )
              ]),
              h(Field, { key: "f-pass", label: "Password" }, h("div", { key: "pw-wrap", className: "relative" }, [
                h(TextInput, {
                  key: "pw",
                  type: show ? "text" : "password",
                  autoComplete: "current-password",
                  value: password,
                  onChange: (e) => setPassword(e.target.value),
                  placeholder: "••••••••",
                  className: "pr-12",
                  required: true
                }),
                h(
                  "button",
                  {
                    key: "eye",
                    type: "button",
                    className:
                      "tap-target absolute right-1 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-500 hover:bg-white/40 dark:text-slate-400 dark:hover:bg-white/10",
                    onClick: () => setShow((s) => !s)
                  },
                  show ? h(EyeOff, { className: "h-5 w-5" }) : h(Eye, { className: "h-5 w-5" })
                )
              ])),
              err
                ? h(InlineNotice, { key: "err", variant: "error", onDismiss: () => setErr("") }, err)
                : null,
              h(Button, { key: "sub", type: "submit", className: "w-full", loading }, "Sign in"),
              h(
                "div",
                { key: "links", className: "flex flex-wrap justify-between gap-2 text-sm" },
                [
                  h(Link, { key: "fg", to: "/forgot-password", className: "text-sky-600 hover:underline dark:text-sky-300" }, "Forgot password?"),
                  h(Link, { key: "reg", to: "/register", className: "text-sky-600 hover:underline dark:text-sky-300" }, "Create account")
                ]
              )
            ]
          )
        ])
      ]
    )
  ]);
}

export function RegisterPage() {
  const nav = useNavigate();
  const location = useLocation();
  const { register, login, setUser } = useAuth();
  const { toast } = useNotice();
  const [registerMode, setRegisterMode] = useState("email");
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [role, setRole] = useState("buyer");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErr("Enter your name (how you want to be shown).");
      return;
    }
    setLoading(true);
    try {
      const id = identifier.trim();
      const isEmail = registerMode === "email";
      const regData = await register({
        identifier: id,
        password,
        role,
        displayName: trimmedName,
        username: trimmedName
      });
      try {
        const data = await login(id, password);
        let loginUser = data?.user || null;
        const hasDisplayName = !!String(loginUser?.displayName || "").trim();
        if (!hasDisplayName && trimmedName && data?.accessToken) {
          try {
            const profileData = await apiFetch("/api/auth/profile", {
              method: "PATCH",
              headers: { Authorization: `Bearer ${data.accessToken}` },
              json: { displayName: trimmedName }
            });
            if (profileData?.user) {
              loginUser = profileData.user;
              setUser(profileData.user);
            } else {
              setUser((prev) => ({ ...(prev || {}), displayName: trimmedName }));
              loginUser = { ...(loginUser || {}), displayName: trimmedName };
            }
          } catch {
            setUser((prev) => ({ ...(prev || {}), displayName: trimmedName }));
            loginUser = { ...(loginUser || {}), displayName: trimmedName };
          }
        }
        const nextRole = loginUser?.role || role;
        if (nextRole === "seller") nav("/vendor/dashboard", { replace: true });
        else {
          const who = buyerDisplayHandle(loginUser, id);
          toast(`Welcome, ${who}! Your account is ready.`, { variant: "success" });
          nav(postBuyerAuthRedirectPath(location.state), { replace: true });
        }
      } catch (lex) {
        if (isEmail && lex.status === 403 && /verify/i.test(lex.message || "")) {
          nav("/verify-email", { state: { email: id.toLowerCase(), name }, replace: true });
        } else {
          throw lex;
        }
      }
    } catch (ex) {
      setErr(
        apiErrorMessage(
          ex,
          "Registration didn't complete. Check your details and password rules, then try again."
        )
      );
    } finally {
      setLoading(false);
    }
  };

  return h("div", { className: "relative min-h-screen overflow-hidden" }, [
    h(RefImage, {
      key: "bg",
      n: 18,
      alt: "",
      className: "pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35 dark:opacity-20"
    }),
    h("div", {
      key: "overlay",
      className:
        "absolute inset-0 bg-gradient-to-b from-amber-50/90 via-slate-100/85 to-slate-200/90 dark:from-night-950/95 dark:via-night-950/90 dark:to-slate-950/95"
    }),
    h(
      "div",
      { key: "content", className: "relative z-10 mx-auto flex min-h-screen max-w-lg flex-col px-4 py-8 sm:px-6" },
      [
        h("div", { key: "topbar", className: "mb-6 flex items-center justify-between" }, [
          h(Link, { key: "home", to: "/", className: "flex items-center gap-2" }, [
            h(LogoMark, { key: "lm" }),
            h("span", { key: "nm", className: "font-display text-xl font-semibold text-slate-900 dark:text-white" }, "Campus Mart")
          ]),
        ]),
        h(GlassPanel, { key: "panel", className: "mx-auto w-full max-w-md" }, [
          h("h1", { key: "t1", className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, "Join us"),
          h("p", { key: "sub", className: "mt-1 text-sm text-slate-600 dark:text-slate-400" }, "Create your account to get started."),
          h(
            "form",
            { key: "frm", className: "mt-6 space-y-4", onSubmit },
            [
              h(
                Field,
                {
                  key: "f-name",
                  label: h("span", { className: "inline-flex items-center gap-1" }, [
                    h(User, { key: "i", className: "h-3.5 w-3.5" }),
                    h("span", { key: "t" }, " Full name")
                  ])
                },
                h(TextInput, {
                  value: name,
                  onChange: (e) => setName(e.target.value),
                  placeholder: "Yaa",
                  autoComplete: "name",
                  required: true
                })
              ),
              h(
                Field,
                {
                  key: "f-email",
                  label: h("span", { className: "inline-flex items-center gap-1" }, [
                    h(Mail, { key: "i", className: "h-3.5 w-3.5" }),
                    h("span", { key: "t" }, registerMode === "email" ? " Email" : " Phone")
                  ])
                },
                h(TextInput, {
                  type: registerMode === "email" ? "email" : "tel",
                  value: identifier,
                  onChange: (e) => setIdentifier(e.target.value),
                  placeholder: registerMode === "email" ? "your@email.com" : "+233...",
                  required: true,
                  autoComplete: "username"
                })
              ),
              h("div", { key: "mode", className: "grid grid-cols-2 gap-2" }, [
                h(
                  Button,
                  {
                    key: "email",
                    type: "button",
                    variant: registerMode === "email" ? "primary" : "ghost",
                    className: "!min-h-[28px] !px-2.5 !py-1 !text-[11px]",
                    onClick: () => {
                      setRegisterMode("email");
                      setIdentifier("");
                    }
                  },
                  "Email"
                ),
                h(
                  Button,
                  {
                    key: "phone",
                    type: "button",
                    variant: registerMode === "phone" ? "primary" : "ghost",
                    className: "!min-h-[28px] !px-2.5 !py-1 !text-[11px]",
                    onClick: () => {
                      setRegisterMode("phone");
                      setIdentifier("");
                    }
                  },
                  "Phone"
                )
              ]),
              h(Field, {
                key: "f-pass",
                label: h("span", { className: "inline-flex items-center gap-1" }, [
                  h(Lock, { key: "i", className: "h-3.5 w-3.5" }),
                  h("span", { key: "t" }, " Password")
                ])
              }, h("div", { key: "pw-stack", className: "space-y-1.5" }, [
                h("div", { key: "pw-row", className: "relative" }, [
                  h(TextInput, {
                    key: "pw",
                    type: show ? "text" : "password",
                    value: password,
                    onChange: (e) => setPassword(e.target.value),
                    placeholder: "••••••••",
                    className: "pr-12",
                    required: true,
                    autoComplete: "new-password",
                    minLength: 8
                  }),
                  h(
                    "button",
                    {
                      key: "eye",
                      type: "button",
                      className:
                        "tap-target absolute right-1 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-500 hover:bg-white/40 dark:text-slate-400 dark:hover:bg-white/10",
                      onClick: () => setShow((s) => !s)
                    },
                    show ? h(EyeOff, { className: "h-5 w-5" }) : h(Eye, { className: "h-5 w-5" })
                  )
                ]),
                h(
                  "p",
                  { key: "hint", className: "text-xs text-slate-500 dark:text-slate-400" },
                  "8+ characters with upper, lower, number, and a symbol."
                )
              ])),
              h("div", { key: "role", className: "space-y-2" }, [
                h("p", { key: "rl", className: "text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, "I am a…"),
                h("div", { key: "grid", className: "grid grid-cols-2 gap-2 sm:gap-3" }, [
                  h(
                    "button",
                    {
                      key: "buyer",
                      type: "button",
                      onClick: () => setRole("buyer"),
                      className: `tap-target rounded-2xl border px-3 py-3 text-sm font-medium transition sm:text-base ${
                        role === "buyer"
                          ? "border-sky-500/60 bg-sky-500/15 text-slate-900 dark:border-sky-400/50 dark:text-white"
                          : "border-slate-300/70 bg-white/30 text-slate-700 hover:bg-white/50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                      }`
                    },
                    "Student (Buyer)"
                  ),
                  h(
                    "button",
                    {
                      key: "seller",
                      type: "button",
                      onClick: () => setRole("seller"),
                      className: `tap-target rounded-2xl border px-3 py-3 text-sm font-medium transition sm:text-base ${
                        role === "seller"
                          ? "border-sky-500/60 bg-sky-500/15 text-slate-900 dark:border-sky-400/50 dark:text-white"
                          : "border-slate-300/70 bg-white/30 text-slate-700 hover:bg-white/50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                      }`
                    },
                    "Vendor (Seller)"
                  )
                ])
              ]),
              err
                ? h(InlineNotice, { key: "err", variant: "error", onDismiss: () => setErr("") }, err)
                : null,
              h(Button, { key: "sub", type: "submit", className: "w-full", loading }, "Create account"),
              h("p", { key: "foot", className: "text-center text-sm text-slate-600 dark:text-slate-400" }, [
                h("span", { key: "pre" }, "Already have an account? "),
                h(Link, { key: "ln", to: "/login", state: location.state, className: "font-semibold text-sky-600 hover:underline dark:text-sky-300" }, "Login")
              ])
            ].filter(Boolean)
          )
        ])
      ]
    )
  ]);
}

export function VerifyEmailPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const email = loc.state?.email || "";
  const [token, setToken] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await apiFetch("/api/auth/verify-email", { method: "POST", json: { token: token.trim() } });
      nav("/login", { replace: true });
    } catch (ex) {
      setErr(apiErrorMessage(ex, "Email verification failed. Check the token and try again."));
    } finally {
      setLoading(false);
    }
  };

  const { dark, toggle } = useTheme();
  return h("div", { className: "mx-auto max-w-md px-4 py-16" }, [
    h("div", { key: "top", className: "mb-4 flex justify-end" }, h(ThemeToggleButton, { dark, onToggle: toggle })),
    h(GlassPanel, { key: "panel" }, [
      h("h1", { key: "title", className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, "Verify email"),
      h("p", { key: "sub", className: "mt-2 text-sm text-slate-600 dark:text-slate-400" }, `We sent a token to ${email || "your inbox"}. Paste it below.`),
      h(
        "form",
        { key: "form", className: "mt-6 space-y-4", onSubmit },
        [
          h(Field, { key: "token", label: "Verification token" }, h(TextInput, { value: token, onChange: (e) => setToken(e.target.value), required: true })),
          err
            ? h(InlineNotice, { key: "err", variant: "error", onDismiss: () => setErr("") }, err)
            : null,
          h(Button, { key: "submit", type: "submit", className: "w-full", loading }, "Verify"),
          h(Link, { key: "back", to: "/login", className: "block text-center text-sm text-sky-600 hover:underline dark:text-sky-300" }, "Back to login")
        ].filter(Boolean)
      )
    ])
  ]);
}

export function ForgotPasswordPage() {
  const nav = useNavigate();
  const [channel, setChannel] = useState("email");
  const [identifier, setIdentifier] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    setLoading(true);
    try {
      const id = identifier.trim();
      const data = await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        json: {
          channel,
          identifier: id,
          ...(channel === "email" ? { email: id } : {})
        }
      });
      if (data?.devAccountFound === false) {
        setErr("No account found for that email/phone yet. Register first, then request OTP.");
        return;
      }
      setMsg("If that account exists, a 6-digit OTP was sent.");
      nav("/reset-password", { state: { channel, identifier: id } });
    } catch (ex) {
      setErr(apiErrorMessage(ex, "We couldn't send the code. Check your email or phone and try again."));
    } finally {
      setLoading(false);
    }
  };

  return h("div", { className: "mx-auto max-w-md px-4 py-16" }, [
    h(GlassPanel, { key: "panel" }, [
      h("h1", { key: "title", className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, "Reset password"),
      h("div", { key: "channels", className: "mt-3 grid grid-cols-2 gap-2" }, [
        h(
          Button,
          {
            key: "by-email",
            type: "button",
            variant: channel === "email" ? "primary" : "ghost",
            className: "!min-h-[38px]",
            onClick: () => setChannel("email")
          },
          "Email"
        ),
        h(
          Button,
          {
            key: "by-phone",
            type: "button",
            variant: channel === "phone" ? "primary" : "ghost",
            className: "!min-h-[38px]",
            onClick: () => setChannel("phone")
          },
          "Phone"
        )
      ]),
      h("form", { key: "form", className: "mt-6 space-y-4", onSubmit }, [
        h(
          Field,
          { key: "identifier", label: channel === "email" ? "Email" : "Phone number" },
          h(TextInput, {
            type: channel === "email" ? "email" : "tel",
            value: identifier,
            onChange: (e) => setIdentifier(e.target.value),
            required: true,
            placeholder: channel === "email" ? "you@email.com" : "+233000000000"
          })
        ),
        msg && h("p", { key: "msg", className: "text-sm text-emerald-400" }, msg),
        err
          ? h(InlineNotice, { key: "err", variant: "error", onDismiss: () => setErr("") }, err)
          : null,
        h(Button, { key: "submit", type: "submit", className: "w-full", loading }, "Send OTP"),
        h(Link, { key: "back", to: "/login", className: "block text-center text-sm text-sky-600 hover:underline dark:text-sky-300" }, "Back to login")
      ].filter(Boolean))
    ])
  ]);
}

export function ResetPasswordPage() {
  const loc = useLocation();
  const [channel, setChannel] = useState(loc.state?.channel === "phone" ? "phone" : "email");
  const [identifier, setIdentifier] = useState(loc.state?.identifier || "");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        json: { channel, identifier: identifier.trim(), otp: otp.trim(), newPassword }
      });
      nav("/login", { replace: true });
    } catch (ex) {
      setErr(apiErrorMessage(ex, "Password reset failed. Check the code and your new password, then try again."));
    } finally {
      setLoading(false);
    }
  };

  return h("div", { className: "mx-auto max-w-md px-4 py-16" }, [
    h(GlassPanel, { key: "panel" }, [
      h("h1", { key: "title", className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, "New password"),
      h("div", { key: "channels", className: "mt-3 grid grid-cols-2 gap-2" }, [
        h(
          Button,
          {
            key: "by-email",
            type: "button",
            variant: channel === "email" ? "primary" : "ghost",
            className: "!min-h-[38px]",
            onClick: () => setChannel("email")
          },
          "Email"
        ),
        h(
          Button,
          {
            key: "by-phone",
            type: "button",
            variant: channel === "phone" ? "primary" : "ghost",
            className: "!min-h-[38px]",
            onClick: () => setChannel("phone")
          },
          "Phone"
        )
      ]),
      h("form", { key: "form", className: "mt-6 space-y-4", onSubmit }, [
        h(
          Field,
          { key: "identifier", label: channel === "email" ? "Email" : "Phone number" },
          h(TextInput, {
            type: channel === "email" ? "email" : "tel",
            value: identifier,
            onChange: (e) => setIdentifier(e.target.value),
            required: true
          })
        ),
        h(
          Field,
          { key: "otp", label: "OTP code" },
          h(TextInput, {
            value: otp,
            onChange: (e) => setOtp(e.target.value),
            required: true,
            inputMode: "numeric",
            pattern: "\\d{6}",
            maxLength: 6,
            placeholder: "6-digit code"
          })
        ),
        h(Field, { key: "newpw", label: "New password" }, h(TextInput, { type: "password", value: newPassword, onChange: (e) => setNewPassword(e.target.value), required: true, minLength: 8 })),
        err
          ? h(InlineNotice, { key: "err", variant: "error", onDismiss: () => setErr("") }, err)
          : null,
        h(Button, { key: "submit", type: "submit", className: "w-full", loading }, "Update password")
      ].filter(Boolean))
    ])
  ]);
}
