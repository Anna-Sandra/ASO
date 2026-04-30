import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { useAuth } from "./AuthContext";
import { useNotice } from "./NoticeContext";
import { useTheme } from "./ThemeContext";
import { h, f } from "./h";
import { apiFetch, fetchPublicPlatformConfig } from "./api";
import { Button, Field, GlassPanel, InlineNotice, LogoMark, OtpCodeInput, RefImage, TextInput, ThemeToggleButton } from "./ui";

/** Prefer server message from `apiFetch` errors; avoid empty or generic fallbacks. */
export function apiErrorMessage(ex, fallback) {
  const m = ex && typeof ex.message === "string" ? ex.message.trim() : "";
  if (m && m !== "Validation error") return m;
  if (ex?.status === 400) return fallback || "Check your input and try again.";
  return m || fallback || "Something went wrong. Try again.";
}

/** After login/register as buyer: return to guarded route (e.g. /checkout) or storefront. */
function postBuyerAuthRedirectPath(state) {
  const from = state && typeof state.from === "string" ? state.from : null;
  if (!from || !from.startsWith("/")) return "/";
  if (
    from.startsWith("/login") ||
    from.startsWith("/login-otp") ||
    from.startsWith("/register") ||
    from.startsWith("/admin/login")
  ) {
    return "/";
  }
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
  return "?";
}

function buyerDisplayHandle(user, identifierFallback) {
  const label = buyerWelcomeLabel(user, identifierFallback);
  const L = userAvatarLetter(user) || (label ? String(label).charAt(0).toUpperCase() : "?");
  return `(${L}) ${label}`;
}

/** Shared redirect after a session exists (password login, email verify, or login OTP). */
function routeAfterSession(data, { identifierFallback, redirectState, nav, toast, toastText }) {
  const role = data?.user?.role;
  const who = buyerDisplayHandle(data?.user, identifierFallback);
  const t = typeof toastText === "string" && toastText.length ? toastText : `Welcome, ${who}!`;
  if (role === "admin") {
    toast(t, { variant: "success" });
    nav("/admin", { replace: true });
  } else if (role === "seller") {
    if (typeof toastText === "string" && toastText.length) toast(t, { variant: "success" });
    nav("/vendor/dashboard", { replace: true });
  } else {
    toast(t, { variant: "success" });
    nav(postBuyerAuthRedirectPath(redirectState), { replace: true });
  }
}

