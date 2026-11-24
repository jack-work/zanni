import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type Theme = "light" | "dark";

const dark = () => (typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : undefined);

function system(): Theme {
  return dark()?.matches ? "dark" : "light";
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
  useEffect(() => {
    const query = dark();
    const follow = () => setTheme(resolve(storage));
    query?.addEventListener("change", follow);
    return () => query?.removeEventListener("change", follow);
  }, [storage]);
  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    if (next === system()) localStorage.removeItem(storage + ".theme");
    else localStorage.setItem(storage + ".theme", next);
    setTheme(next);
  }, [theme, storage]);
  return [theme, toggle];
}
