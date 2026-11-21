import { glyphs } from "./glyphs";
import { Plain } from "./text";

export interface TrayItem {
  readonly key: string;
  readonly name: string;
  readonly kind: string;
  readonly size: string;
  readonly status: "uploading" | "ready" | "failed";
  readonly error?: string;
}

export interface TrayProps {
  items: readonly TrayItem[];
  onRemove: (key: string) => void;
  label?: string;
}

const MARK = { uploading: glyphs.busy, ready: glyphs["tool.ok"], failed: glyphs["tool.error"] } as const;

export function Tray({ items, onRemove, label = "Attachments" }: TrayProps) {
  if (!items.length) return null;
  return (
    <ul className="zr-tray" aria-label={label}>
      {items.map((it) => (
        <li key={it.key} className="zr-tray-item" data-status={it.status} title={it.error || it.name}>
          <span className="zr-tray-mark" aria-hidden="true">
            {MARK[it.status]}
          </span>
          <span className="zr-tray-name">
            <Plain text={it.name} />
          </span>
          <span className="zr-tray-meta">{it.status === "failed" ? <Plain text={it.error ?? ""} /> : [it.kind, it.size].filter(Boolean).join(" ")}</span>
          <button type="button" className="zr-tray-x" aria-label={"Remove " + it.name} onMouseDown={(ev) => ev.preventDefault()} onClick={() => onRemove(it.key)}>
            <span aria-hidden="true">{glyphs.dead}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
