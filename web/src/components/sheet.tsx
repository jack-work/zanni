import { Button, Sheet as ZSheet } from "zanni-react";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { joinDictation } from "../lib/mic";
import { clipKey, sheetActions, type SheetContext, type SheetTarget } from "../lib/sheet";
import { retranscribe } from "../lib/stt";
import { voce, type VocePlayer } from "zanni-react";
import { replayAtom } from "../state/audio";
import { bootAtom } from "../state/boot";
import { draftAtom, keyOf } from "../state/composer";
import { closeSheetAtom, sheetAtom } from "../state/sheet";
import { Plain } from "zanni-react";

const SPOKEN = { input: "Your message", prose: "Reply" } as const;

export function Sheet() {
  const target = useAtomValue(sheetAtom);
  const close = useSetAtom(closeSheetAtom);
  const last = useRef<SheetTarget | null>(null);
  if (target) last.current = target;
  const shown = target ?? last.current;
  return (
    <ZSheet
      open={!!target}
      onClose={() => close()}
      className="fw-sheet"
      label="Message actions"
      title={shown ? SPOKEN[shown.kind] + " · Turn " + shown.turn : ""}
      data={{ "data-kind": shown?.kind }}
    >
      {shown ? <SheetBody key={shown.kind + shown.turn} target={shown} /> : null}
    </ZSheet>
  );
}

function SheetBody({ target }: { target: SheetTarget }) {
  const close = useSetAtom(closeSheetAtom);
  const playInPlace = useSetAtom(replayAtom);
  const setDraft = useSetAtom(draftAtom(keyOf(target.store, target.aria)));
  const { audioUrl, sttUrl } = useAtomValue(bootAtom);
  const [note, setNote] = useState("");
  const [result, setResult] = useState("");
  const slot = useRef<HTMLDivElement | null>(null);
  const player = useRef<VocePlayer | null>(null);
  useEffect(
    () => () => {
      player.current?.destroy();
      player.current = null;
    },
    [],
  );

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
      <div className="fw-sheet-actions">
        {sheetActions[target.kind].map((a, i) => (
          <Button key={a.id} variant="outline" className="fw-sheet-act" data-action={a.id} data-autofocus={i === 0 ? "" : undefined} onClick={() => void a.run(context)}>
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
    </>
  );
}
