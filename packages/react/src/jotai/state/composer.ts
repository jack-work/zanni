import { atom, type PrimitiveAtom } from "jotai";
import { audioSessionAtom, cancelSpeechAtom, unlockAudio } from "./audio";
import { goAtom, attendedAtom } from "./route";
import { rosterActionAtom } from "./roster";
import { linkAtom } from "./aria";
import { ForkedButUnsent } from "figaro-forms/aria";

export const SAVE_DELAY_MS = 400;

export interface ComposerState {
  readonly sending: boolean;
  readonly forking: boolean;
  readonly note: string;
}

const idle: ComposerState = { sending: false, forking: false, note: "" };
const composers = new Map<string, PrimitiveAtom<ComposerState>>();
const drafts = new Map<string, PrimitiveAtom<string>>();

export function keyOf(store: string, aria: string): string {
  return store + "/" + aria;
}

export function composerAtom(key: string): PrimitiveAtom<ComposerState> {
  let a = composers.get(key);
  if (!a) {
    a = atom(idle);
    composers.set(key, a);
  }
  return a;
}

const storageKey = (key: string) => "fw.draft." + key;

function readDraft(key: string): string {
  try {
    return window.localStorage.getItem(storageKey(key)) ?? "";
  } catch {
    return "";
  }
}

function saveDraft(key: string, text: string): void {
  try {
    if (text) window.localStorage.setItem(storageKey(key), text);
    else window.localStorage.removeItem(storageKey(key));
  } catch {
    return;
  }
}

export function draftAtom(key: string): PrimitiveAtom<string> {
  let a = drafts.get(key);
  if (!a) {
    const base = atom(readDraft(key));
    let timer: ReturnType<typeof setTimeout> | undefined;
    a = atom(
      (get) => get(base),
      (_get, set, next: string | ((prev: string) => string)) => {
        const text = typeof next === "function" ? next(_get(base)) : next;
        set(base, text);
        if (timer) clearTimeout(timer);
        if (text === "") {
          timer = undefined;
          saveDraft(key, "");
        } else timer = setTimeout(() => saveDraft(key, text), SAVE_DELAY_MS);
      },
    ) as PrimitiveAtom<string>;
    drafts.set(key, a);
  }
  return a;
}

const reason = (err: unknown): string => (err instanceof Error && err.message ? err.message : "network");

export const composerNoteAtom = atom(null, (_get, set, to: { key: string; note: string }) => {
  set(composerAtom(to.key), (s) => ({ ...s, note: to.note }));
});

export const sendAtom = atom(null, async (get, set): Promise<boolean> => {
  const at = get(attendedAtom);
  if (!at) return false;
  const key = keyOf(at.store, at.aria);
  const comp = composerAtom(key);
  const draft = draftAtom(key);
  const text = get(draft).trim();
  if (get(comp).sending || !text) return false;
  if (get(linkAtom) !== "live") {
    set(comp, (s) => ({ ...s, note: "Not connected. Reconnecting." }));
    return false;
  }
  unlockAudio(get(audioSessionAtom));
  set(comp, (s) => ({ ...s, sending: true, note: "" }));
  try {
    await at.client.peek(at.aria).qua(text);
    set(comp, (s) => ({ ...s, sending: false }));
    if (get(draft).trim() === text) set(draft, "");
    return true;
  } catch (err) {
    set(comp, (s) => ({ ...s, sending: false, note: "Not sent: " + reason(err) }));
    return false;
  }
});

export const interruptAtom = atom(null, async (get, set, queue: "keep" | "clear") => {
  const at = get(attendedAtom);
  if (!at) return;
  const comp = composerAtom(keyOf(at.store, at.aria));
  set(cancelSpeechAtom, (n) => n + 1);
  try {
    await at.client.peek(at.aria).interrupt({ queue });
  } catch (err) {
    set(comp, (s) => ({ ...s, note: "Not stopped: " + reason(err) }));
  }
});

export interface ForkRequest {
  readonly turn: number;
  readonly text?: string;
}

export const forkAtom = atom(null, async (get, set, req: number | ForkRequest) => {
  const at = get(attendedAtom);
  if (!at) return;
  const { turn, text } = typeof req === "number" ? { turn: req, text: undefined } : req;
  const comp = composerAtom(keyOf(at.store, at.aria));
  if (get(comp).forking) return;
  set(comp, (s) => ({ ...s, forking: true, note: "" }));
  let alternative = "";
  let note = "";
  try {
    if (turn) alternative = (await at.client.forkAt(at.aria, turn, text)).id;
    else alternative = (await at.client.tailFork(at.aria)).alternative;
  } catch (err) {
    if (err instanceof ForkedButUnsent) {
      alternative = err.fork.alternative;
      note = "Forked, but the first message was not sent: " + reason(err.cause);
    } else {
      set(comp, (s) => ({ ...s, forking: false, note: "Not forked: " + reason(err) }));
      return;
    }
  }
  set(comp, (s) => ({ ...s, forking: false }));
  void set(rosterActionAtom, "refresh");
  set(goAtom, { store: at.store, aria: alternative });
  if (note) set(composerAtom(keyOf(at.store, alternative)), (s) => ({ ...s, note }));
});
