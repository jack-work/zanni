import { useEffect } from "react";
import { rootVar } from "./rootvars";

export const KEYBOARD_MIN = 120;

export interface ViewportFrame {
  readonly height: number;
  readonly top: number;
  readonly inset: number;
  readonly keyboard: boolean;
}

interface VisualViewportLike {
  readonly height: number;
  readonly offsetTop: number;
  readonly scale: number;
  addEventListener(type: "resize" | "scroll", fn: () => void): void;
  removeEventListener(type: "resize" | "scroll", fn: () => void): void;
}

export function frameOf(vv: Pick<VisualViewportLike, "height" | "offsetTop" | "scale">, layoutHeight: number): ViewportFrame {
  if (Math.abs(vv.scale - 1) > 0.01) return { height: layoutHeight, top: 0, inset: 0, keyboard: false };
  const top = Math.max(0, Math.round(vv.offsetTop));
  const height = Math.round(vv.height);
  const inset = Math.max(0, layoutHeight - top - height);
  return { height, top, inset, keyboard: layoutHeight - height >= KEYBOARD_MIN };
}

type ViewportSource = { visualViewport?: VisualViewportLike | null };

export function viewportHeight(): number {
  const vv = (window as unknown as ViewportSource).visualViewport;
  return vv ? frameOf(vv, window.innerHeight).height : Math.round(window.innerHeight);
}

function clear(): void {
  for (const name of ["--zr-vv-h", "--zr-vv-top", "--zr-kb"]) rootVar(name, null);
}

const keyboardListeners = new Set<(open: boolean) => void>();

export function onKeyboard(fn: (open: boolean) => void): () => void {
  keyboardListeners.add(fn);
  return () => keyboardListeners.delete(fn);
}

export function trackViewport(root: HTMLElement = document.documentElement): () => void {
  const vv = (window as unknown as ViewportSource).visualViewport;
  if (!vv) return () => {};
  let last = "";
  let open = false;
  const write = () => {
    const f = frameOf(vv, window.innerHeight);
    const key = f.height + ":" + f.top + ":" + f.inset + ":" + f.keyboard;
    if (key === last) return;
    last = key;
    const full = f.height === Math.round(window.innerHeight) && f.top === 0;
    rootVar("--zr-vv-h", full ? null : f.height + "px");
    rootVar("--zr-vv-top", full ? null : f.top + "px");
    rootVar("--zr-kb", f.inset ? f.inset + "px" : null);
    if (f.keyboard) root.setAttribute("data-keyboard", "");
    else root.removeAttribute("data-keyboard");
    if (f.keyboard !== open && Math.abs(vv.scale - 1) <= 0.01) {
      open = f.keyboard;
      keyboardListeners.forEach((fn) => fn(open));
    }
  };
  const wake = () => {
    if (document.visibilityState !== "hidden") write();
  };
  write();
  vv.addEventListener("resize", write);
  vv.addEventListener("scroll", write);
  window.addEventListener("resize", write);
  window.addEventListener("orientationchange", write);
  window.addEventListener("pageshow", wake);
  document.addEventListener("visibilitychange", wake);
  return () => {
    vv.removeEventListener("resize", write);
    vv.removeEventListener("scroll", write);
    window.removeEventListener("resize", write);
    window.removeEventListener("orientationchange", write);
    window.removeEventListener("pageshow", wake);
    document.removeEventListener("visibilitychange", wake);
    clear();
    root.removeAttribute("data-keyboard");
  };
}

export function useViewport(): void {
  useEffect(() => trackViewport(), []);
}
