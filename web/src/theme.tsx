import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Theme = "light" | "dark" | "system";
const KEY = "theme"; // also read by the inline script in index.html, which applies the theme before the app loads
const DARK_QUERY = "(prefers-color-scheme: dark)";

type Ctx = { theme: Theme; resolvedTheme: "light" | "dark"; setTheme: (t: Theme) => void };
// Without a provider (tests, isolated components) the theme is the device's and cannot be changed.
const ThemeCtx = createContext<Ctx>({ theme: "system", resolvedTheme: "light", setTheme: () => {} });

const stored = (): Theme => {
  try { const t = localStorage.getItem(KEY); return t === "light" || t === "dark" ? t : "system"; } catch { return "system"; }
};
const deviceDark = () => typeof matchMedia === "function" && matchMedia(DARK_QUERY).matches;

/** Light, dark or the device's theme, remembered in this browser. Dark is the "dark" class on <html>; light is no class. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(stored);
  const [device, setDevice] = useState(deviceDark);

  useEffect(() => {
    const mq = matchMedia(DARK_QUERY);
    const onChange = () => setDevice(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme = theme === "system" ? (device ? "dark" : "light") : theme;
  useEffect(() => { document.documentElement.classList.toggle("dark", resolvedTheme === "dark"); }, [resolvedTheme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try { localStorage.setItem(KEY, t); } catch { /* private mode: keep it for this session only */ }
  }, []);
  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
