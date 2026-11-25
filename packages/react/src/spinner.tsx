import { useEffect, useState } from "react";
import { glyphs } from "./glyphs";
import { reducedMotion } from "./lib/media";

const SPIN_MS = 80;
const FRAMES = [...glyphs["tool.running"]];

export function Spinner() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (reducedMotion()) return;
    const id = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), SPIN_MS);
    return () => clearInterval(id);
  }, []);
  return <>{FRAMES[frame]}</>;
}
