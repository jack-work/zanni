import { useEffect, useRef } from "react";
import { settleSpeakFor, traceHeaders } from "../telemetry/trace";
import type { VocePlayer } from "./types";
import { voce } from "./voce";

export interface PlayRequest {
  readonly key: string;
}

export interface PlayerIslandProps {
  request: PlayRequest | null;
  src: (key: string) => string;
  label?: string;
  className?: string;
  done?: () => void;
}

export function PlayerIsland({ request, src, label = "Message audio", className, done }: PlayerIslandProps) {
  const slot = useRef<HTMLDivElement | null>(null);
  const player = useRef<VocePlayer | null>(null);
  const srcRef = useRef(src);
  srcRef.current = src;
  const doneRef = useRef(done);
  doneRef.current = done;

  useEffect(() => {
    if (!request) return;
    voce.unlock(window);
    player.current?.destroy();
    const made = voce.create(document, {
      audioId: "",
      src: (k: string) => srcRef.current(k),
      status: (k: string) => window.fetch(srcRef.current(k), { method: "GET", credentials: "same-origin", cache: "no-store", headers: traceHeaders({ Range: "bytes=0-0" }) }).then((r) => r.status),
      label,
      change: (state: string, event: string) => {
        settleSpeakFor(state);
        if (event === "ended" || state === "error" || state === "expired") doneRef.current?.();
      },
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
