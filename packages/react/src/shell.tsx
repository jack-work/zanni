import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pane } from "./pane";
import { useTheme, type Theme } from "./theme";

export interface ShellSlots {
  readonly mark?: ReactNode;
  readonly identity?: ReactNode;
  readonly nav?: ReactNode;
  readonly status?: ReactNode;
  readonly tools?: ReactNode;
  readonly actions?: ReactNode;
}

export interface ShellPane {
  readonly id: string;
  readonly label: string;
  readonly open: boolean;
  readonly onOpen: (open: boolean) => void;
  readonly width?: number;
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
  readonly breakpoint?: number;
  readonly storage: string;
  readonly onTheme?: (theme: Theme) => void;
  readonly hosts: (hosts: ShellHosts) => void;
}

const SLOTS = ["mark", "identity", "nav", "status", "tools", "actions"] as const;

function useNarrow(breakpoint: number): boolean {
  const [narrow, setNarrow] = useState(() => typeof matchMedia === "function" && matchMedia("(max-width: " + (breakpoint - 1) + "px)").matches);
  useEffect(() => {
    const query = matchMedia("(max-width: " + (breakpoint - 1) + "px)");
    const sync = () => setNarrow(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [breakpoint]);
  return narrow;
}

export function Shell({ header, left, right, breakpoint = 900, storage, onTheme, hosts }: ShellProps) {
  const [theme, toggleTheme] = useTheme(storage, onTheme);
  const narrow = useNarrow(breakpoint);
  const [menu, setMenu] = useState(false);
  const main = useRef<HTMLElement | null>(null);
  const leftHost = useRef<HTMLDivElement | null>(null);
  const rightHost = useRef<HTMLDivElement | null>(null);
  const announced = useRef(false);
  useEffect(() => {
    if (announced.current || !main.current || !leftHost.current) return;
    announced.current = true;
    hosts({ main: main.current, left: leftHost.current, right: rightHost.current });
  }, [hosts]);
  const drawer = narrow && left.open;
  const sheet = narrow && right?.open;
  return (
    <div className="zr-shell-chrome" data-narrow={narrow ? "" : undefined} data-left={left.open ? "" : undefined} data-right={right?.open ? "" : undefined}>
      <header id="bar" className="zr-bar" data-menu={menu ? "" : undefined}>
        <button id={"b-" + left.id} className="zr-bar-toggle" data-slot="drawer-toggle" aria-controls={left.id} aria-expanded={left.open} title={left.label} onClick={() => left.onOpen(!left.open)}>
          ☰
        </button>
        {SLOTS.map((slot) => header[slot] != null && <div key={slot} className="zr-bar-slot" data-slot={slot}>{header[slot]}</div>)}
        <button id="b-theme" className="zr-bar-toggle" data-slot="tool" aria-label={"Theme: " + theme} onClick={toggleTheme}>
          {theme === "dark" ? "☾" : "☀"}
          <span className="zr-bar-label"> {theme}</span>
        </button>
        {right && (
          <button id={"b-" + right.id} className="zr-bar-toggle" data-slot="drawer-toggle" aria-controls={right.id} aria-expanded={right.open} title={right.label} onClick={() => right.onOpen(!right.open)}>
            ¶
          </button>
        )}
        {narrow && (
          <button className="zr-bar-menu" aria-expanded={menu} aria-label="Menu" onClick={() => setMenu(!menu)}>
            ⋯
          </button>
        )}
      </header>
      <div className="zr-shell-body">
        <Pane id={left.id} label={left.label} open={left.open} width={left.width ?? 280} onWidth={left.onWidth ?? (() => {})} as="nav" className="zr-shell-left">
          <div ref={leftHost} className="zr-shell-host" />
        </Pane>
        <main ref={main} id="main" className="zr-shell-main" />
        {right && (
          <aside id={right.id} className="zr-shell-right" aria-label={right.label} data-open={right.open ? "" : undefined} inert={!right.open}>
            <div ref={rightHost} className="zr-shell-host" />
          </aside>
        )}
      </div>
      {(drawer || sheet) && <div className="zr-scrim" onClick={() => (drawer ? left.onOpen(false) : right?.onOpen(false))} />}
    </div>
  );
}
