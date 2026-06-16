import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "services/api";
import {
  isStoredAccessTokenValid,
  readStoredAccessToken,
  refreshSessionTokens,
  restoreSessionFromStorage
} from "services/sessionRefresh";
import { decodeJwtPayload, isAccessTokenExpired } from "utils/authJwt";
import { storageGet, storageRemove, storageSet, StorageKeys } from "utils/storage";
import { h } from "utils/h";

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

function userFromJwt(accessToken, fallbackEmail = "") {
  const payload = decodeJwtPayload(accessToken);
  if (!payload?.sub) return null;
  return {
    id: payload.sub,
    role: payload.role,
    email: fallbackEmail,
    displayName: "",
    phone: "",
    ...(payload.role === "admin" && payload.al && (payload.al === "super" || payload.al === "normal")
      ? { adminLevel: payload.al }
      : {})
  };
}

function mergeMeUser(meUser, accessToken) {
  const p = decodeJwtPayload(accessToken);
  return {
    ...meUser,
    ...(!meUser.adminLevel && meUser.role === "admin" && p?.al && (p.al === "super" || p.al === "normal")
      ? { adminLevel: p.al }
      : {})
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessTokenState] = useState(() => storageGet(StorageKeys.ACCESS_TOKEN));
  const [loading, setLoading] = useState(true);

  const setAccessToken = useCallback((t) => {
    setAccessTokenState(t);
    if (t) storageSet(StorageKeys.ACCESS_TOKEN, t);
    else storageRemove(StorageKeys.ACCESS_TOKEN);
  }, []);

  const persistSessionTokens = useCallback(
    (data) => {
      if (data?.accessToken) setAccessToken(data.accessToken);
      if (data?.refreshToken) storageSet(StorageKeys.REFRESH_TOKEN, data.refreshToken);
      if (data?.adminGateToken) storageSet(StorageKeys.ADMIN_GATE_TOKEN, data.adminGateToken);
      else if (data?.user?.role && data.user.role !== "admin") {
        storageRemove(StorageKeys.ADMIN_GATE_TOKEN);
      }
    },
    [setAccessToken]
  );

  const loadUserForToken = useCallback(
    async (token, { allowJwtFallback = true } = {}) => {
      if (!token) return false;
      try {
        const me = await apiFetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (me?.user) {
          setUser(mergeMeUser(me.user, token));
          setAccessToken(token);
          if (me.user.roleDemotionNotice) {
            storageRemove(StorageKeys.ADMIN_GATE_TOKEN);
          }
          return true;
        }
      } catch {
        /* network or 401 — fall back below when allowed */
      }
      if (!allowJwtFallback) return false;
      const fromJwt = userFromJwt(token);
      if (fromJwt) {
        setUser(fromJwt);
        setAccessToken(token);
        return true;
      }
      return false;
    },
    [setAccessToken]
  );

  const refreshAccess = useCallback(async () => {
    const token = await refreshSessionTokens();
    if (token) {
      await loadUserForToken(token);
      return {
        accessToken: token,
        refreshToken: storageGet(StorageKeys.REFRESH_TOKEN)
      };
    }
    return { accessToken: null };
  }, [loadUserForToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { accessToken: token } = await restoreSessionFromStorage();
        if (cancelled) return;
        if (token) {
          await loadUserForToken(token);
          const p = decodeJwtPayload(token);
          if (p?.role === "admin" && !storageGet(StorageKeys.ADMIN_GATE_TOKEN)) {
            await refreshSessionTokens();
          }
          return;
        }
        setAccessToken(null);
        storageRemove(StorageKeys.REFRESH_TOKEN);
        setUser(null);
      } catch {
        if (cancelled) return;
        const token = readStoredAccessToken();
        if (token && isStoredAccessTokenValid()) {
          await loadUserForToken(token);
        } else {
          setAccessToken(null);
          storageRemove(StorageKeys.REFRESH_TOKEN);
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setAccessToken, loadUserForToken]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onToken = (e) => {
      const token = e?.detail || null;
      if (token) {
        setAccessToken(token);
        void loadUserForToken(token);
        return;
      }
      void (async () => {
        const restored = await refreshSessionTokens();
        if (restored) {
          setAccessToken(restored);
          await loadUserForToken(restored);
          return;
        }
        const existing = readStoredAccessToken();
        if (existing && isStoredAccessTokenValid()) {
          setAccessToken(existing);
          await loadUserForToken(existing);
          return;
        }
        setAccessToken(null);
        storageRemove(StorageKeys.REFRESH_TOKEN);
        setUser(null);
      })();
    };
    window.addEventListener("auth:token", onToken);
    return () => window.removeEventListener("auth:token", onToken);
  }, [setAccessToken, loadUserForToken]);

  useEffect(() => {
    if (typeof window === "undefined" || !accessToken) return undefined;
    const onStorage = (e) => {
      if (e.key !== StorageKeys.ACCESS_TOKEN && e.key !== StorageKeys.REFRESH_TOKEN) return;
      const nextAccess = storageGet(StorageKeys.ACCESS_TOKEN);
      if (!nextAccess || nextAccess === accessToken) return;
      if (isAccessTokenExpired(nextAccess)) return;
      setAccessTokenState(nextAccess);
      void loadUserForToken(nextAccess);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [accessToken, loadUserForToken]);

  useEffect(() => {
    if (typeof window === "undefined" || !accessToken) return undefined;
    const REFRESH_AHEAD_SEC = 180;
    const refreshIfSoon = () => {
      const t = readStoredAccessToken();
      if (!t || !isAccessTokenExpired(t, REFRESH_AHEAD_SEC)) return;
      void refreshSessionTokens().then((next) => {
        if (next) void loadUserForToken(next);
      });
    };
    refreshIfSoon();
    const id = window.setInterval(refreshIfSoon, 90_000);
    return () => window.clearInterval(id);
  }, [accessToken, loadUserForToken]);

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
        setUser(userFromJwt(data.accessToken, identifier) || { id: "", role: "buyer", email: identifier });
      }
      persistSessionTokens(data);
      return data;
    },
    [persistSessionTokens]
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
        setUser(userFromJwt(data.accessToken, email) || { id: "", role: "buyer", email });
      }
      persistSessionTokens(data);
      return data;
    },
    [persistSessionTokens]
  );

  const register = useCallback(async (payload) => {
    const data = await apiFetch("/api/auth/register", {
      method: "POST",
      json: payload
    });
    return data;
  }, []);

  const logout = useCallback(async () => {
    const storedRefresh = storageGet(StorageKeys.REFRESH_TOKEN);
    try {
      await apiFetch("/api/auth/logout", {
        method: "POST",
        json: storedRefresh ? { refreshToken: storedRefresh } : {}
      });
    } catch {
      /* still clear local */
    }
    setUser(null);
    setAccessToken(null);
    storageRemove(StorageKeys.REFRESH_TOKEN);
    storageRemove(StorageKeys.CSRF_TOKEN);
    storageRemove(StorageKeys.ADMIN_GATE_TOKEN);
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
