import { Button, Composer as ZComposer, Glyph, Hints, PitGrip, Tray, attachGlyph, glyphs, usePit, voiceGlyph } from "../../index";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { clock } from "../../index";
import { ACCEPT, MAX_FILES, kindWord, sizeLabel } from "../lib/attach";
import { addFilesAtom, attachingAtom, removeAttachmentAtom } from "../state/attach";
import { micAtom, micToggleAtom, dictationFocusAtom } from "../state/mic";
import { linkAtom, runningAtom, workAtom } from "../state/aria";
import { composerAtom, composerNoteAtom, draftAtom, interruptAtom, keyOf, sendAtom } from "../state/composer";
import { COMMAND_OFF, commandAtom, commandSourcesAtom, helpOpenAtom, loadOutfitsAtom, runCommandAtom } from "../state/command";
import { pitViewAtom } from "../state/pit";
import { applyCandidate, suggest, type Candidate } from "../lib/command";
import { CommandHelp } from "./command-help";
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

function Elapsed({ since }: { since: number }) {
  const now = useNow(1000);
  return <>{clock(now - since)}</>;
}

function useWorkLine(attended: Attended, note: string, running: boolean) {
  const { client, aria } = attended;
  const work = useAtomValue(workAtom(client, aria));
  const seen = useRef(Date.now());
  const wasRunning = useRef(false);
  if (running && !wasRunning.current) seen.current = Date.now();
  wasRunning.current = running;
  return { text: note || work.verb, time: running ? <Elapsed since={work.startedAt ?? seen.current} /> : undefined };
}

function CommandHints({ line, why, onPick, tab }: { line: string; why: string; onPick: (item: Candidate) => void; tab: { current: (() => void) | undefined } }) {
  const sources = useAtomValue(commandSourcesAtom);
  const loadOutfits = useSetAtom(loadOutfitsAtom);
  const suggestions = useMemo(() => suggest(line, sources), [line, sources]);
  const first = suggestions.items.find((c) => !c.off);
  useEffect(() => {
    void loadOutfits();
  }, [loadOutfits]);
  useEffect(() => {
    tab.current = first ? () => onPick(first) : undefined;
    return () => {
      tab.current = undefined;
    };
  }, [first, onPick, tab]);
  return (
    <Hints
      chips={suggestions.items.map((c) => ({ key: c.text, label: c.label, help: c.help, off: c.off }))}
      onPick={(key) => {
        const item = suggestions.items.find((c) => c.text === key);
        if (item) onPick(item);
      }}
      {...(why ? { refusal: why } : suggestions.hint?.refusal ? { refusal: suggestions.hint.refusal } : suggestions.hint ? { usage: suggestions.hint.usage, help: suggestions.hint.help } : {})}
    />
  );
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
  const [cmd, setCmd] = useAtom(commandAtom(key));
  const runCommand = useSetAtom(runCommandAtom);
  const setView = useSetAtom(pitViewAtom);
  const setHelp = useSetAtom(helpOpenAtom);
  const pit = usePit();
  const picker = useRef<HTMLInputElement | null>(null);
  const attached = useAtomValue(attachingAtom);
  const addFiles = useSetAtom(addFilesAtom);
  const removeFile = useSetAtom(removeAttachmentAtom);
  const tab = useRef<(() => void) | undefined>(undefined);

  const leave = () => setCmd(COMMAND_OFF);
  const typeDraft = (next: string) => {
    if (draft === "" && next.startsWith(":")) setCmd({ on: true, line: next.slice(1), why: "" });
    else setDraft(next);
  };
  const pick = (item: Candidate) => {
    setCmd((c) => ({ ...c, line: applyCandidate(c.line, item), why: "" }));
    input.current?.focus({ preventScroll: true });
  };
  const run = async () => {
    const outcome = await runCommand(cmd.line);
    if (!outcome.ok) {
      setCmd((c) => ({ ...c, why: outcome.why }));
      return;
    }
    leave();
    if (outcome.done) clearNote({ key, note: outcome.done });
    if (outcome.open === "help") setHelp(true);
    else if (outcome.open) {
      setView(outcome.open);
      pit?.setSnap("half");
    }
  };

  useEffect(() => {
    clearNote({ key, note: "" });
  }, [clearNote, key]);

  const micNow = useNow(mic.state === "recording" ? 250 : null);
  const micLabel = mic.state === "recording" ? "Stop " + clock(micNow - mic.began) : mic.state === "transcribing" ? "Wait" : "Record";
  const note = comp.note || mic.note;
  const showStrip = running || !!note;
  const line = useWorkLine(attended, note, running);

  return (
    <>
    <ZComposer
      className="fw-composer"
      value={cmd.on ? cmd.line : draft}
      onChange={cmd.on ? (line) => setCmd((c) => ({ ...c, line, why: "" })) : typeDraft}
      onSubmit={async () => {
        if (cmd.on) await run();
        else if (await send()) toBottom();
      }}
      placeholder={cmd.on ? "fork 12, new, set mantra x, ls, help" : running ? "Steer figaro" : "Message"}
      sendLabel={cmd.on ? "Run" : running ? "Steer" : "Send"}
      sendGlyph={cmd.on || !running ? glyphs.send : glyphs.steering}
      mode={cmd.on ? "command" : undefined}
      {...(cmd.on ? { prompt: ":", enterRuns: true, onEscape: leave, onTab: () => tab.current?.() } : {})}
      hints={cmd.on ? <CommandHints line={cmd.line} why={cmd.why} onPick={pick} tab={tab} /> : undefined}
      attach={cmd.on ? undefined : { glyph: attachGlyph, label: "Attach", title: attached.items.length >= MAX_FILES ? "At most " + MAX_FILES + " attachments." : "Attach photos or a PDF", disabled: !live || attached.items.length >= MAX_FILES, onClick: () => picker.current?.click() }}
      tray={
        cmd.on ? undefined : (
          <Tray
            items={attached.items.map((a) => ({ key: a.key, name: a.name, kind: kindWord(a.kind), size: a.bytes ? sizeLabel(a.bytes) : "", status: a.status, error: a.error }))}
            onRemove={(item) => removeFile({ key, item })}
          />
        )
      }
      command={{ glyph: glyphs["pit.command"], label: "Command", title: "Command mode", pressed: cmd.on, onClick: () => {
          if (cmd.on) leave();
          else setCmd({ on: true, line: "", why: "" });
          input.current?.focus({ preventScroll: true });
        } }}
      sendDisabled={cmd.on ? !cmd.line.trim() : comp.sending || !live || attached.uploading}
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
        cmd.on ? undefined : (
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
          {voiceGlyph && <Glyph glyph={voiceGlyph} className="fw-mic-glyph" />}
          <span className="fw-mic-label">{micLabel}</span>
          {mic.state === "recording" && <span className="fw-mic-meter" aria-hidden="true" />}
        </Button>
        )
      }
    />
    <input
      ref={picker}
      type="file"
      className="fw-picker"
      accept={ACCEPT}
      multiple
      hidden
      tabIndex={-1}
      aria-label="Attachment files"
      onChange={(ev) => {
        addFiles(Array.from(ev.target.files ?? []));
        ev.target.value = "";
        input.current?.focus({ preventScroll: true });
      }}
    />
    <CommandHelp />
    </>
  );
});
