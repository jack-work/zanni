export interface Route {
  readonly store: string;
  readonly aria: string;
  readonly turn?: number;
}

export function routeFor(store: string, aria?: string, turn?: number): string {
  if (!store) return "#/";
  if (!aria) return "#/" + encodeURIComponent(store);
  return "#/" + encodeURIComponent(store) + "/" + encodeURIComponent(aria) + (turn !== undefined && turn > 0 ? ":" + turn : "");
}

export function parseRoute(hash: string): Route | null {
  const m = /^#\/([^/:]+)(?:\/([^/:]+)(?::(\d+))?)?$/.exec(hash);
  if (!m) return null;
  try {
    const out = { store: decodeURIComponent(m[1] ?? ""), aria: m[2] ? decodeURIComponent(m[2]) : "" };
    return m[3] !== undefined ? { ...out, turn: Number(m[3]) } : out;
  } catch {
    return null;
  }
}
