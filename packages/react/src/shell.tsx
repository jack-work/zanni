import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useBar } from "./bar";
import { Pane } from "./pane";
import { useTheme, type Theme } from "./theme";

export type ShellSlot = "mark" | "identity" | "nav" | "status" | "tools" | "actions";
export type ShellSlots = Partial<Record<ShellSlot, ReactNode>>;

export interface ShellPane {
  readonly id: string;
  readonly label: string;
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpen?: (open: boolean) => void;
  readonly defaultWidth?: number;
  readonly onWidth?: (width: number) => void;
  readonly tabs?: readonly string[];
  readonly tab?: string;
  readonly onTab?: (tab: string) => void;
}

export interface ShellHosts {
  readonly main: HTMLElement;
  readonly left: HTMLElement;
  readonly right: HTMLElement | null;
}

export interface ShellProps {
  readonly header: ShellSlots;
  readonly left: ShellPane;
  readonly right?: ShellPane;
  readonly fold?: readonly ShellSlot[];
  readonly breakpoint?: number;
  readonly storage: string;
  readonly onTheme?: (theme: Theme) => void;
  readonly hosts: (hosts: ShellHosts) => void;
}

const ORDER: readonly ShellSlot[] = ["mark", "identity", "nav", "status", "tools", "actions"];
const FOLDED: readonly ShellSlot[] = ["nav", "status", "tools"];
const BRAND: readonly ShellSlot[] = ["mark", "identity"];

interface Saved {
  readonly w: number;
  readonly open: boolean;
}

function readSaved(key: string, fallback: Saved): Saved {
  try {
    const got = JSON.parse(localStorage.getItem(key) ?? "null");
    if (got && typeof got.w === "number" && typeof got.open === "boolean") return got;
  } catch {}
  return fallback;
}

function readTab(key: string, tabs: readonly string[] | undefined): string {
  let kept: string | null = null;
  try {
    kept = localStorage.getItem(key);
  } catch {}
  return kept !== null && tabs?.includes(kept) ? kept : (tabs?.[0] ?? "");
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function useNarrow(breakpoint: number): boolean {
  const query = "(max-width: " + (breakpoint - 1) + "px)";
  const [narrow, setNarrow] = useState(() => typeof matchMedia === "function" && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const list = matchMedia(query);
    const sync = () => setNarrow(list.matches);
    sync();
    list.addEventListener("change", sync);
    return () => list.removeEventListener("change", sync);
  }, [query]);
  return narrow;
}

function useColumn(storage: string, pane: ShellPane | undefined, fallback: Saved) {
  const key = storage + "." + (pane?.id ?? "");
  const [saved, setSaved] = useState<Saved>(() => {
    const start = { w: pane?.defaultWidth ?? fallback.w, open: pane?.defaultOpen ?? fallback.open };
    return pane ? readSaved(key, start) : start;
  });
  const open = pane?.open ?? saved.open;
  useEffect(() => {
    if (pane) write(key, JSON.stringify({ w: saved.w, open }));
  }, [pane, key, saved.w, open]);
  const setColumn = useCallback((next: boolean) => setSaved((s) => ({ ...s, open: next })), []);
  const setWidth = useCallback(
    (w: number) => {
      setSaved((s) => ({ ...s, w }));
      pane?.onWidth?.(w);
    },
    [pane],
  );
  return { width: saved.w, column: saved.open, setColumn, setWidth } as const;
}

