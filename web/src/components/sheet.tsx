import { Button } from "zanni-react";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { joinDictation } from "../lib/mic";
import { useLinger } from "../lib/motion";
import { clipKey, sheetActions, type SheetContext, type SheetTarget } from "../lib/sheet";
import { retranscribe } from "../lib/stt";
import { voce, type VocePlayer } from "../lib/zanni";
import { replayAtom } from "../state/audio";
import { bootAtom } from "../state/boot";
import { draftAtom, keyOf } from "../state/composer";
import { closeSheetAtom, sheetAtom } from "../state/sheet";
import { Plain } from "./text";

const SPOKEN = { input: "Your message", prose: "Reply" } as const;

export function Sheet() {
  const target = useAtomValue(sheetAtom);
  const last = useRef<SheetTarget | null>(null);
  if (target) last.current = target;
  const { mounted, leaving } = useLinger(!!target);
  const shown = target ?? last.current;
  return mounted && shown ? <SheetBody key={shown.kind + shown.turn} target={shown} leaving={leaving} /> : null;
}

function SheetBody({ target, leaving }: { target: SheetTarget; leaving: boolean }) {
  const close = useSetAtom(closeSheetAtom);
  const playInPlace = useSetAtom(replayAtom);
  const setDraft = useSetAtom(draftAtom(keyOf(target.store, target.aria)));
  const { audioUrl, sttUrl } = useAtomValue(bootAtom);
  const [note, setNote] = useState("");
  const [result, setResult] = useState("");
  const slot = useRef<HTMLDivElement | null>(null);
  const player = useRef<VocePlayer | null>(null);
  const first = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    first.current?.focus();
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      player.current?.destroy();
      player.current = null;
      before?.focus?.({ preventScroll: true });
    };
  }, [close]);

  const src = useCallback((key: string) => audioUrl.replace(/\/$/, "") + "/key/" + key.split("/").map(encodeURIComponent).join("/"), [audioUrl]);

  const context: SheetContext = {
    target,
    clipKey: (direction) => clipKey(target, direction),
    play: (key) => {
      voce.unlock(window);
      player.current?.destroy();
      const made = voce.create(document, {
        audioId: "",
        src,
        status: (k) => window.fetch(src(k), { method: "GET", credentials: "same-origin", cache: "no-store", headers: { Range: "bytes=0-0" } }).then((r) => r.status),
        label: "Message audio",
      });
      slot.current?.replaceChildren(made.el);
      made.end(key);
      made.play();
      player.current = made;
    },
    playTurn: (turn) => {
      playInPlace(turn);
      close();
    },
    say: setNote,
    show: setResult,
    transcribe: (key) => retranscribe(sttUrl, key),
  };

  const adopt = () => {
    setDraft((prev) => joinDictation(prev, result));
    close();
  };

  return (
    <>
      <div className="fw-scrim" onClick={() => close()} {...(leaving ? { "data-leaving": "" } : {})} />
      <div className="fw-sheet" role="dialog" aria-modal="true" aria-label="Message actions" data-kind={target.kind} {...(leaving ? { "data-leaving": "" } : {})}>
        <div className="fw-sheet-head">
          <span className="fw-sheet-title">
            {SPOKEN[target.kind]} · Turn {target.turn}
          </span>
          <Button variant="quiet" size="compact" className="fw-sheet-close" onClick={() => close()}>
            Close
          </Button>
        </div>
        <div className="fw-sheet-actions">
          {sheetActions[target.kind].map((a, i) => (
            <Button key={a.id} variant="outline" className="fw-sheet-act" data-action={a.id} ref={i === 0 ? first : undefined} onClick={() => void a.run(context)}>
              {a.label}
            </Button>
          ))}
        </div>
        <div className="fw-sheet-player" ref={slot} />
        {note && (
          <p className="fw-sheet-note" role="status">
            {note}
          </p>
        )}
        {result && (
          <div className="fw-sheet-result">
            <p className="fw-sheet-text">
              <Plain text={result} />
            </p>
            <Button variant="outline" className="fw-sheet-act" data-action="use" onClick={adopt}>
              Use text
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
