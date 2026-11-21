import { useEffect, useRef } from "react";
import { settleSpeakFor, traceHeaders } from "./trace";
import { voce, type VocePlayer } from "./zanni";

export interface PlayRequest {
  readonly key: string;
}

export interface PlayerIslandProps {
  request: PlayRequest | null;
  src: (key: string) => string;
  label?: string;
  className?: string;
}

export function PlayerIsland({ request, src, label = "Message audio", className }: PlayerIslandProps) {
  const slot = useRef<HTMLDivElement | null>(null);
  const player = useRef<VocePlayer | null>(null);
  const srcRef = useRef(src);
  srcRef.current = src;

  useEffect(() => {
    if (!request) return;
    voce.unlock(window);
    player.current?.destroy();
    const made = voce.create(document, {
      audioId: "",
      src: (k: string) => srcRef.current(k),
      status: (k: string) => window.fetch(srcRef.current(k), { method: "GET", credentials: "same-origin", cache: "no-store", headers: traceHeaders({ Range: "bytes=0-0" }) }).then((r) => r.status),
      label,
      change: settleSpeakFor,
    });
    slot.current?.replaceChildren(made.el);
    made.end(request.key);
    made.play();
    player.current = made;
  }, [request, label]);

  useEffect(
    () => () => {
      player.current?.destroy();
      player.current = null;
    },
    [],
  );

  return <div className={["zr-player", className].filter(Boolean).join(" ")} ref={slot} />;
}
