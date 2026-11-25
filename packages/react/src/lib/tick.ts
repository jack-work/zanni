import { useEffect, useState } from "react";

export function useTick(period: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (period === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), period);
    return () => clearInterval(id);
  }, [period]);
  return now;
}