export function LoginPage() {
  const nav = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { toast } = useNotice();
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
      if (data?.needsOtp) {
        nav("/login-otp", {
          replace: true,
          state: {
            email: data.email || identifier.trim().toLowerCase(),
            from: location.state,
            loginOtpEmailSent: data.loginOtpEmailSent !== false
          }
        });
        return;
      }
      routeAfterSession(data, {
        identifierFallback: identifier,
        redirectState: location.state,
        nav,
        toast
      });
    } catch (ex) {
      const msg = apiErrorMessage(
        ex,
        "We couldn't sign you in. Check your email and password, then try again."
      );
      if (ex.status === 403 && /verify/i.test(msg)) {
        nav("/verify-email", {
          replace: true,
          state: { email: identifier.trim().toLowerCase(), from: location.state }
        });
        return;
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
              h(Field, { key: "f-id", label: "Email" }, h(TextInput, {
                type: "email",
                autoComplete: "username",
                value: identifier,
                onChange: (e) => setIdentifier(e.target.value),
                placeholder: "you@email.com",
                required: true
              })),
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

export function LoginOtpPage() {
  const nav = useNavigate();
  const location = useLocation();
  const { verifyLoginOtp } = useAuth();
  const { toast } = useNotice();
  const email = String(location.state?.email || "").trim().toLowerCase();
  const loginOtpEmailSent = location.state?.loginOtpEmailSent !== false;
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  const [showResendCard, setShowResendCard] = useState(() => !loginOtpEmailSent);

  useEffect(() => {
    if (!email) nav("/login", { replace: true });
  }, [email, nav]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setResendMsg("");
    if (otp.length !== 6) {
      setErr("Enter the full 6-digit code.");
      return;
    }
    setLoading(true);
    try {
      const data = await verifyLoginOtp(email, otp);
      routeAfterSession(data, { identifierFallback: email, redirectState: location.state?.from, nav, toast });
    } catch (ex) {
      if (ex?.code === "LOGIN_OTP_EXPIRED" || ex?.data?.error?.code === "LOGIN_OTP_EXPIRED") {
        setShowResendCard(true);
      }
      setErr(apiErrorMessage(ex, "That code did not work. Try again or request a new code."));
    } finally {
      setLoading(false);
    }
  };

  const onResend = async (e) => {
    e.preventDefault();
    setErr("");
    setResendMsg("");
    if (!password) {
      setErr("Enter your password to send a new code.");
      return;
    }
    setResendLoading(true);
    try {
      await apiFetch("/api/auth/resend-login-otp", {
        method: "POST",
        json: { identifier: email, password }
      });
      setResendMsg("A new code was sent to your email.");
      setOtp("");
    } catch (ex) {
      setErr(apiErrorMessage(ex, "Could not resend. Check your password and try again."));
    } finally {
      setResendLoading(false);
    }
  };

  if (!email) return null;

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
          ])
        ]),
        h(GlassPanel, { key: "panel", className: "mx-auto w-full max-w-md" }, [
          h("h1", { key: "t1", className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, "Check your email"),
          h(
            "p",
            { key: "sub", className: "mt-1 text-sm text-slate-600 dark:text-slate-400" },
            `We sent a 6-digit code to ${email}. Enter it below to finish signing in.`
          ),
          h(
            "form",
            { key: "frm", className: "mt-6 space-y-4", onSubmit },
            [
              h(
                Field,
                { key: "otp", label: "Sign-in code" },
                h(OtpCodeInput, {
                  value: otp,
                  onChange: setOtp,
                  autoFocus: true,
                  "aria-invalid": err && otp.length < 6 ? true : undefined
                })
              ),
              err ? h(InlineNotice, { key: "err", variant: "error", onDismiss: () => setErr("") }, err) : null,
              resendMsg
                ? h(InlineNotice, { key: "ok", variant: "success", size: "sm", onDismiss: () => setResendMsg("") }, resendMsg)
                : null,
              h(Button, { key: "sub", type: "submit", className: "w-full", loading }, "Continue"),
              !loginOtpEmailSent
                ? h(
                    "p",
                    {
                      key: "dev-mail",
                      className: "text-xs text-amber-700 dark:text-amber-200/90"
                    },
                    "Email is not configured on this server, so you will not receive a message. Check the server log for the sign-in code, or ask an admin to set up SMTP."
                  )
                : null,
              showResendCard
                ? h("div", { key: "resend", className: "rounded-2xl border border-slate-200/80 bg-white/25 p-4 dark:border-white/10 dark:bg-white/5" }, [
                    h("p", { key: "r1", className: "text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400" }, "Need a new code?"),
                    h("p", { key: "r2", className: "mt-1 text-xs text-slate-600 dark:text-slate-400" }, "Confirm your password — we will email another code."),
                    h(Field, { key: "pw", label: "Password" }, h("div", { className: "relative" }, [
                      h(TextInput, {
                        type: showPw ? "text" : "password",
                        autoComplete: "current-password",
                        value: password,
                        onChange: (e) => setPassword(e.target.value),
                        className: "pr-12",
                        placeholder: "••••••••"
                      }),
                      h(
                        "button",
                        {
                          key: "eye",
                          type: "button",
                          className:
                            "tap-target absolute right-1 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-500 hover:bg-white/40 dark:text-slate-400 dark:hover:bg-white/10",
                          onClick: () => setShowPw((s) => !s)
                        },
                        showPw ? h(EyeOff, { className: "h-5 w-5" }) : h(Eye, { className: "h-5 w-5" })
                      )
                    ])),
                    h(Button, { key: "rs", type: "button", variant: "subtle", className: "mt-3 w-full", loading: resendLoading, onClick: onResend }, "Resend code")
                  ])
                : null,
              h(
                Link,
                { key: "back", to: "/login", className: "block text-center text-sm text-sky-600 hover:underline dark:text-sky-300" },
                "← Back to sign in"
              )
            ].filter(Boolean)
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
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [platformCfg, setPlatformCfg] = useState(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const c = await fetchPublicPlatformConfig();
      if (!cancelled) setPlatformCfg(c);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const regBlocked =
    platformCfg &&
    (platformCfg.maintenanceMode === true || platformCfg.allowPublicRegistration === false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    if (regBlocked) {
      setErr(
        platformCfg?.maintenanceMode
          ? platformCfg.maintenanceMessage?.trim() || "Registration is temporarily paused."
          : "New registrations are closed on this marketplace."
      );
      return;
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErr("Enter your name (how you want to be shown).");
      return;
    }
    setLoading(true);
    try {
      const id = identifier.trim();
      const regData = await register({
        identifier: id,
        password,
        displayName: trimmedName,
        username: trimmedName
      });
      if (regData?.requiresEmailVerification) {
        nav("/verify-email", {
          replace: true,
          state: { email: id.toLowerCase(), name: trimmedName, from: location.state }
        });
        return;
      }
      try {
        const data = await login(id, password);
        if (data?.needsOtp) {
          nav("/login-otp", {
            replace: true,
            state: {
              email: data.email || id.toLowerCase(),
              from: location.state,
              loginOtpEmailSent: data.loginOtpEmailSent !== false
            }
          });
          return;
        }
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
        const nextRole = loginUser?.role || "buyer";
        if (nextRole === "admin") {
          const who = buyerDisplayHandle(loginUser, id);
          toast(`Welcome, ${who}! Your account is ready.`, { variant: "success" });
          nav("/admin", { replace: true });
        } else {
          const who = buyerDisplayHandle(loginUser, id);
          toast(`Welcome, ${who}! Your account is ready.`, { variant: "success" });
          nav(postBuyerAuthRedirectPath(location.state), { replace: true });
        }
      } catch (lex) {
        if (lex.status === 403 && /verify/i.test(lex.message || "")) {
          nav("/verify-email", {
            replace: true,
            state: { email: id.toLowerCase(), name: trimmedName, from: location.state }
          });
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
            h("span", { key: "nm", className: "font-display text-xl font-semibold text-slate-900 dark:text-white" }, platformCfg?.siteName || "Campus Mart")
          ]),
        ]),
        h(GlassPanel, { key: "panel", className: "mx-auto w-full max-w-md" }, [
          h("h1", { key: "t1", className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, "Join us"),
          h("p", { key: "sub", className: "mt-1 text-sm text-slate-600 dark:text-slate-400" }, "Create a shopper account. You can apply to sell after you sign in."),
          platformCfg?.maintenanceMode
            ? h(InlineNotice, { key: "maint", variant: "warning", title: "Maintenance" }, platformCfg.maintenanceMessage?.trim() || "This marketplace is temporarily not accepting new registrations.")
            : null,
          platformCfg && platformCfg.allowPublicRegistration === false
            ? h(InlineNotice, { key: "closed", variant: "warning", title: "Sign-up closed" }, "The operator has disabled new accounts. Contact support if you need access.")
            : null,
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
                    h("span", { key: "t" }, " Email")
                  ])
                },
                h(TextInput, {
                  type: "email",
                  value: identifier,
                  onChange: (e) => setIdentifier(e.target.value),
                  placeholder: "your@email.com",
                  required: true,
                  autoComplete: "username"
                })
              ),
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
              err
                ? h(InlineNotice, { key: "err", variant: "error", onDismiss: () => setErr("") }, err)
                : null,
              h(Button, { key: "sub", type: "submit", className: "w-full", loading, disabled: !!regBlocked }, "Create account"),
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
  const { setAccessToken, setUser } = useAuth();
  const { toast } = useNotice();
  const email = String(loc.state?.email || "").trim().toLowerCase();
  const [otp, setOtp] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMsg, setResendMsg] = useState("");

  useEffect(() => {
    if (!email) nav("/register", { replace: true });
  }, [email, nav]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setResendMsg("");
    if (otp.length !== 6) {
      setErr("Enter the full 6-digit code.");
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch("/api/auth/verify-email", { method: "POST", json: { email, otp } });
      if (data?.accessToken) setAccessToken(data.accessToken);
      if (data?.user) setUser(data.user);
      const fromState = loc.state?.from;
      if (data?.user) {
        const who = buyerDisplayHandle(data.user, email);
        const justRegistered = Boolean(loc.state?.name);
        routeAfterSession(data, {
          identifierFallback: email,
          redirectState: fromState,
          nav,
          toast,
          toastText: justRegistered ? `Welcome, ${who}! Your account is ready.` : `Welcome, ${who}!`
        });
        return;
      }
      nav("/login", { replace: true, state: fromState || undefined });
    } catch (ex) {
      setErr(apiErrorMessage(ex, "Verification failed. Check the code and try again."));
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    setErr("");
    setResendMsg("");
    setResendLoading(true);
    try {
      const data = await apiFetch("/api/auth/resend-verification-otp", {
        method: "POST",
        json: { email }
      });
      if (data?.devOtp) {
        setResendMsg(`Dev mode: your code is ${data.devOtp} (email not configured on server).`);
      } else {
        setResendMsg(data?.message || "If this account still needs verification, a new code was sent.");
      }
      setOtp("");
    } catch (ex) {
      setErr(apiErrorMessage(ex, "Could not resend. Try again in a moment."));
    } finally {
      setResendLoading(false);
    }
  };

  const { dark, toggle } = useTheme();
  if (!email) return null;

  return h("div", { className: "mx-auto max-w-md px-4 py-16" }, [
    h("div", { key: "top", className: "mb-4 flex justify-end" }, h(ThemeToggleButton, { dark, onToggle: toggle })),
    h(GlassPanel, { key: "panel" }, [
      h("h1", { key: "title", className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, "Verify email"),
      h(
        "p",
        { key: "sub", className: "mt-2 text-sm text-slate-600 dark:text-slate-400" },
        `We sent a 6-digit code to ${email}. Enter it below to verify your account.`
      ),
      h(
        "form",
        { key: "form", className: "mt-6 space-y-4", onSubmit },
        [
          h(
            Field,
            { key: "otp", label: "Verification code" },
            h(OtpCodeInput, { value: otp, onChange: setOtp, autoFocus: true })
          ),
          err ? h(InlineNotice, { key: "err", variant: "error", onDismiss: () => setErr("") }, err) : null,
          resendMsg
            ? h(
                InlineNotice,
                { key: "rs", variant: "success", size: "sm", onDismiss: () => setResendMsg("") },
                resendMsg
              )
            : null,
          h(Button, { key: "submit", type: "submit", className: "w-full", loading }, "Verify"),
          h(Button, {
            key: "resend",
            type: "button",
            variant: "subtle",
            className: "w-full",
            loading: resendLoading,
            onClick: onResend
          }, "Resend code"),
          h(Link, { key: "back", to: "/login", className: "block text-center text-sm text-sky-600 hover:underline dark:text-sky-300" }, "Back to login")
        ].filter(Boolean)
      )
    ])
  ]);
}

export function ForgotPasswordPage() {
  const nav = useNavigate();
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
        json: { email: id }
      });
      if (data?.devAccountFound === false) {
        setErr("No account found for that email yet. Register first, then request an OTP.");
        return;
      }
      setMsg("If that account exists, a 6-digit OTP was sent.");
      nav("/reset-password", { state: { email: id } });
    } catch (ex) {
      setErr(apiErrorMessage(ex, "We couldn't send the code. Check your email and try again."));
    } finally {
      setLoading(false);
    }
  };

  return h("div", { className: "mx-auto max-w-md px-4 py-16" }, [
    h(GlassPanel, { key: "panel" }, [
      h("h1", { key: "title", className: "font-display text-2xl font-bold text-slate-900 dark:text-white" }, "Reset password"),
      h("form", { key: "form", className: "mt-6 space-y-4", onSubmit }, [
        h(
          Field,
          { key: "identifier", label: "Email" },
          h(TextInput, {
            type: "email",
            value: identifier,
            onChange: (e) => setIdentifier(e.target.value),
            required: true,
            placeholder: "you@email.com"
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
  const [email, setEmail] = useState(loc.state?.email || "");
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
        json: { email: email.trim(), otp: otp.trim(), newPassword }
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
      h("form", { key: "form", className: "mt-6 space-y-4", onSubmit }, [
        h(
          Field,
          { key: "identifier", label: "Email" },
          h(TextInput, {
            type: "email",
            value: email,
            onChange: (e) => setEmail(e.target.value),
            required: true
          })
        ),
        h(Field, { key: "otp", label: "OTP code" }, h(OtpCodeInput, { value: otp, onChange: setOtp })),
        h(Field, { key: "newpw", label: "New password" }, h(TextInput, { type: "password", value: newPassword, onChange: (e) => setNewPassword(e.target.value), required: true, minLength: 8 })),
        err
          ? h(InlineNotice, { key: "err", variant: "error", onDismiss: () => setErr("") }, err)
          : null,
        h(Button, { key: "submit", type: "submit", className: "w-full", loading }, "Update password")
      ].filter(Boolean))
    ])
  ]);
}
