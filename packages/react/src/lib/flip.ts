import { EASE } from "../motion";
import { reducedMotion } from "./media";

export const FLIP_MS = 220;

export interface Placed {
  readonly el: HTMLElement;
  readonly box: DOMRect;
  readonly resizes: boolean;
}

export function place(parts: readonly (readonly [HTMLElement | null | undefined, boolean])[]): Placed[] {
  const out: Placed[] = [];
  for (const [el, resizes] of parts) if (el) out.push({ el, box: el.getBoundingClientRect(), resizes });
  return out;
}

export function glide(from: readonly Placed[]): void {
  if (reducedMotion()) return;
  for (const { el, box, resizes } of from) {
    if (typeof el.animate !== "function") continue;
    const now = el.getBoundingClientRect();
    const dx = box.left - now.left;
    const dy = box.top - now.top;
    const sx = resizes && now.width ? box.width / now.width : 1;
    const sy = resizes && now.height ? box.height / now.height : 1;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) continue;
    el.animate([{ transform: "translate(" + dx + "px, " + dy + "px) scale(" + sx + ", " + sy + ")" }, { transform: "none" }], { duration: FLIP_MS, easing: EASE });
  }
}
