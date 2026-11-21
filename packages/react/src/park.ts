export const PARK_MARGIN = "200% 0px";
export const PARK_HEIGHT = 400;

type Watch = (near: boolean, height: number) => void;

const watching = new WeakMap<Element, Watch>();
const observers = new WeakMap<Element, IntersectionObserver>();

function observerOf(root: Element): IntersectionObserver {
  let io = observers.get(root);
  if (!io) {
    io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) watching.get(e.target)?.(e.isIntersecting, e.boundingClientRect.height);
      },
      { root, rootMargin: PARK_MARGIN },
    );
    observers.set(root, io);
  }
  return io;
}

export function watchNear(el: Element, root: Element, watch: Watch): () => void {
  const io = observerOf(root);
  watching.set(el, watch);
  io.observe(el);
  return () => {
    watching.delete(el);
    io.unobserve(el);
  };
}

let sheet: CSSStyleSheet | undefined;
const rules = new Map<number, CSSStyleRule>();

export function parkHeight(turn: number, height: number): void {
  if (!sheet) {
    sheet = new CSSStyleSheet();
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }
  let rule = rules.get(turn);
  if (!rule) {
    sheet.insertRule('.nodi-turn[data-turn="' + turn + '"][data-parked] {}', sheet.cssRules.length);
    rule = sheet.cssRules[sheet.cssRules.length - 1] as CSSStyleRule;
    rules.set(turn, rule);
  }
  rule.style.height = height + "px";
}
