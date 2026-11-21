import { useLayoutEffect, useRef, useState } from "react";
import { Plain } from "./text";

export const FIT_ELLIPSIS = " ..";

export interface Fitted {
  readonly text: string;
  readonly cut: boolean;
}

export function firstLine(text: string): { line: string; more: boolean } {
  const rows = text.split("\n").map((r) => r.trim());
  const at = rows.findIndex((r) => r !== "");
  if (at < 0) return { line: "", more: false };
  return { line: rows[at]!.replace(/\s+/g, " "), more: rows.slice(at + 1).some((r) => r !== "") };
}

export function fitText(text: string, more: boolean, fits: (candidate: string) => boolean): Fitted {
  if (!more && fits(text)) return { text, cut: false };
  const cells = Array.from(text);
  const shown = (n: number) => cells.slice(0, n).join("").trimEnd();
  let lo = 0;
  let hi = cells.length;
  if (more && fits(text + FIT_ELLIPSIS)) return { text, cut: true };
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (fits(shown(mid) + FIT_ELLIPSIS)) lo = mid;
    else hi = mid - 1;
  }
  return { text: shown(lo), cut: true };
}

export function Fit({ text, className }: { text: string; className?: string }) {
  const box = useRef<HTMLSpanElement | null>(null);
  const probe = useRef<HTMLSpanElement | null>(null);
  const { line, more } = firstLine(text);
  const [fitted, setFitted] = useState<Fitted>({ text: line, cut: more });

  useLayoutEffect(() => {
    const el = box.current;
    const ruler = probe.current;
    if (!el || !ruler) return;
    const refit = () => {
      const room = el.clientWidth;
      const next = room > 0 ? fitText(line, more, (c) => ((ruler.textContent = c), ruler.offsetWidth <= room)) : { text: line, cut: more };
      setFitted((prev) => (prev.text === next.text && prev.cut === next.cut ? prev : next));
    };
    refit();
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(refit);
    watch.observe(el);
    void document.fonts?.ready.then(refit);
    return () => watch.disconnect();
  }, [line, more]);

  return (
    <span ref={box} className={["zr-fit", className].filter(Boolean).join(" ")}>
      <Plain text={fitted.text} />
      {fitted.cut && <span className="zr-fit-more">{FIT_ELLIPSIS}</span>}
      <span ref={probe} className="zr-fit-probe" aria-hidden="true" />
    </span>
  );
}