export function Shell({ header, left, right, fold = FOLDED, breakpoint = 900, storage, onTheme, hosts }: ShellProps) {
  const [theme, toggleTheme] = useTheme(storage, onTheme);
  const narrow = useNarrow(breakpoint);
  const [menu, setMenu] = useState(false);
  const [overlay, setOverlay] = useState<string | null>(null);
  const leftState = useColumn(storage, left, { w: 280, open: true });
  const rightState = useColumn(storage, right, { w: 360, open: true });
  const tabKey = storage + "." + left.id + ".tab";
  const [savedTab, setSavedTab] = useState(() => readTab(tabKey, left.tabs));
  const tab = left.tab ?? savedTab;
  const bar = useRef<HTMLElement | null>(null);
  const main = useRef<HTMLElement | null>(null);
  const leftHost = useRef<HTMLDivElement | null>(null);
  const rightHost = useRef<HTMLDivElement | null>(null);
  const announced = useRef(false);
  const foldId = useId();

  const leftOpen = narrow ? (left.open ?? overlay === left.id) : left.open ?? leftState.column;
  const rightOpen = right ? (narrow ? (right.open ?? overlay === right.id) : right.open ?? rightState.column) : false;
  const [hidden, show] = useBar(bar, main, narrow, menu || leftOpen || rightOpen);

  const setOpen = (pane: ShellPane, state: { setColumn: (o: boolean) => void }, next: boolean) => {
    if (narrow) {
      setOverlay(next ? pane.id : null);
      setMenu(false);
    } else state.setColumn(next);
    pane.onOpen?.(next);
  };
  const toggleLeft = (next: boolean) => {
    if (narrow && next && right && rightOpen) right.onOpen?.(false);
    setOpen(left, leftState, next);
  };
  const toggleRight = (next: boolean) => {
    if (narrow && next && leftOpen) left.onOpen?.(false);
    if (right) setOpen(right, rightState, next);
  };

  useEffect(() => {
    if (announced.current || !main.current || !leftHost.current) return;
    announced.current = true;
    hosts({ main: main.current, left: leftHost.current, right: rightHost.current });
  }, [hosts]);

  useEffect(() => {
    setOverlay(null);
    setMenu(false);
  }, [narrow]);

  useEffect(() => {
    if (hidden) setMenu(false);
  }, [hidden]);

  useEffect(() => {
    if (!narrow || (!leftOpen && !rightOpen)) return;
    const close = () => {
      if (leftOpen) toggleLeft(false);
      else toggleRight(false);
    };
    window.addEventListener("popstate", close);
    return () => window.removeEventListener("popstate", close);
  });

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
  const overlaid = narrow && (leftOpen || rightOpen);
  const chooseTab = (t: string) => {
    setSavedTab(t);
    write(tabKey, t);
    left.onTab?.(t);
  };

  return (
    <div className="zr-shell-chrome" data-narrow={narrow ? "" : undefined} data-left={leftOpen ? "" : undefined} data-right={right && rightOpen ? "" : undefined}>
      <header id="bar" ref={bar} className="zr-bar" data-hidden={narrow && hidden ? "" : undefined} data-menu={menu ? "" : undefined} onFocus={show}>
        <button id={"b-" + left.id} className="zr-bar-toggle" data-slot="drawer-toggle" aria-controls={left.id} aria-expanded={leftOpen} title={left.label} onClick={() => toggleLeft(!leftOpen)}>
          ☰
        </button>
        <div className="zr-bar-brand">{BRAND.filter((s) => present(s) && !inFold(s)).map(slotNode)}</div>
        <div id={foldId} className="zr-bar-fold" data-open={menu ? "" : undefined}>
          {folded.map(slotNode)}
          <button id="b-theme" className="zr-bar-toggle" data-slot="tool" title={"switch to " + nextTheme} onClick={toggleTheme}>
            {theme === "dark" ? "☀" : "☾"}
            <span className="zr-bar-label"> {nextTheme}</span>
          </button>
        </div>
        {present("actions") && !inFold("actions") && slotNode("actions")}
        {right && (
          <button id={"b-" + right.id} className="zr-bar-toggle" data-slot="drawer-toggle" aria-controls={right.id} aria-expanded={rightOpen} title={right.label} onClick={() => toggleRight(!rightOpen)}>
            ¶
          </button>
        )}
        <button className="zr-bar-menu" aria-expanded={menu} aria-controls={foldId} aria-label="More" title="More" onClick={() => setMenu(!menu)}>
          ⋯
        </button>
      </header>
      <div className="zr-shell-body">
        <Pane id={left.id} label={left.label} open={leftOpen} width={leftState.width} onWidth={leftState.setWidth} onClose={() => toggleLeft(false)} form={narrow ? "drawer" : "docked"} as="nav" className="zr-shell-left">
          {left.tabs && (
            <div className="zr-pane-tabs" role="tablist" aria-label={left.label}>
              {left.tabs.map((t) => (
                <button key={t} role="tab" className="zr-pane-tab" aria-selected={t === tab} onClick={() => chooseTab(t)}>
                  {t}
                </button>
              ))}
            </div>
          )}
          <div ref={leftHost} className="zr-shell-host" />
        </Pane>
        <main ref={main} id="main" className="zr-shell-main" />
        {right && (
          <Pane id={right.id} label={right.label} open={rightOpen} width={rightState.width} onWidth={rightState.setWidth} onClose={() => toggleRight(false)} side="right" form={narrow ? "sheet" : "docked"} className="zr-shell-right">
            <div ref={rightHost} className="zr-shell-host" />
          </Pane>
        )}
      </div>
      {overlaid && <div className="zr-scrim" onClick={() => (leftOpen ? toggleLeft(false) : toggleRight(false))} />}
    </div>
  );
}
