import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "./api";
import { decodeJwtPayload } from "./authJwt";
import { h, f } from "./h";

const AuthContext = createContext({
  user: null,
  accessToken: null,
  loading: true,
  login: async () => {},
  verifyLoginOtp: async () => {},
  register: async () => {},
  logout: async () => {},
  refreshAccess: async () => {},
  setAccessToken: () => {}
});

const TOKEN_KEY = "brewmart_access_token";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessTokenState] = useState(() => {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  const setAccessToken = useCallback((t) => {
    setAccessTokenState(t);
    try {
      if (t) sessionStorage.setItem(TOKEN_KEY, t);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshAccess = useCallback(async () => {
    const data = await apiFetch("/api/auth/refresh", {
      method: "POST",
      json: {}
    });
    if (data && data.accessToken) setAccessToken(data.accessToken);
    return data;
  }, [setAccessToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch("/api/auth/refresh", {
          method: "POST",
          json: {}
        });
        if (cancelled || !data?.accessToken) {
          if (!cancelled) {
            setAccessToken(null);
            setUser(null);
          }
          return;
        }
        setAccessToken(data.accessToken);
        try {
          const me = await apiFetch("/api/auth/me", {
            headers: { Authorization: `Bearer ${data.accessToken}` }
          });
          if (!cancelled && me?.user) {
            const p = decodeJwtPayload(data.accessToken);
            setUser({
              ...me.user,
              ...(!me.user.adminLevel && me.user.role === "admin" && p?.al && (p.al === "super" || p.al === "normal")
                ? { adminLevel: p.al }
                : {})
            });
          } else if (!cancelled) {
            const payload = decodeJwtPayload(data.accessToken);
            setUser(
              payload?.sub
                ? {
                    id: payload.sub,
                    role: payload.role,
                    email: "",
                    displayName: "",
                    phone: "",
                    ...(payload.role === "admin" && payload.al && (payload.al === "super" || payload.al === "normal")
                      ? { adminLevel: payload.al }
                      : {})
                  }
                : null
            );
          }
        } catch {
          if (!cancelled) {
            const payload = decodeJwtPayload(data.accessToken);
            setUser(
              payload?.sub
                ? {
                    id: payload.sub,
                    role: payload.role,
                    email: "",
                    displayName: "",
                    phone: "",
                    ...(payload.role === "admin" && payload.al && (payload.al === "super" || payload.al === "normal")
                      ? { adminLevel: payload.al }
                      : {})
                  }
                : null
            );
          }
        }
      } catch {
        if (!cancelled) {
          setAccessToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setAccessToken]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onToken = (e) => {
      const token = e?.detail || null;
      setAccessToken(token);
      if (!token) setUser(null);
    };
    window.addEventListener("auth:token", onToken);
    return () => window.removeEventListener("auth:token", onToken);
  }, [setAccessToken]);

  const login = useCallback(
    async (identifier, password) => {
      const data = await apiFetch("/api/auth/login", {
        method: "POST",
        json: { identifier, password }
      });
      if (data.needsOtp) return data;

      if (data.user) {
        const p = decodeJwtPayload(data.accessToken);
        setUser({
          ...data.user,
          ...(!data.user.adminLevel && data.user.role === "admin" && p?.al && (p.al === "super" || p.al === "normal")
            ? { adminLevel: p.al }
            : {})
        });
      } else {
        const payload = decodeJwtPayload(data.accessToken);
        setUser(
          payload?.sub
            ? {
                id: payload.sub,
                role: payload.role,
                email: identifier,
                ...(payload.role === "admin" && payload.al && (payload.al === "super" || payload.al === "normal")
                  ? { adminLevel: payload.al }
                  : {})
              }
            : { id: "", role: "buyer", email: identifier }
        );
      }
      setAccessToken(data.accessToken);
      return data;
    },
    [setAccessToken]
  );

  const verifyLoginOtp = useCallback(
    async (email, otp) => {
      const data = await apiFetch("/api/auth/verify-login-otp", {
        method: "POST",
        json: { email, otp }
      });
      if (data.user) {
        const p = decodeJwtPayload(data.accessToken);
        setUser({
          ...data.user,
          ...(!data.user.adminLevel && data.user.role === "admin" && p?.al && (p.al === "super" || p.al === "normal")
            ? { adminLevel: p.al }
            : {})
        });
      } else {
        const payload = decodeJwtPayload(data.accessToken);
        setUser(
          payload?.sub
            ? {
                id: payload.sub,
                role: payload.role,
                email,
                ...(payload.role === "admin" && payload.al && (payload.al === "super" || payload.al === "normal")
                  ? { adminLevel: payload.al }
                  : {})
              }
            : { id: "", role: "buyer", email }
        );
      }
      setAccessToken(data.accessToken);
      return data;
    },
    [setAccessToken]
  );

  const register = useCallback(async (payload) => {
    const data = await apiFetch("/api/auth/register", {
      method: "POST",
      json: payload
    });
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch("/api/auth/logout", { method: "POST", json: {} });
    } catch {
      /* still clear local */
    }
    setUser(null);
    setAccessToken(null);
  }, [setAccessToken]);

  const value = useMemo(
    () => ({
      user,
      accessToken,
      loading,
      login,
      verifyLoginOtp,
      register,
      logout,
      refreshAccess,
      setAccessToken,
      setUser
    }),
    [user, accessToken, loading, login, verifyLoginOtp, register, logout, refreshAccess, setAccessToken, setUser]
  );

  return h(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  return useContext(AuthContext);
}
