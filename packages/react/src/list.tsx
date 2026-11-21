import type { ReactNode } from "react";

export interface ListRowProps {
  href: string;
  title: ReactNode;
  meta?: ReactNode;
  depth?: number;
  state?: string;
  current?: boolean;
  id?: string;
}

export function ListRow({ href, title, meta, depth = 0, state = "", current, id }: ListRowProps) {
  return (
    <li className="zr-row">
      <a className="zr-thread" href={href} data-id={id} data-state={state} data-depth={Math.max(0, Math.min(6, depth))} {...(current ? { "aria-current": "page" as const } : {})}>
        <span className="zr-thread-title">{title}</span>
        {meta !== undefined && <span className="zr-thread-when">{meta}</span>}
      </a>
    </li>
  );
}

export function List({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <ul className="zr-list" aria-label={label}>
      {children}
    </ul>
  );
}
