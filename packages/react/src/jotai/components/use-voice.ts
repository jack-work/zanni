import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import type { Played, VoiceHub } from "../lib/voice-hub";
import { audioKeyUrl, traceHeaders, voce, withSession } from "../../index";
import { audioSessionAtom, cancelSpeechAtom, speakingAtom, speechTransportAtom, voiceAtom, voiceControlAtom } from "../state/audio";
import { bootAtom } from "../state/boot";
import { composerNoteAtom, keyOf } from "../state/composer";
import type { Attended } from "../state/route";

const slotQuery = (turn: number, node: number) => document.querySelector<HTMLElement>('[data-voice-slot="' + turn + ":" + node + '"]');
const firstSlot = (turn: number) => document.querySelector<HTMLElement>('.nodi-turn[data-turn="' + turn + '"] [data-voice-slot]');
const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const NOTE_MS = 4000;
const HEARD_KEY = "fw.heard";
const HEARD_KEEP = 40;

class Heard extends Map<string, Played> {
  private ready = false;

  constructor() {
    super();
    try {
      const raw = window.sessionStorage.getItem(HEARD_KEY);
      for (const [k, v] of raw ? (JSON.parse(raw) as [string, Played][]) : []) super.set(k, { ...v, epoch: 0 });
    } catch {
      this.clear();
    }
    this.ready = true;
  }

  private save(): void {
    if (!this.ready) return;
    try {
      window.sessionStorage.setItem(HEARD_KEY, JSON.stringify([...this].slice(-HEARD_KEEP)));
    } catch {
      return;
    }
  }

  override set(key: string, value: Played): this {
    super.set(key, value);
    this.save();
    return this;
  }

  override delete(key: string): boolean {
    const had = super.delete(key);
    this.save();
    return had;
  }
}

const played = new Heard();

export function useVoice({ aria, store }: Attended): void {
  const transport = useAtomValue(speechTransportAtom);
  const session = useAtomValue(audioSessionAtom);
  const voiceOn = useAtomValue(voiceAtom);
  const cancelTick = useAtomValue(cancelSpeechAtom);
  const audioUrl = useAtomValue(bootAtom).audioUrl;
  const setSpeaking = useSetAtom(speakingAtom);
  const setControl = useSetAtom(voiceControlAtom);
  const setNote = useSetAtom(composerNoteAtom);
  const hub = useRef<VoiceHub | null>(null);
  const voice = useRef(voiceOn);
  voice.current = voiceOn;

  useEffect(() => {
    let alive = true;
    const src = (key: string) => withSession(audioKeyUrl(audioUrl, key));
    void import("../lib/voice-hub").then(({ VoiceHub }) => {
      if (!alive) return;
      const made = new VoiceHub(
        {
          doc: document,
          voce,
          session,
          played,
          audioSrc: src,
          audioStatus: (key) => window.fetch(src(key), { method: "GET", credentials: "same-origin", cache: "no-store", headers: traceHeaders({ Range: "bytes=0-0" }) }).then((r) => r.status),
          speaking: (s) => setSpeaking(s ? { aria, ...s } : null),
          slot: slotQuery,
          firstSlot,
          wait: pause,
          note: (text) => {
            const key = keyOf(store, aria);
            setNote({ key, note: text });
            setTimeout(() => setNote({ key, note: "" }), NOTE_MS);
          },
        },
        aria,
        store,
        transport,
      );
      hub.current = made;
      made.voice(voice.current);
      setControl({ replay: (turn) => made.replay(turn) });
    });
    return () => {
      alive = false;
      hub.current?.close();
      hub.current = null;
      setControl(null);
      setSpeaking(null);
    };
  }, [aria, store, transport, session, audioUrl, setSpeaking, setControl, setNote]);

  useEffect(() => {
    hub.current?.voice(voiceOn);
  }, [voiceOn]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    hub.current?.cancel();
  }, [cancelTick]);
}
