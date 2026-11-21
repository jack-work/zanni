import { useLayoutEffect, useRef, type ReactNode } from "react";

interface Ink {
  readonly left: number;
  readonly right: number;
  readonly ascent: number;
  readonly descent: number;
}

const seen = new Map<string, Ink | null>();
let canvas: CanvasRenderingContext2D | null | undefined;

function context(): CanvasRenderingContext2D | null {
  if (canvas === undefined) {
    canvas = typeof window !== "undefined" && "CanvasRenderingContext2D" in window ? document.createElement("canvas").getContext("2d") : null;
  }
  return canvas;
}

export function inkOf(glyph: string, font: string): Ink | null {
  const key = font + "\0" + glyph;
  if (seen.has(key)) return seen.get(key) ?? null;
  const ctx = context();
  let ink: Ink | null = null;
  if (ctx) {
    ctx.font = font;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    const size = parseFloat(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? "16");
    const pad = Math.ceil(size);
    const w = Math.ceil(ctx.measureText(glyph).width) + pad * 2;
    const h = Math.ceil(size * 3);
    ctx.canvas.width = w;
    ctx.canvas.height = h;
    ctx.font = font;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = "#000";
    ctx.fillText(glyph, pad, Math.ceil(size * 2));
    const px = ctx.getImageData(0, 0, w, h).data;
    let x0 = w;
    let x1 = -1;
    let y0 = h;
    let y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (px[(y * w + x) * 4 + 3]! > 24) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 >= 0) ink = { left: x0 - pad, right: x1 + 1 - pad, ascent: Math.ceil(size * 2) - y0, descent: y1 + 1 - Math.ceil(size * 2) };
  }
  seen.set(key, ink);
  return ink;
}

function contentBox(el: HTMLElement): { top: number; height: number } {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const px = (v: string) => parseFloat(v) || 0;
  const top = r.top + px(cs.borderTopWidth) + px(cs.paddingTop);
  return { top, height: r.height - px(cs.borderTopWidth) - px(cs.paddingTop) - px(cs.borderBottomWidth) - px(cs.paddingBottom) };
}

export function Glyph({ glyph, className, tone }: { glyph: string; className?: string; tone?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const base = useRef<HTMLElement | null>(null);
  const held = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const mark = base.current;
    if (!el || !mark) return;
    const place = () => {
      held.current?.cancel();
      held.current = null;
      const cs = getComputedStyle(el);
      const ink = inkOf(glyph, [cs.fontStyle, cs.fontWeight, cs.fontSize, cs.fontFamily].join(" "));
      if (!ink) return;
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return;
      const baseline = mark.getBoundingClientRect().bottom;
      const home = el.parentElement ? contentBox(el.parentElement) : box;
      const x = box.left + (ink.left + ink.right) / 2 - (box.left + box.width / 2);
      const y = baseline + (ink.descent - ink.ascent) / 2 - (home.top + home.height / 2);
      if (typeof el.animate !== "function") return;
      held.current = el.animate({ translate: -x + "px " + -y + "px" }, { duration: 0, fill: "forwards" });
    };
    place();
    let live = true;
    void document.fonts?.ready.then(() => {
      if (!live) return;
      seen.clear();
      place();
    });
    return () => {
      live = false;
      held.current?.cancel();
    };
  }, [glyph]);
  return (
    <span ref={ref} className={["zr-ink", className].filter(Boolean).join(" ")} data-tone={tone} aria-hidden="true">
      {glyph}
      <i ref={base} className="zr-ink-base" />
    </span>
  );
}
