import { useState } from "react";
import type { ReactNode } from "react";
import figaroHeadUrl from "../../../assets/parla/figaro-head.png?inline";
import notHere from "../../../assets/parla/not-here.json";

export const notHereLines: readonly string[] = notHere;
export const figaroHead: string = figaroHeadUrl;

export interface FigaroSaysProps {
  children?: ReactNode;
  lines?: readonly string[];
  start?: number;
  head?: string;
  live?: boolean;
  className?: string;
}

export function FigaroSays({ children, lines, start, head = figaroHead, live = false, className }: FigaroSaysProps) {
  const cls = ["parla", className].filter(Boolean).join(" ");
  const many = lines !== undefined && lines.length > 0;
  const [at, setAt] = useState(() => (many ? (start ?? Math.floor(Math.random() * lines.length)) % lines.length : 0));
  const said = many ? lines[at % lines.length] : children;
  const key = typeof said === "string" ? said : undefined;
  return (
    <div className={cls}>
      <img className="parla-head" src={head} alt="Figaro" draggable={false} />
      {many ? (
        <button type="button" className="parla-bubble parla-next" aria-live="polite" key={key} onClick={() => setAt((i) => (i + 1) % lines.length)}>
          {said}
        </button>
      ) : (
        <p className="parla-bubble" aria-live={live ? "polite" : undefined} key={key}>
          {said}
        </p>
      )}
    </div>
  );
}

