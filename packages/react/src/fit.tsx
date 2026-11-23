import { memo } from "react";
import { Typeset } from "./typeset";

export const FIT_ELLIPSIS = " ..";

export function firstLine(text: string): { line: string; more: boolean } {
  const rows = text.split("\n").map((r) => r.trim());
  const at = rows.findIndex((r) => r !== "");
  if (at < 0) return { line: "", more: false };
  return { line: rows[at]!.replace(/\s+/g, " "), more: rows.slice(at + 1).some((r) => r !== "") };
}

export const Fit = memo(function Fit({ text, className }: { text: string; className?: string }) {
  const { line, more } = firstLine(text);
  return <Typeset text={line} lines={1} more={more} tail={FIT_ELLIPSIS} className={["zr-fit", className].filter(Boolean).join(" ")} />;
});
