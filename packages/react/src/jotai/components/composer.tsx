import { Button, Composer as ZComposer, Glyph, Hints, Tray, attachGlyph, glyphs, voiceGlyph } from "../../index";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { bytes, clock } from "../../index";
import { ACCEPT, MAX_FILES, kindWord } from "../lib/attach";
import { addFilesAtom, attachingAtom, removeAttachmentAtom } from "../state/attach";
import { voiceAtom } from "../state/audio";
import { micAtom, micToggleAtom, dictationFocusAtom } from "../state/mic";
import { linkAtom, runningAtom } from "../state/aria";
import { composerAtom, composerNoteAtom, draftAtom, keyOf, sendAtom } from "../state/composer";
import { COMMAND_OFF, commandAtom, commandSourcesAtom, helpOpenAtom, loadOutfitsAtom, runCommandAtom } from "../state/command";
import { pitSnapAtom, pitViewAtom } from "../state/pit";
import { applyCandidate, suggest, type Candidate } from "../lib/command";
import { QueuePile } from "./queue-pile";
import { SignedOut } from "./signed-out";
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

function CommandHints({ line, why, shut, onPick, onShut, onOpen, tab, esc }: { line: string; why: string; shut: boolean; onPick: (item: Candidate) => void; onShut: () => void; onOpen: () => void; tab: { current: (() => void) | undefined }; esc: { current: (() => boolean) | undefined } }) {
  const sources = useAtomValue(commandSourcesAtom);
  const loadOutfits = useSetAtom(loadOutfitsAtom);
  const suggestions = useMemo(() => suggest(line, sources), [line, sources]);
  const first = suggestions.items.find((c) => !c.off);
  const closable = line !== "" && !shut && suggestions.items.length > 0;
  useEffect(() => {
    void loadOutfits();
  }, [loadOutfits]);
  useEffect(() => {
    tab.current = shut ? onOpen : first ? () => onPick(first) : undefined;
    return () => {
      tab.current = undefined;
    };
  }, [first, shut, onPick, onOpen, tab]);
  useEffect(() => {
    esc.current = () => {
      if (!closable) return false;
      onShut();
      return true;
    };
    return () => {
      esc.current = undefined;
    };
  }, [closable, onShut, esc]);
  return (
    <Hints
      chips={(shut ? [] : suggestions.items).map((c) => ({ key: c.text, label: c.label, help: c.help, off: c.off }))}
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
  const clearNote = useSetAtom(composerNoteAtom);
  const mic = useAtomValue(micAtom);
  const voiceOn = useAtomValue(voiceAtom);
  const toggleMic = useSetAtom(micToggleAtom);
  const focusTick = useAtomValue(dictationFocusAtom);
  const live = link === "live";
  const input = useRef<HTMLTextAreaElement | null>(null);
  const [cmd, setCmd] = useAtom(commandAtom(key));
  const runCommand = useSetAtom(runCommandAtom);
  const setView = useSetAtom(pitViewAtom);
  const setHelp = useSetAtom(helpOpenAtom);
  const [snap, setSnap] = useAtom(pitSnapAtom);
  const picker = useRef<HTMLInputElement | null>(null);
  const attached = useAtomValue(attachingAtom);
  const addFiles = useSetAtom(addFilesAtom);
  const removeFile = useSetAtom(removeAttachmentAtom);
  const tab = useRef<(() => void) | undefined>(undefined);
  const esc = useRef<(() => boolean) | undefined>(undefined);

  const leave = () => setCmd(COMMAND_OFF);
  const typeDraft = (next: string) => {
    if (draft === "" && next.startsWith(":")) setCmd({ on: true, line: next.slice(1), why: "", shut: false });
    else setDraft(next);
  };
  const pick = (item: Candidate) => {
    setCmd((c) => ({ ...c, line: applyCandidate(c.line, item), why: "", shut: false }));
    input.current?.focus({ preventScroll: true });
  };
  const shutChips = () => setCmd((c) => ({ ...c, shut: true }));
  const openChips = () => setCmd((c) => ({ ...c, shut: false }));
  const run = async () => {
    if (!cmd.line.trim()) {
      leave();
      return;
    }
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
      setSnap("half");
    }
  };

  useEffect(() => {
    clearNote({ key, note: "" });
  }, [clearNote, key]);

  const micNow = useNow(mic.state === "recording" ? 250 : null);
  const micLabel = mic.state === "recording" ? "Stop " + clock(micNow - mic.began) : mic.state === "transcribing" ? "Wait" : "Record";

  if (link === "signedout") return <SignedOut />;

  return (
    <>
    {snap === "closed" && <QueuePile />}
    <ZComposer
      className="fw-composer"
      value={cmd.on ? cmd.line : draft}
      onChange={cmd.on ? (line) => setCmd((c) => ({ ...c, line, why: "", shut: false })) : typeDraft}
      onSubmit={async () => {
        if (cmd.on) await run();
        else if (await send()) toBottom();
      }}
      placeholder={cmd.on ? "fork :12, new, set mantra x, ls, help" : running ? "Steer figaro" : "Message"}
      sendLabel={cmd.on ? "Run" : running ? "Steer" : "Send"}
      sendGlyph={cmd.on || !running ? glyphs.send : glyphs.steering}
      mode={cmd.on ? "command" : undefined}
      {...(cmd.on ? { prompt: ":", enterRuns: true, onEscape: () => {
            if (!esc.current?.()) leave();
          }, onTab: () => tab.current?.() } : {})}
      hints={cmd.on ? <CommandHints line={cmd.line} why={cmd.why} shut={cmd.shut} onPick={pick} onShut={shutChips} onOpen={openChips} tab={tab} esc={esc} /> : undefined}
      attach={cmd.on ? undefined : { glyph: attachGlyph, label: "Attach", title: attached.items.length >= MAX_FILES ? "At most " + MAX_FILES + " attachments." : "Attach photos or a PDF", disabled: !live || attached.items.length >= MAX_FILES, onClick: () => picker.current?.click() }}
      tray={
        cmd.on ? undefined : (
          <Tray
            items={attached.items.map((a) => ({ key: a.key, name: a.name, kind: kindWord(a.kind), size: a.bytes ? bytes(a.bytes) : "", status: a.status, error: a.error }))}
            onRemove={(item) => removeFile({ key, item })}
          />
        )
      }
      command={{ glyph: glyphs["pit.command"], label: "Command", title: "Command mode", pressed: cmd.on, onClick: () => {
          if (cmd.on) leave();
          else setCmd({ on: true, line: "", why: "", shut: false });
          input.current?.focus({ preventScroll: true });
        } }}
      sendDisabled={cmd.on ? !cmd.line.trim() : comp.sending || !live || attached.uploading}
      running={running}
      focusTick={focusTick}
      inputRef={input}
      stacked={voiceOn || (mic.state !== "idle" && mic.state !== "unsupported")}
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
    </>
  );
});
