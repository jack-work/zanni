import { glyphs } from "../../index";

export const STATUS_SPINNER = [...glyphs["tool.running"]];

export function fmtTokens(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 1e6) return (n / 1000).toFixed(1) + "k";
  return (n / 1e6).toFixed(1) + "m";
}

export function ctxLine(used: number | undefined, limit: number | undefined, exact = true): string {
  if (used === undefined) return "";
  const tokens = Math.max(0, used);
  const shown = (exact || tokens === 0 ? "" : "~") + fmtTokens(tokens);
  if (!limit || limit <= 0) return shown + " (capacity unknown)";
  return shown + "/" + fmtTokens(limit) + " " + ((tokens * 100) / limit).toFixed(1) + "%";
}

export function stateGlyph(o: { link: string; running: boolean; failed: boolean; interrupted?: boolean; frame: number }): string {
  if (o.link !== "live" && o.link !== "catching-up") return glyphs["session.disconnected"];
  if (o.running) return STATUS_SPINNER[o.frame % STATUS_SPINNER.length] ?? glyphs["tool.running"];
  if (o.failed) return glyphs["tool.error"];
  return o.interrupted ? "!" : glyphs["tool.ok"];
}
