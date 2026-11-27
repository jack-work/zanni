import type { Standing } from "./derive";
import type { Link } from "zanni-react/jotai/state/link";

export function standingText(standing: Standing, link: Link): string {
  if (standing === "current") return "";
  if (standing === "resyncing") return "Resyncing: showing the last known state.";
  if (link === "closed") return "Connection closed: showing the last known state. Reload to reconnect.";
  if (link === "live") return "Out of date: showing the last known state.";
  return "Offline: showing the last known state, retrying.";
}

export function StandingNote({ standing, link }: { standing: Standing; link: Link }) {
  const text = standingText(standing, link);
  if (!text) return null;
  return (
    <p className="ord-standing" role="status" data-field="standing" data-standing={standing}>
      {text}
    </p>
  );
}
