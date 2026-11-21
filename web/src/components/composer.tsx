import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useLinger } from "../lib/motion";
import { clock } from "../lib/work";
import { micAtom, micToggleAtom, dictationFocusAtom } from "../state/mic";
import { linkAtom, runningAtom, workAtom } from "../state/aria";
import { composerAtom, composerNoteAtom, draftAtom, interruptAtom, keyOf, sendAtom } from "../state/composer";
import type { Attended } from "../state/route";

const MAX_LINES = 5;

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

function useComposerHeight(form: RefObject<HTMLFormElement | null>): void {
  useLayoutEffect(() => {
    const el = form.current;
    if (!el) return;
    const root = document.documentElement;
    const write = () => root.style.setProperty("--fw-composer-h", Math.ceil(el.getBoundingClientRect().height) + "px");
    write();
    if (typeof ResizeObserver === "undefined") return () => root.style.removeProperty("--fw-composer-h");
    const watch = new ResizeObserver(write);
    watch.observe(el);
    return () => {
      watch.disconnect();
      root.style.removeProperty("--fw-composer-h");
    };
  }, [form]);
}

function Strip({ attended, note, running, leaving }: { attended: Attended; note: string; running: boolean; leaving: boolean }) {
  const { client, aria } = attended;
  const work = useAtomValue(workAtom(client, aria));
  const interrupt = useSetAtom(interruptAtom);
  const link = useAtomValue(linkAtom);
  const seen = useRef(Date.now());
  const wasRunning = useRef(false);
  if (running && !wasRunning.current) seen.current = Date.now();
  wasRunning.current = running;
  const now = useNow(running ? 1000 : null);
  const live = link === "live";
  const text = note || work.verb;
  return (
    <div className="fw-strip" data-kind={running ? "running" : "note"} {...(leaving ? { "data-leaving": "" } : {})}>
      {running && (
        <span className="fw-glyph" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
      <span className="fw-strip-text" role="status">
        {text}
      </span>
      {running && (
        <>
          <span className="fw-strip-time" aria-hidden="true">
            {clock(now - (work.startedAt ?? seen.current))}
          </span>
          <button type="button" className="fw-stop" disabled={!live} onClick={() => void interrupt("keep")}>
            Stop
          </button>
          <button type="button" className="fw-stop fw-stop-clear" aria-label="Stop and clear the queue" disabled={!live} onClick={() => void interrupt("clear")}>
            Stop all
          </button>
        </>
      )}
    </div>
  );
}

export function Composer({ attended, toBottom }: { attended: Attended; toBottom: () => void }) {
  const { client, aria, store } = attended;
  const key = keyOf(store, aria);
  const [draft, setDraft] = useAtom(draftAtom(key));
  const comp = useAtomValue(composerAtom(key));
  const running = useAtomValue(runningAtom(client, aria));
  const link = useAtomValue(linkAtom);
  const send = useSetAtom(sendAtom);
  const clearNote = useSetAtom(composerNoteAtom);
  const mic = useAtomValue(micAtom);
  const toggleMic = useSetAtom(micToggleAtom);
  const focusTick = useAtomValue(dictationFocusAtom);
  const form = useRef<HTMLFormElement | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const coarse = useMemo(() => typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches, []);
  const live = link === "live";
  useComposerHeight(form);

  useEffect(() => {
    clearNote({ key, note: "" });
  }, [clearNote, key]);

  useLayoutEffect(() => {
    const el = input.current;
    if (!el || (window.CSS?.supports && window.CSS.supports("field-sizing", "content"))) return;
    el.rows = Math.max(1, Math.min(MAX_LINES, draft.split("\n").length));
  }, [draft]);

  const submit = async () => {
    if (await send()) toBottom();
  };

  const onKey = (ev: KeyboardEvent<HTMLTextAreaElement>) => {
    if (ev.key !== "Enter" || ev.shiftKey || ev.nativeEvent.isComposing || coarse) return;
    ev.preventDefault();
    void submit();
  };

  useEffect(() => {
    if (focusTick) input.current?.focus({ preventScroll: true });
  }, [focusTick]);

  const micNow = useNow(mic.state === "recording" ? 250 : null);
  const micLabel = mic.state === "recording" ? "Stop " + clock(micNow - mic.began) : mic.state === "transcribing" ? "Wait" : "Record";
  const note = comp.note || mic.note;
  const showStrip = running || !!note;
  const strip = useLinger(showStrip);
  const frozen = useRef({ note, running });
  if (showStrip) frozen.current = { note, running };
  const label = running ? "Steer" : "Send";
  const labelled = useRef({ label, swapped: false });
  if (labelled.current.label !== label) labelled.current = { label, swapped: true };
  return (
    <form
      className="fw-composer"
      ref={form}
      aria-label="Message"
      data-running={running ? "" : undefined}
      onSubmit={(ev) => {
        ev.preventDefault();
        void submit();
      }}
    >
      {strip.mounted && <Strip attended={attended} note={frozen.current.note} running={frozen.current.running} leaving={strip.leaving} />}
      <div className="fw-compose-row">
        <textarea
          ref={input}
          className="fw-input"
          rows={1}
          value={draft}
          placeholder={running ? "Steer figaro" : "Message"}
          aria-label="Message"
          onChange={(ev) => setDraft(ev.target.value)}
          onKeyDown={onKey}
        />
        <button
          type="button"
          className="fw-mic"
          aria-pressed={mic.state === "recording"}
          disabled={mic.state === "unsupported" || mic.state === "asking" || mic.state === "transcribing"}
          title={mic.state === "unsupported" ? "This browser cannot record audio." : undefined}
          onClick={() => toggleMic()}
        >
          {micLabel}
        </button>
        <button type="submit" className="fw-send" disabled={comp.sending || !live}>
          <span className={labelled.current.swapped ? "fw-swap" : undefined} key={label}>
            {label}
          </span>
        </button>
      </div>
    </form>
  );
}
