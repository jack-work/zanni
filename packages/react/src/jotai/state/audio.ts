import { atom } from "jotai";
import { AudioSession, pingPcm, type SessionType } from "../lib/audio-session";
import { beginAction } from "../../trace";
import { sessionId, speech, voce, type PcmFormat } from "../../index";
import { bootAtom } from "./boot";
import { attendedAtom } from "./route";

const PING_FORMAT: PcmFormat = { format: "pcm", rate: 24000, bits: 16, channels: 1 };

function setPlatformSession(type: SessionType): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (!session) return;
  try {
    session.type = type;
  } catch {
    return;
  }
}

function playPing(): void {
  const player = voce.create(document, { audioId: "", src: () => "", status: () => Promise.resolve(0), label: "Ping" });
  if (!player.start(PING_FORMAT)) {
    player.destroy();
    return;
  }
  player.push(pingPcm());
  player.end("");
  setTimeout(() => player.destroy(), 2500);
}

export function createAudioSession(): AudioSession {
  const session = new AudioSession({ setType: setPlatformSession, ping: playPing });
  session.apply();
  return session;
}

export const audioSessionAtom = atom<AudioSession>(createAudioSession());

export const voiceAtom = atom(false);
export const handsFreeAtom = atom(false);

export function unlockAudio(session: AudioSession): void {
  voce.unlock(window);
  session.apply();
}

export const toggleVoiceAtom = atom(null, (get, set) => {
  const session = get(audioSessionAtom);
  unlockAudio(session);
  const next = !get(voiceAtom);
  set(voiceAtom, next);
  if (!next && get(handsFreeAtom)) {
    set(handsFreeAtom, false);
    session.setHandsFree(false);
  }
});

export const toggleHandsFreeAtom = atom(null, (get, set) => {
  const session = get(audioSessionAtom);
  unlockAudio(session);
  const next = !get(handsFreeAtom);
  set(handsFreeAtom, next);
  session.setHandsFree(next);
  if (next) set(voiceAtom, true);
});

export const speakingAtom = atom<{ aria: string; turn: number; node: number; chars: number | undefined } | null>(null);

export const cancelSpeechAtom = atom(0);

export interface VoiceControl {
  replay(turn: number): void;
}

export const voiceControlAtom = atom<VoiceControl | null>(null);

export interface InquiryPlay {
  readonly turn: number;
  readonly seq: number;
  readonly then: boolean;
}

export const inquiryPlayAtom = atom<InquiryPlay | null>(null);

export const playInquiryAtom = atom(null, (get, set, req: { turn: number; then: boolean }) => {
  set(inquiryPlayAtom, { ...req, seq: (get(inquiryPlayAtom)?.seq ?? 0) + 1 });
});

export const replayAtom = atom(null, (get, _set, turn: number) => {
  const at = get(attendedAtom);
  beginAction("speak", at ? { "figaro.aria": at.aria } : {});
  get(voiceControlAtom)?.replay(turn);
});

export const speechTransportAtom = atom((get) => speech.gateway({ url: get(bootAtom).audioUrl, session: sessionId }));
