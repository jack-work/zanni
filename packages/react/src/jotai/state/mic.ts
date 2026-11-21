import { atom } from "jotai";
import { canRecord, joinDictation, Mic, type Media, type MicSnapshot } from "../lib/mic";
import { dictate } from "../lib/stt";
import { audioSessionAtom, unlockAudio } from "./audio";
import { bootAtom } from "./boot";
import { draftAtom, keyOf } from "./composer";
import { attendedAtom } from "./route";

function browserMedia(): Media {
  return { devices: typeof navigator === "undefined" ? undefined : navigator.mediaDevices, Recorder: typeof window === "undefined" ? undefined : window.MediaRecorder };
}

export const micAtom = atom<MicSnapshot>({ state: canRecord(browserMedia()) ? "idle" : "unsupported", began: 0, note: "" });
const controller = atom<Mic | null>(null);

export const dictationFocusAtom = atom(0);

export const micToggleAtom = atom(null, (get, set) => {
  const at = get(attendedAtom);
  if (!at) return;
  const session = get(audioSessionAtom);
  unlockAudio(session);
  let mic = get(controller);
  if (!mic) {
    const stt = dictate(get(bootAtom).sttUrl);
    mic = new Mic({
      media: browserMedia(),
      now: () => Date.now(),
      transcribe: stt,
      recording: (on) => session.setRecording(on),
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (id) => window.clearTimeout(id as number),
    });
    mic.subscribe((snap) => set(micAtom, snap));
    set(controller, mic);
  }
  const key = keyOf(at.store, at.aria);
  mic.toggle(key, (text) => {
    set(draftAtom(key), (prev) => joinDictation(prev, text));
    set(dictationFocusAtom, (n) => n + 1);
  });
});

export const micCancelAtom = atom(null, (get) => {
  get(controller)?.cancel();
});
