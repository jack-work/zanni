import { atom } from "jotai";
import { beginAction } from "../telemetry/trace";
import type { AriaClient } from "figaro-forms/aria";
import { goAtom, clientAtom, storeNameAtom } from "./route";
import { rosterActionAtom } from "./roster";
import type { Done } from "./composer";
import { bootAtom } from "./boot";
import { pitSnapAtom, pitViewAtom, treeTakesFocusAtom } from "./pit";
import { composerFocusAtom } from "./mic";

export interface NewFigaroState {
  readonly open: boolean;
  readonly creating: boolean;
  readonly note: string;
  readonly outfits?: string;
}

export const newFigaroAtom = atom<NewFigaroState>({ open: false, creating: false, note: "" });

export const openNewFigaroAtom = atom(null, (_get, set, outfits?: string) => set(newFigaroAtom, { open: true, creating: false, note: "", ...(outfits ? { outfits } : {}) }));
export const closeNewFigaroAtom = atom(null, (get, set) => {
  if (!get(newFigaroAtom).creating) set(newFigaroAtom, { open: false, creating: false, note: "" });
});

export function splitOutfits(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function createFigaro(client: AriaClient, outfits: readonly string[]): Promise<string> {
  const span = beginAction("create");
  try {
    const made = await client.connection.call<{ figaro_id: string }>("figaro.create", outfits.length ? { outfits } : {});
    span.end();
    return made.figaro_id;
  } catch (err) {
    span.end(err);
    throw err;
  }
}

const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export const mintFigaroAtom = atom(null, async (get, set, req: { outfits: string; text: string }): Promise<Done> => {
  const client = get(clientAtom);
  const store = get(storeNameAtom);
  if (!client) return { ok: false, why: "Not created: no store." };
  let id: string;
  try {
    id = await createFigaro(client, splitOutfits(req.outfits));
  } catch (err) {
    return { ok: false, why: "Not created: " + reason(err) };
  }
  void set(rosterActionAtom, "refresh");
  set(goAtom, { store, aria: id });
  const text = req.text.trim();
  if (text) {
    try {
      await client.peek(id).qua(text);
    } catch (err) {
      return { ok: false, why: "Created " + id.slice(0, 8) + "; first message failed: " + reason(err) };
    }
  }
  return { ok: true, done: "Created " + id.slice(0, 8) + "." };
});

export const createFigaroAtom = atom(null, async (get, set, req: { outfits: string; text: string }) => {
  if (get(newFigaroAtom).creating) return;
  set(newFigaroAtom, { open: true, creating: true, note: "" });
  const made = await set(mintFigaroAtom, req);
  set(newFigaroAtom, made.ok ? { open: false, creating: false, note: "" } : { open: true, creating: false, note: made.why });
});

export const LANDING_OUTFIT = "landing";

export const landAtom = atom(null, async (get, set) => {
  const boot = get(bootAtom);
  const client = get(clientAtom);
  const store = get(storeNameAtom);
  if (!boot.landing || !client) return;
  set(bootAtom, { ...boot, landing: false });
  const id = await createFigaro(client, [LANDING_OUTFIT]).catch(() => createFigaro(client, [])).catch(() => undefined);
  if (!id) return;
  set(treeTakesFocusAtom, false);
  set(pitViewAtom, "tree");
  set(pitSnapAtom, "half");
  void set(rosterActionAtom, "refresh");
  set(goAtom, { store, aria: id });
  set(composerFocusAtom, (n) => n + 1);
});
