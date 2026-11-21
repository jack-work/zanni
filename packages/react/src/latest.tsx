import { Button } from "./button";

export function LatestPill({ onClick, label = "Latest" }: { onClick: () => void; label?: string }) {
  return (
    <Button variant="accent" className="zr-latest" onClick={onClick}>
      {label}
    </Button>
  );
}
