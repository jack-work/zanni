import { useRef } from "react";
import { Button } from "./button";

export const LATEST_TAP_SLOP = 10;

export function LatestPill({ onClick, label = "Latest" }: { onClick: () => void; label?: string }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <Button
      variant="accent"
      className="zr-latest"
      onTouchStart={(ev) => {
        const t = ev.touches[0];
        start.current = ev.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchEnd={(ev) => {
        const s = start.current;
        const t = ev.changedTouches[0];
        start.current = null;
        if (!s || !t || ev.touches.length || Math.hypot(t.clientX - s.x, t.clientY - s.y) > LATEST_TAP_SLOP) return;
        if (ev.cancelable) ev.preventDefault();
        onClick();
      }}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
