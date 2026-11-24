import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { scrollRoot } from "./follow";

const SPACING = 24;
const ESTIMATE = 400 + SPACING;
const TAIL = 3;
const BEHIND = 1800;
const AHEAD = 2700;

let sheet: CSSStyleSheet | undefined;
const set = [NaN, NaN];

function setGap(slot: number, px: number): void {
  if (!document.adoptedStyleSheets) return;
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync('[data-slot="0"] {} [data-slot="1"] {}');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }
  if (set[slot] === px) return;
  set[slot] = px;
  (sheet.cssRules[slot] as CSSStyleRule).style.height = px + "px";
}

export function useTurnWindow(turns: readonly { readonly turn: number }[]) {
  const heights = useRef<Record<string, number>>({});
  const [anchor, setAnchor] = useState(-1);
  const latest = useRef(turns);
  latest.current = turns;
  const n = turns.length;
  const sizeOf = (i: number, all = turns) => heights.current[all[i]!.turn] ?? ESTIMATE;
  const at = turns.findIndex((t) => t.turn === anchor);
  let lo = at < 0 ? n - 1 : at;
  let hi = lo + 1;
  for (let a = 0; lo > 0 && a < BEHIND; ) a += sizeOf(--lo);
  for (let a = 0; hi < n && a < AHEAD; ) a += sizeOf(hi++);
  const tail = Math.max(hi, n - TAIL);
  const spans = [[lo, hi, lo > 0], [tail, n, tail > hi]] as const;

  useLayoutEffect(() => {
    const fit = () => {
      let top = 0;
      let mid = 0;
      for (let i = 0; i < tail; i++) if (i < lo) top += sizeOf(i);
      else if (i >= hi) mid += sizeOf(i);
      setGap(0, top - SPACING);
      setGap(1, mid - SPACING);
    };
    fit();
    document.querySelectorAll<HTMLElement>(".nodi-turn").forEach((t) => (heights.current[t.dataset.turn!] = t.offsetHeight + SPACING));
    fit();
  });

  useEffect(() => {
    const root = scrollRoot();
    const read = () => {
      const all = latest.current;
      const y = root.scrollTop - (document.querySelector(".nodi-turns")!.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop);
      let acc = 0;
      let i = 0;
      for (; i < all.length - 1 && (acc += sizeOf(i, all)) <= y; i++);
      setAnchor(all[i]?.turn ?? -1);
    };
    root.addEventListener("scroll", read, { passive: true });
    return () => root.removeEventListener("scroll", read);
  }, []);

  return [spans, setAnchor] as const;
}
