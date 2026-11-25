import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useBar } from "./bar";
import { useMedia } from "./lib/media";
import { useTheme, type Theme } from "./theme";

export type ShellSlot = "mark" | "identity" | "nav" | "status" | "tools" | "actions";
export type ShellSlots = Partial<Record<ShellSlot, ReactNode>>;

export interface ShellHosts {
  readonly main: HTMLElement;
}

export interface ShellProps {
  readonly header: ShellSlots;
  readonly fold?: readonly ShellSlot[];
  readonly breakpoint?: number;
  readonly storage: string;
  readonly onTheme?: (theme: Theme) => void;
  readonly hosts: (hosts: ShellHosts) => void;
}

const ORDER: readonly ShellSlot[] = ["mark", "identity", "nav", "status", "tools", "actions"];
const FOLDED: readonly ShellSlot[] = ["nav", "status", "tools"];
const BRAND: readonly ShellSlot[] = ["mark", "identity"];

export function Shell({ header, fold = FOLDED, breakpoint = 900, storage, onTheme, hosts }: ShellProps) {
  const [theme, toggleTheme] = useTheme(storage, onTheme);
  const narrow = useMedia("(max-width: " + (breakpoint - 1) + "px)");
  const [menu, setMenu] = useState(false);
  const bar = useRef<HTMLElement | null>(null);
  const main = useRef<HTMLElement | null>(null);
  const announced = useRef(false);
  const foldId = useId();

  const [hidden, show] = useBar(bar, main, narrow, menu);

  useEffect(() => {
    if (announced.current || !main.current) return;
    announced.current = true;
    hosts({ main: main.current });
  }, [hosts]);

  useEffect(() => {
    setMenu(false);
  }, [narrow]);

  useEffect(() => {
    if (hidden) setMenu(false);
  }, [hidden]);

  useEffect(() => {
    if (!menu) return;
    const outside = (e: MouseEvent) => {
      const t = e.target as Element;
      if (!document.getElementById(foldId)?.contains(t) && !t.closest(".zr-bar-menu")) setMenu(false);
    };
    const escape = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "Escape" || t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName)) return;
      setMenu(false);
      e.preventDefault();
    };
    document.addEventListener("click", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("click", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [menu, foldId]);

  const inFold = (slot: ShellSlot) => (narrow ? fold.includes(slot) : FOLDED.includes(slot));
  const present = (slot: ShellSlot) => header[slot] != null && header[slot] !== false;
  const slotNode = (slot: ShellSlot) => (
    <div key={slot} className="zr-bar-slot" data-slot={slot}>
      {header[slot]}
    </div>
  );
  const nextTheme = theme === "dark" ? "light" : "dark";
  const folded = ORDER.filter((s) => present(s) && inFold(s));

  return (
    <div className="zr-shell-chrome" data-narrow={narrow ? "" : undefined}>
      <header id="bar" ref={bar} className="zr-bar" data-hidden={narrow && hidden ? "" : undefined} data-menu={menu ? "" : undefined} onFocus={show}>
        <div className="zr-bar-brand">{BRAND.filter((s) => present(s) && !inFold(s)).map(slotNode)}</div>
        <div id={foldId} className="zr-bar-fold" data-open={menu ? "" : undefined} onClick={(e) => narrow && (e.target as Element).closest("a, button") && setMenu(false)} onChange={() => narrow && setMenu(false)}>
          {folded.map(slotNode)}
          <button id="b-theme" className="zr-bar-toggle" data-slot="tool" title={"switch to " + nextTheme} onClick={toggleTheme}>
            {theme === "dark" ? "☀" : "☾"}
            <span className="zr-bar-label"> {nextTheme}</span>
          </button>
        </div>
        {present("actions") && !inFold("actions") && slotNode("actions")}
        <button className="zr-bar-menu" aria-expanded={menu} aria-controls={foldId} aria-label="More" title="More" onClick={() => setMenu(!menu)}>
          ⋯
        </button>
      </header>
      <div className="zr-shell-body">
        <main ref={main} id="main" className="zr-shell-main" />
      </div>
    </div>
  );
}
