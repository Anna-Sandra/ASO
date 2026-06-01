import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "services/api";
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
    },
    [setAccessToken]
  );

  const loadUserForToken = useCallback(async (token) => {
    try {
      const me = await apiFetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (me?.user) {
        setUser(mergeMeUser(me.user, token));
        setAccessToken(token);
        return true;
      }
    } catch {
      /* fall back to JWT claims */
    }
    const fromJwt = userFromJwt(token);
    if (fromJwt) {
      setUser(fromJwt);
      setAccessToken(token);
      return true;
    }
    return false;
  }, [setAccessToken]);

  const refreshAccess = useCallback(async () => {
    const storedRefresh = storageGet(StorageKeys.REFRESH_TOKEN);
    const data = await apiFetch("/api/auth/refresh", {
      method: "POST",
      json: storedRefresh ? { refreshToken: storedRefresh } : {}
    });
    if (data?.accessToken) {
      persistSessionTokens(data);
      await loadUserForToken(data.accessToken);
    }
    return data;
  }, [persistSessionTokens, loadUserForToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let token = storageGet(StorageKeys.ACCESS_TOKEN);
        const storedRefresh = storageGet(StorageKeys.REFRESH_TOKEN);

        if (token && !isAccessTokenExpired(token)) {
          const ok = await loadUserForToken(token);
          if (!cancelled && ok) return;
        }

        let refreshData = null;
        try {
          refreshData = await apiFetch("/api/auth/refresh", {
            method: "POST",
            json: storedRefresh ? { refreshToken: storedRefresh } : {}
          });
        } catch {
          refreshData = null;
        }

        if (!cancelled && refreshData?.accessToken) {
          persistSessionTokens(refreshData);
          await loadUserForToken(refreshData.accessToken);
          return;
        }

        token = storageGet(StorageKeys.ACCESS_TOKEN);
        if (token && !isAccessTokenExpired(token)) {
          await loadUserForToken(token);
          return;
        }

        if (!cancelled) {
          setAccessToken(null);
          storageRemove(StorageKeys.REFRESH_TOKEN);
          setUser(null);
        }
      } catch {
        const token = storageGet(StorageKeys.ACCESS_TOKEN);
        if (!cancelled) {
          if (token && !isAccessTokenExpired(token)) {
            await loadUserForToken(token);
          } else {
            setAccessToken(null);
            storageRemove(StorageKeys.REFRESH_TOKEN);
            setUser(null);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setAccessToken, persistSessionTokens, loadUserForToken]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onToken = (e) => {
      const token = e?.detail || null;
      setAccessToken(token);
      if (!token) {
        storageRemove(StorageKeys.REFRESH_TOKEN);
        setUser(null);
      }
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
