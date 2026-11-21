import { Button, Composer as ZComposer, PitGrip, attachGlyph, glyphs, voiceGlyph } from "../../index";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { memo, useEffect, useRef, useState } from "react";
import { clock } from "../../index";
import { micAtom, micToggleAtom, dictationFocusAtom } from "../state/mic";
import { linkAtom, runningAtom, workAtom } from "../state/aria";
import { composerAtom, composerNoteAtom, draftAtom, interruptAtom, keyOf, sendAtom } from "../state/composer";
import type { Attended } from "../state/route";

function useNow(period: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (period === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), period);
    return () => clearInterval(id);
  }, [period]);
  return now;
}

function useWorkLine(attended: Attended, note: string, running: boolean) {
  const { client, aria } = attended;
  const work = useAtomValue(workAtom(client, aria));
  const seen = useRef(Date.now());
  const wasRunning = useRef(false);
  if (running && !wasRunning.current) seen.current = Date.now();
  wasRunning.current = running;
  const now = useNow(running ? 1000 : null);
  return { text: note || work.verb, time: running ? clock(now - (work.startedAt ?? seen.current)) : undefined };
}

export const Composer = memo(function Composer({ attended, toBottom }: { attended: Attended; toBottom: () => void }) {
  const { client, aria, store } = attended;
  const key = keyOf(store, aria);
  const [draft, setDraft] = useAtom(draftAtom(key));
  const comp = useAtomValue(composerAtom(key));
  const running = useAtomValue(runningAtom(client, aria));
  const link = useAtomValue(linkAtom);
  const send = useSetAtom(sendAtom);
  const interrupt = useSetAtom(interruptAtom);
  const clearNote = useSetAtom(composerNoteAtom);
  const mic = useAtomValue(micAtom);
  const toggleMic = useSetAtom(micToggleAtom);
  const focusTick = useAtomValue(dictationFocusAtom);
  const live = link === "live";
  const input = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    clearNote({ key, note: "" });
  }, [clearNote, key]);

  const micNow = useNow(mic.state === "recording" ? 250 : null);
  const micLabel = mic.state === "recording" ? "Stop " + clock(micNow - mic.began) : mic.state === "transcribing" ? "Wait" : "Record";
  const note = comp.note || mic.note;
  const showStrip = running || !!note;
  const line = useWorkLine(attended, note, running);

  return (
    <ZComposer
      className="fw-composer"
      value={draft}
      onChange={setDraft}
      onSubmit={async () => {
        if (await send()) toBottom();
      }}
      placeholder={running ? "Steer figaro" : "Message"}
      sendLabel={running ? "Steer" : "Send"}
      sendGlyph={running ? glyphs.steering : glyphs.send}
      attach={{ glyph: attachGlyph, label: "Attach", title: "Attachments are not available yet.", disabled: true }}
      command={{ glyph: glyphs["pit.command"], label: "Command", title: "Commands are not available yet.", disabled: true }}
      sendDisabled={comp.sending || !live}
      running={running}
      focusTick={focusTick}
      inputRef={input}
      grip={<PitGrip />}
      strip={showStrip ? { kind: running ? "running" : "note", text: line.text, time: line.time } : null}
      stripActions={
        <>
          <Button variant="quiet" size="compact" className="fw-stop" disabled={!live} onClick={() => void interrupt("keep")}>
            Stop
          </Button>
          <Button variant="quiet" size="compact" className="fw-stop fw-stop-clear" aria-label="Stop and clear the queue" disabled={!live} onClick={() => void interrupt("clear")}>
            Stop all
          </Button>
        </>
      }
      accessory={
        <Button
          variant="outline"
          className="fw-mic"
          aria-pressed={mic.state === "recording"}
          aria-label={micLabel}
          disabled={mic.state === "unsupported" || mic.state === "asking" || mic.state === "transcribing"}
          title={mic.state === "unsupported" ? "This browser cannot record audio." : undefined}
          onClick={() => {
            if (mic.state === "recording") input.current?.focus({ preventScroll: true });
            toggleMic();
          }}
        >
          {voiceGlyph && (
            <span className="fw-mic-glyph" aria-hidden="true">
              {voiceGlyph}
            </span>
          )}
          <span className="fw-mic-label">{micLabel}</span>
          {mic.state === "recording" && <span className="fw-mic-meter" aria-hidden="true" />}
        </Button>
      }
    />
  );
});
