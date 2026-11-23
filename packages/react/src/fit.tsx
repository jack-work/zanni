import { memo } from "react";
import { Typeset } from "./typeset";

export const FIT_ELLIPSIS = " ..";

export function firstLine(text: string): { line: string; more: boolean } {
  const rows = text.split("\n").map((r) => r.trim());
  const at = rows.findIndex((r) => r !== "");
  if (at < 0) return { line: "", more: false };
  return { line: rows[at]!.replace(/\s+/g, " "), more: rows.slice(at + 1).some((r) => r !== "") };
}

export function wholeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export const Fit = memo(function Fit({ text, lines = 1, className }: { text: string; lines?: number; className?: string }) {
  const { line, more } = lines === 1 ? firstLine(text) : { line: wholeText(text), more: false };
  return <Typeset text={line} lines={lines} more={more} tail={FIT_ELLIPSIS} className={["zr-fit", className].filter(Boolean).join(" ")} />;
});
