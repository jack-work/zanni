import { glyphs, stamp } from "../../index";
import { STATUS_SPINNER, ctxLine, fmtTokens } from "./status";

export interface ControlRow {
  readonly label: string;
  readonly value: string;
  readonly dim?: string;
}

export interface ControlMetrics {
  readonly context_tokens: number;
  readonly context_exact: boolean;
  readonly tokens_in: number;
  readonly tokens_out: number;
  readonly cache_read_tokens: number;
  readonly cache_write_tokens: number;
}

export interface ControlInput {
  readonly aria: string;
  readonly name: string;
  readonly link: string;
  readonly running: boolean;
  readonly end: "" | "failed" | "interrupted";
  readonly turns: number;
  readonly mantra: string | undefined;
  readonly route: readonly string[] | undefined;
  readonly limit: number | undefined;
  readonly metrics: ControlMetrics | undefined;
  readonly started: number | undefined;
  readonly seen: number;
}

export function statusWord(i: Pick<ControlInput, "link" | "running" | "end" | "turns">): string {
  if (i.link !== "live" && i.link !== "catching-up") return "detached " + glyphs["session.disconnected"];
  if (i.running) return STATUS_SPINNER[0] ?? glyphs["tool.running"];
  if (i.end === "failed") return "error " + glyphs["tool.error"];
  if (i.end === "interrupted") return "hup " + glyphs["session.interrupted"];
  return i.turns > 0 ? "done " + glyphs["tool.ok"] : "idle " + glyphs["session.idle"];
}

export function controlRows(i: ControlInput): ControlRow[] {
  const m = i.metrics;
  const rows: ControlRow[] = [
    { label: "aria", value: i.name, dim: i.aria },
    { label: "status", value: statusWord(i) },
  ];
  const mantra = (i.mantra ?? "").split(/\s+/).filter(Boolean).join(" ");
  if (mantra) rows.push({ label: "mantra", value: mantra });
  if (i.route && i.route.length > 0) rows.push({ label: "route", value: i.route.join(" > ") });
  const tokens = m?.context_tokens ?? 0;
  if (tokens > 0 || (i.limit && i.limit > 0)) rows.push({ label: "context", value: ctxLine(tokens, i.limit, m?.context_exact ?? false) });
  rows.push(
    { label: "tokens", value: `in ${fmtTokens(m?.tokens_in ?? 0)} · out ${fmtTokens(m?.tokens_out ?? 0)}` },
    { label: "cache", value: `read ${fmtTokens(m?.cache_read_tokens ?? 0)} · write ${fmtTokens(m?.cache_write_tokens ?? 0)}` },
    i.started === undefined ? { label: "seen", value: stamp(i.seen) } : { label: "started", value: stamp(i.started) },
  );
  return rows;
}
