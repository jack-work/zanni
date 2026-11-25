import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { matches, useMedia } from "./lib/media";

export type Theme = "light" | "dark";

const DARK = "(prefers-color-scheme: dark)";

function system(): Theme {
  return matches(DARK) ? "dark" : "light";
}

function resolve(storage: string): Theme {
  const kept = typeof localStorage === "undefined" ? null : localStorage.getItem(storage + ".theme");
  return kept === "light" || kept === "dark" ? kept : system();
}

export function useTheme(storage: string, onTheme?: (theme: Theme) => void): readonly [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => resolve(storage));
  const notify = useRef(onTheme);
  notify.current = onTheme;
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    notify.current?.(theme);
  }, [theme]);
  const systemDark = useMedia(DARK);
  useEffect(() => setTheme(resolve(storage)), [systemDark, storage]);
  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    if (next === system()) localStorage.removeItem(storage + ".theme");
    else localStorage.setItem(storage + ".theme", next);
    setTheme(next);
  }, [theme, storage]);
  return [theme, toggle];
}
