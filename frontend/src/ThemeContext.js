import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { h, f } from "./h";

const ThemeContext = createContext({
  dark: true,
  toggle: () => {}
});

const STORAGE_KEY = "campus-mart-theme";
const hasWindow = typeof window !== "undefined";

function getStoredTheme() {
  if (!hasWindow) return null;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

function getSystemDark() {
  if (!hasWindow || !window.matchMedia) return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }) {
  const [themePref, setThemePref] = useState(() => getStoredTheme());
  const [systemDark, setSystemDark] = useState(() => getSystemDark());
  const dark = themePref ? themePref === "dark" : systemDark;

  useEffect(() => {
    if (!hasWindow || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => setSystemDark(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.classList.add("dark");
    else root.classList.remove("dark");
    try {
      if (themePref) localStorage.setItem(STORAGE_KEY, themePref);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, [dark, themePref]);

  const value = useMemo(
    () => ({
      dark,
      setDark: (next) => setThemePref(next ? "dark" : "light"),
      toggle: () => setThemePref(dark ? "light" : "dark")
    }),
    [dark]
  );

  return h(ThemeContext.Provider, { value }, children);
}

export function useTheme() {
  return useContext(ThemeContext);
}
