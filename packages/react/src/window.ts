import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { scrollRoot } from "./follow";

const ESTIMATE = 400;
const TAIL = 3;
const BEHIND = 1800;
const AHEAD = 2700;

let sheet: CSSStyleSheet | undefined;

function setGap(slot: number, px: number): void {
  if (!document.adoptedStyleSheets) return;
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync('.nodi-gap[data-slot="0"] {} .nodi-gap[data-slot="1"] {}');
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }
  (sheet.cssRules[slot] as CSSStyleRule).style.height = px + "px";
}

export function useTurnWindow(turns: readonly { readonly turn: number }[], list: RefObject<HTMLElement | null>) {
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
  const spans = [[lo, hi], [tail, n]];

  useLayoutEffect(() => {
    list.current!.querySelectorAll<HTMLElement>(".nodi-turn").forEach((t) => (heights.current[t.dataset.turn!] = t.offsetHeight));
    let top = 0;
    let mid = 0;
    for (let i = 0; i < tail; i++) if (i < lo) top += sizeOf(i);
    else if (i >= hi) mid += sizeOf(i);
    setGap(0, top);
    setGap(1, mid);
  });

  useEffect(() => {
    const root = scrollRoot();
    const read = () => {
      const all = latest.current;
      const y = root.scrollTop - (list.current!.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop);
      let acc = 0;
      let i = 0;
      for (; i < all.length - 1 && (acc += sizeOf(i, all)) <= y; i++);
      setAnchor(all[i]?.turn ?? -1);
    };
    root.addEventListener("scroll", read, { passive: true });
    return () => root.removeEventListener("scroll", read);
  }, [list]);

  return [spans, setAnchor] as const;
}
