import { atom, type PrimitiveAtom } from "jotai";
import { ariaMethod, type AriaClient, type QuaResponse } from "figaro-forms/aria";
import { MAX_IMAGES, attachUrlOf, imagesIn, problemWith, stale, uploadFile, type Slot } from "../lib/attach";
import { bootAtom } from "./boot";
import { composerNoteAtom, keyOf } from "./composer";
import { attendedAtom } from "./route";

export interface Attachment extends Slot {
  readonly key: string;
  readonly file: File;
  readonly name: string;
  readonly kind: string;
  readonly bytes: number;
  readonly id: string;
  readonly error: string;
}

const lists = new Map<string, PrimitiveAtom<readonly Attachment[]>>();
const lines = new Map<string, Promise<void>>();
let seq = 0;

export function attachmentsAtom(key: string): PrimitiveAtom<readonly Attachment[]> {
  let a = lists.get(key);
  if (!a) {
    a = atom<readonly Attachment[]>([]);
    lists.set(key, a);
  }
  return a;
}

export const quaWithAttachments = (client: AriaClient, aria: string, text: string, attachments: readonly string[]): Promise<QuaResponse> =>
  client.connection.call<QuaResponse>(ariaMethod.qua, { figaro_id: aria, text, attachments });

const reason = (err: unknown): string => (err instanceof Error && err.message ? err.message : "network");

export const uploadAtom = atom(null, async (get, set, req: { key: string; item: string }) => {
  const list = attachmentsAtom(req.key);
  const base = get(bootAtom).attachUrl ?? "attach";
  const item = get(list).find((a) => a.key === req.item);
  if (!item) return;
  const patch = (next: Partial<Attachment>) => set(list, (all) => all.map((a) => (a.key === req.item ? { ...a, ...next } : a)));
  patch({ status: "uploading", error: "" });
  try {
    const got = await uploadFile(attachUrlOf(base), item.file);
    if (!get(list).some((a) => a.key === req.item)) return;
    const others = get(list).filter((a) => a.key !== req.item);
    if (imagesIn(others) + got.images > MAX_IMAGES) {
      patch({ status: "failed", error: "A message carries at most " + MAX_IMAGES + " images." });
      return;
    }
    patch({ status: "ready", id: got.id, kind: got.kind, bytes: got.bytes, images: got.images, at: Date.now(), error: "" });
  } catch (err) {
    patch({ status: "failed", error: reason(err) });
  }
});

export const addFilesAtom = atom(null, (get, set, files: readonly File[]) => {
  const at = get(attendedAtom);
  if (!at) return;
  const key = keyOf(at.store, at.aria);
  const list = attachmentsAtom(key);
  const notes: string[] = [];
  const added: string[] = [];
  for (const file of files) {
    const bad = problemWith(file, get(list).length);
    if (bad) {
      notes.push(bad);
      continue;
    }
    const item = "a" + ++seq;
    added.push(item);
    set(list, (all) => [...all, { key: item, file, name: file.name || "attachment", kind: "", bytes: file.size, id: "", images: 0, status: "uploading", at: 0, error: "" }]);
  }
  if (notes.length) set(composerNoteAtom, { key, note: notes[0]! });
  for (const item of added) {
    const prior = lines.get(key) ?? Promise.resolve();
    const next = prior.then(() => set(uploadAtom, { key, item })).then(() => undefined);
    lines.set(key, next);
  }
});

export const removeAttachmentAtom = atom(null, (get, set, req: { key: string; item: string }) => {
  set(attachmentsAtom(req.key), (all) => all.filter((a) => a.key !== req.item));
});

export const clearAttachmentsAtom = atom(null, (_get, set, key: string) => set(attachmentsAtom(key), []));

export const readyIdsAtom = atom(null, async (get, set, key: string): Promise<{ ids: string[] } | { why: string }> => {
  const list = attachmentsAtom(key);
  const now = Date.now();
  for (const item of get(list)) {
    if (item.status === "ready" && stale(item, now)) {
      set(list, (all) => all.map((a) => (a.key === item.key ? { ...a, at: 0 } : a)));
      await set(uploadAtom, { key, item: item.key });
    }
  }
  const items = get(list);
  const failed = items.find((a) => a.status === "failed");
  if (failed) return { why: failed.name + ": " + failed.error + ". Remove it to send the rest." };
  if (items.some((a) => a.status === "uploading")) return { why: "Wait for the upload to finish." };
  return { ids: items.map((a) => a.id) };
});

export const spentAtom = atom(null, (_get, set, key: string) => {
  set(attachmentsAtom(key), (all) => all.map((a) => ({ ...a, at: 0 })));
});

export const attachingAtom = atom((get) => {
  const at = get(attendedAtom);
  const items = at ? get(attachmentsAtom(keyOf(at.store, at.aria))) : [];
  return { items, uploading: items.some((a) => a.status === "uploading") };
});
