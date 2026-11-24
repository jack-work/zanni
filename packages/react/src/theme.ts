import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

const dark = () => (typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : undefined);

function resolve(storage: string): Theme {
  const kept = typeof localStorage === "undefined" ? null : localStorage.getItem(storage + ".theme");
  if (kept === "light" || kept === "dark") return kept;
  return dark()?.matches ? "dark" : "light";
}

export function useTheme(storage: string, onTheme?: (theme: Theme) => void): readonly [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => resolve(storage));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    onTheme?.(theme);
  }, [theme, onTheme]);
  useEffect(() => {
    const query = dark();
    const follow = () => setTheme(resolve(storage));
    query?.addEventListener("change", follow);
    return () => query?.removeEventListener("change", follow);
  }, [storage]);
  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    if (next === (dark()?.matches ? "dark" : "light")) localStorage.removeItem(storage + ".theme");
    else localStorage.setItem(storage + ".theme", next);
    setTheme(next);
  }, [theme, storage]);
  return [theme, toggle];
}
