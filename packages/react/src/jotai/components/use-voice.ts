import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import type { VoiceHub } from "../lib/voice-hub";
import { audioKeyUrl, traceHeaders, voce, withSession } from "../../index";
import { audioSessionAtom, cancelSpeechAtom, speakingAtom, speechTransportAtom, voiceAtom, voiceControlAtom } from "../state/audio";
import { bootAtom } from "../state/boot";
import { composerNoteAtom, keyOf } from "../state/composer";
import type { Attended } from "../state/route";

const slotQuery = (turn: number, node: number) => document.querySelector<HTMLElement>('[data-voice-slot="' + turn + ":" + node + '"]');
const firstSlot = (turn: number) => document.querySelector<HTMLElement>('.nodi-turn[data-turn="' + turn + '"] [data-voice-slot]');
const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const NOTE_MS = 4000;

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
