import { Button } from "./button";
import { usePit } from "./pit";

export function LatestPill({ onClick, label = "Latest" }: { onClick: () => void; label?: string }) {
  const pit = usePit();
  if (pit && (pit.snap !== "closed" || pit.dragging)) return null;
  return (
    <Button variant="accent" className="zr-latest" onClick={onClick}>
      {label}
    </Button>
  );
}
