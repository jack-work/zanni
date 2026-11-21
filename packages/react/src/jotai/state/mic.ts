import { atom } from "jotai";
import { sessionUrl, voce } from "../../index";
import { beginAction, type Action } from "../../trace";
import { captureFrames, browserMedia } from "../lib/capture";
import type { Dictation, SocketLike } from "../lib/dictation";
import { canRecord, joinDictation, type MicSnapshot } from "../lib/mic";
import { audioSessionAtom, unlockAudio } from "./audio";
import { bootAtom } from "./boot";
import { dictatedAtom, draftAtom, keyOf } from "./composer";
import { attendedAtom } from "./route";

export const MIC_LEVEL_VAR = "--fw-mic-level";

export const micAtom = atom<MicSnapshot>({ state: canRecord(browserMedia()) ? "idle" : "unsupported", began: 0, note: "" });
const controller = atom<Dictation | null>(null);
let dictation: Action | null = null;

export const dictationFocusAtom = atom(0);

function writeLevel(value: number): void {
  const root = document.documentElement.style;
  if (value > 0) root.setProperty(MIC_LEVEL_VAR, value.toFixed(2));
  else root.removeProperty(MIC_LEVEL_VAR);
}

export const micToggleAtom = atom(null, async (get, set) => {
  const at = get(attendedAtom);
  if (!at) return;
  const session = get(audioSessionAtom);
  unlockAudio(session);
  let mic = get(controller);
  if (!mic) {
    const stt = get(bootAtom).sttUrl;
    const { Dictation, dictationSocketUrl } = await import("../lib/dictation");
    mic = get(controller) ?? new Dictation({
      media: browserMedia(),
      now: () => Date.now(),
      open: (target) => new WebSocket(sessionUrl(dictationSocketUrl(stt, target, navigator.language || "en-US")).href) as unknown as SocketLike,
      capture: captureFrames,
      recording: (on) => {
        session.setRecording(on);
        voce.record(window, on);
      },
      level: writeLevel,
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (id) => window.clearTimeout(id as number),
    });
    if (get(controller) !== mic) {
      mic.subscribe((snap) => {
        set(micAtom, snap);
        if (snap.state === "idle" && dictation) {
          dictation.end();
          dictation = null;
        }
      });
      set(controller, mic);
    }
  }
  const key = keyOf(at.store, at.aria);
  const base = get(draftAtom(key));
  if (get(micAtom).state === "idle") dictation = beginAction("dictate", { "figaro.aria": at.aria });
  mic.toggle(key, (text, final, audioId) => {
    const joined = joinDictation(base, text);
    set(draftAtom(key), joined);
    if (final && audioId) set(dictatedAtom(key), { id: audioId, text: joined });
    set(dictationFocusAtom, (n) => n + 1);
  });
});

export const micCancelAtom = atom(null, (get) => {
  get(controller)?.cancel();
});
