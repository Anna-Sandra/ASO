import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { apiFetch } from "services/api";
import { h } from "utils/h";

const NotificationContext = createContext({
  unreadCount: 0,
  refresh: async () => {}
});

export function useNotifications() {
  return useContext(NotificationContext);
}

export function NotificationProvider({ children }) {
  const { accessToken, user, loading } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (loading || !accessToken || !user) {
      if (!accessToken || !user) setUnreadCount(0);
      return;
    }
    try {
      const d = await apiFetch("/api/notifications/summary", {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setUnreadCount(Number(d?.unreadCount) || 0);
    } catch {
      /* 401 / network */
    }
  }, [accessToken, user, loading]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!accessToken || !user) return undefined;
    const id = window.setInterval(() => void refresh(), 30000);
    return () => window.clearInterval(id);
  }, [accessToken, user, refresh]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  const value = useMemo(() => ({ unreadCount, refresh }), [unreadCount, refresh]);
  return h(NotificationContext.Provider, { value }, children);
}
