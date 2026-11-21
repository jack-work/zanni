import { atom, type PrimitiveAtom } from "jotai";
import { audioSessionAtom, cancelSpeechAtom, unlockAudio } from "./audio";
import { goAtom, attendedAtom } from "./route";
import { rosterActionAtom } from "./roster";
import { linkAtom } from "./aria";
import { ForkedButUnsent } from "figaro-forms/aria";
import { beginAction, traced } from "../../trace";
import { attachmentsAtom, clearAttachmentsAtom, quaDictated, quaWithAttachments, readyIdsAtom, spentAtom } from "./attach";

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

export function ariaOf(key: string): string {
  return key.slice(key.indexOf("/") + 1);
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

export interface Dictated {
  readonly id: string;
  readonly text: string;
}

const dictations = new Map<string, PrimitiveAtom<Dictated | null>>();

export function dictatedAtom(key: string): PrimitiveAtom<Dictated | null> {
  let a = dictations.get(key);
  if (!a) {
    a = atom<Dictated | null>(null);
    dictations.set(key, a);
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
  const held = get(attachmentsAtom(key));
  const dictated = get(dictatedAtom(key));
  const dictation = dictated && dictated.text.trim() === text ? dictated.id : undefined;
  if (get(comp).sending) return false;
  if (!text) {
    if (held.length) set(comp, (s) => ({ ...s, note: "Add a message to send the attachments with." }));
    return false;
  }
  if (get(linkAtom) !== "live") {
    set(comp, (s) => ({ ...s, note: "Not connected. Reconnecting." }));
    return false;
  }
  unlockAudio(get(audioSessionAtom));
  set(comp, (s) => ({ ...s, sending: true, note: "" }));
  const give = () => get(draft) === "" && set(draft, text);
  set(draft, "");
  try {
    return await traced("send", { "figaro.aria": at.aria }, async () => {
      if (held.length) {
        const got = await set(readyIdsAtom, key);
        if ("why" in got) {
          give();
          set(comp, (s) => ({ ...s, sending: false, note: got.why }));
          return false;
        }
        try {
          await quaWithAttachments(at.client, at.aria, text, got.ids, dictation);
        } catch (err) {
          set(spentAtom, key);
          throw err;
        }
        set(clearAttachmentsAtom, key);
      } else if (dictation) await quaDictated(at.client, at.aria, text, dictation);
      else await at.client.peek(at.aria).qua(text);
      set(comp, (s) => ({ ...s, sending: false }));
      set(dictatedAtom(key), null);
      return true;
    });
  } catch (err) {
    give();
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
  readonly aria?: string;
  readonly stay?: boolean;
}

export type Done = { readonly ok: true; readonly done: string } | { readonly ok: false; readonly why: string };

export const forkAtom = atom(null, async (get, set, req: number | ForkRequest): Promise<Done> => {
  const at = get(attendedAtom);
  if (!at) return { ok: false, why: "Fork: no aria is open." };
  const { turn, text, aria = at.aria, stay = false } = typeof req === "number" ? { turn: req, text: undefined, aria: undefined, stay: false } : req;
  const comp = composerAtom(keyOf(at.store, at.aria));
  if (get(comp).forking) return { ok: false, why: "Fork: one is already running." };
  set(comp, (s) => ({ ...s, forking: true, note: "" }));
  const span = beginAction("fork", { "figaro.aria": aria });
  let alternative = "";
  let note = "";
  try {
    if (turn) alternative = (await at.client.forkAt(aria, turn, text)).id;
    else {
      alternative = (await at.client.tailFork(aria)).alternative;
      if (text) {
        await at.client.peek(alternative).qua(text).catch((err: unknown) => {
          span.end(err);
          note = "Forked, but the first message was not sent: " + reason(err);
        });
      }
    }
  } catch (err) {
    if (err instanceof ForkedButUnsent) {
      alternative = err.fork.alternative;
      note = "Forked, but the first message was not sent: " + reason(err.cause);
      span.end(err.cause);
    } else {
      span.end(err);
      const why = "Not forked: " + reason(err);
      set(comp, (s) => ({ ...s, forking: false, note: why }));
      return { ok: false, why };
    }
  }
  span.end();
  set(comp, (s) => ({ ...s, forking: false }));
  void set(rosterActionAtom, "refresh");
  if (!stay) {
    set(goAtom, { store: at.store, aria: alternative });
    if (note) set(composerAtom(keyOf(at.store, alternative)), (s) => ({ ...s, note }));
  } else if (note) set(comp, (s) => ({ ...s, note }));
  return { ok: true, done: "Forked into " + alternative.slice(0, 8) + "." };
});
