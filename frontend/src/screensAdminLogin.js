import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CheckCircle2, Eye, EyeOff, Lock, Shield, User } from "lucide-react";
import { useAuth, useNotice } from "./contexts";
import { decodeJwtPayload } from "./authJwt";
import { h } from "./h";
import { apiFetch } from "./api";
import { apiErrorMessage } from "./screensAuth";
import { Button, Field, InlineNotice, OtpCodeInput, TextInput } from "./ui";

function sessionRole(data) {
  const r = data?.user?.role;
  if (r) return r;
  return decodeJwtPayload(data?.accessToken)?.role || "";
}

/** Centered login card only (no side panel). */
function AdminAuthCardLayout({ children }) {
  return h(
    "div",
    {
      className:
        "min-h-screen bg-slate-100 py-6 dark:bg-night-950 sm:flex sm:items-center sm:justify-center sm:py-8"
    },
    h(
      "div",
      { className: "mx-auto w-full max-w-sm px-3 sm:max-w-md sm:px-4" },
      h(
        "div",
        {
          className:
            "overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xl dark:border-white/10 dark:bg-night-900 sm:p-5"
        },
        children
      )
    )
  );
}

export function AdminLoginPage() {
  const nav = useNavigate();
  const { login, logout, accessToken, user, loading } = useAuth();
  const { toast } = useNotice();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && accessToken && user?.role === "admin") {
      nav("/admin", { replace: true });
    }
  }, [loading, accessToken, user, nav]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const data = await login(identifier.trim(), password);
      if (data?.needsOtp) {
        nav("/admin/login-otp", {
          replace: true,
          state: {
            email: data.email || identifier.trim().toLowerCase(),
            from: "/admin",
            loginOtpEmailSent: data.loginOtpEmailSent !== false
          }
        });
        return;
      }
      if (sessionRole(data) !== "admin") {
        await logout();
        setErr("This portal is for platform administrators only. Use the main sign-in for buyer or vendor accounts.");
        return;
      }
      toast("Welcome — admin dashboard", { variant: "success" });
      nav("/admin", { replace: true });
    } catch (ex) {
      const msg = apiErrorMessage(ex, "We couldn’t sign you in. Check your email and password.");
      if (ex.status === 403 && /verify/i.test(msg)) {
        setErr("This account must verify email on the main site first, or contact support.");
      } else {
        setErr(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return h(
    AdminAuthCardLayout,
    { key: "page" },
    [
      h("div", { key: "hdr", className: "mb-4 text-center" }, [
        h(
          "div",
          {
            key: "shico",
            className:
              "mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400"
          },
          h(Shield, { className: "h-5 w-5" })
        ),
        h("h2", { key: "t", className: "font-display text-lg font-bold text-slate-900 dark:text-white sm:text-xl" }, "Admin Login"),
        h(
          "p",
          { key: "s", className: "mt-1 text-[11px] text-slate-600 dark:text-slate-400 sm:text-xs" },
          "Enter your credentials to access the admin dashboard."
        )
      ]),
      h(
        "form",
        { key: "frm", className: "space-y-2.5 sm:space-y-3", onSubmit },
        [
          h(Field, { key: "em", label: "Email Address" }, h("div", { className: "relative" }, [
            h(User, {
              className: "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            }),
            h(TextInput, {
              type: "email",
              autoComplete: "username",
              value: identifier,
              onChange: (e) => setIdentifier(e.target.value),
              placeholder: "Enter admin email",
              className: "pl-10",
              required: true
            })
          ])),
          h(Field, { key: "pw", label: "Password" }, h("div", { className: "relative" }, [
            h(Lock, {
              className: "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            }),
            h(TextInput, {
              type: show ? "text" : "password",
              autoComplete: "current-password",
              value: password,
              onChange: (e) => setPassword(e.target.value),
              placeholder: "Enter password",
              className: "pr-12 pl-10",
              required: true
            }),
            h(
              "button",
              {
                key: "eye",
                type: "button",
                className:
                  "tap-target absolute right-1 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10",
                onClick: () => setShow((s) => !s)
              },
              show ? h(EyeOff, { className: "h-5 w-5" }) : h(Eye, { className: "h-5 w-5" })
            )
          ])),
          err ? h(InlineNotice, { key: "err", variant: "error", onDismiss: () => setErr("") }, err) : null,
          h(Button, { key: "go", type: "submit", className: "w-full", loading: busy }, "Login to Dashboard")
        ]
      ),
      h("div", { key: "div", className: "relative my-4" }, [
        h("div", { className: "absolute inset-0 flex items-center" }, h("div", { className: "w-full border-t border-slate-200 dark:border-white/10" })),
        h(
          "div",
          { className: "relative flex justify-center text-[10px] font-semibold uppercase tracking-wide text-slate-500" },
          h(
            "span",
            {
              className:
                "inline-flex items-center gap-1 bg-white px-2 text-sky-600 dark:bg-night-900 dark:text-sky-400 sm:px-2.5"
            },
            [h(CheckCircle2, { className: "h-3 w-3" }), "Secure"]
          )
        )
      ]),
      h(
        "p",
        { key: "back", className: "mt-4 text-center text-[11px] text-slate-500 dark:text-slate-400 sm:text-xs" },
        h(Link, { to: "/", className: "text-sky-600 hover:underline dark:text-sky-300" }, "← Back to CampusMarket")
      )
    ]
  );
}

export function AdminLoginOtpPage() {
  const nav = useNavigate();
  const location = useLocation();
  const { verifyLoginOtp, logout, accessToken, user, loading } = useAuth();
  const { toast } = useNotice();
  const email = String(location.state?.email || "").trim().toLowerCase();
  const loginOtpEmailSent = location.state?.loginOtpEmailSent !== false;
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMsg, setResendMsg] = useState("");
  const [showResendCard, setShowResendCard] = useState(() => !loginOtpEmailSent);

  useEffect(() => {
    if (!loading && accessToken && user?.role === "admin") {
      nav("/admin", { replace: true });
    }
  }, [loading, accessToken, user, nav]);

  useEffect(() => {
    if (!email) nav("/admin/login", { replace: true });
  }, [email, nav]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setResendMsg("");
    if (otp.length !== 6) {
      setErr("Enter the full 6-digit code.");
      return;
    }
    setBusy(true);
    try {
      const data = await verifyLoginOtp(email, otp);
      if (sessionRole(data) !== "admin") {
        await logout();
        setErr("This portal is for platform administrators only.");
        return;
      }
      toast("Welcome — admin dashboard", { variant: "success" });
      nav("/admin", { replace: true });
    } catch (ex) {
      if (ex?.code === "LOGIN_OTP_EXPIRED" || ex?.data?.error?.code === "LOGIN_OTP_EXPIRED") {
        setShowResendCard(true);
      }
      setErr(apiErrorMessage(ex, "That code did not work. Try again or request a new code."));
    } finally {
      setBusy(false);
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

  return h(
    AdminAuthCardLayout,
    { key: "page" },
    [
      h("div", { key: "hdr", className: "mb-4 text-center" }, [
        h("h2", { key: "t", className: "font-display text-lg font-bold text-slate-900 dark:text-white sm:text-xl" }, "Verify sign-in"),
        h(
          "p",
          { key: "s", className: "mt-1 break-all text-[11px] text-slate-600 dark:text-slate-400 sm:text-xs" },
          `We sent a 6-digit code to ${email}.`
        )
      ]),
      h(
        "form",
        { key: "frm", className: "space-y-2.5 sm:space-y-3", onSubmit },
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
          h(Button, { key: "go", type: "submit", className: "w-full", loading: busy }, "Continue to dashboard"),
          !loginOtpEmailSent
            ? h(
                "p",
                {
                  key: "dev-mail",
                  className: "text-[11px] text-amber-700 dark:text-amber-200/90"
                },
                "Email is not configured on this server. Check the server log for the sign-in code, or configure SMTP."
              )
            : null,
          showResendCard
            ? h("div", { key: "resend", className: "rounded-xl border border-slate-200/80 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5 sm:p-3.5" }, [
                h("p", { key: "r1", className: "text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs" }, "Need a new code?"),
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
                        "tap-target absolute right-1 top-1/2 -translate-y-1/2 rounded-xl p-2 text-slate-500 hover:bg-white/40 dark:hover:bg-white/10",
                      onClick: () => setShowPw((s) => !s)
                    },
                    showPw ? h(EyeOff, { className: "h-5 w-5" }) : h(Eye, { className: "h-5 w-5" })
                  )
                ])),
                h(
                  Button,
                  {
                    key: "rs",
                    type: "button",
                    variant: "subtle",
                    className: "mt-3 w-full",
                    loading: resendLoading,
                    onClick: onResend
                  },
                  "Resend code"
                )
              ])
            : null,
          h(
            Link,
            {
              key: "back",
              to: "/admin/login",
              className: "block text-center text-[11px] text-sky-600 hover:underline dark:text-sky-300 sm:text-xs"
            },
            "← Back to admin sign in"
          )
        ]
      )
    ]
  );
}
