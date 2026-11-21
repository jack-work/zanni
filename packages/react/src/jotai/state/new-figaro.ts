import { atom } from "jotai";
import { goAtom, clientAtom, storeNameAtom, attendedAtom } from "./route";
import { rosterActionAtom, rosterAtom } from "./roster";
import { labelOf } from "../lib/roster";
import { bootAtom } from "./boot";

export interface NewFigaroState {
  readonly open: boolean;
  readonly creating: boolean;
  readonly note: string;
}

export const newFigaroAtom = atom<NewFigaroState>({ open: false, creating: false, note: "" });

export const openNewFigaroAtom = atom(null, (_get, set) => set(newFigaroAtom, { open: true, creating: false, note: "" }));
export const closeNewFigaroAtom = atom(null, (get, set) => {
  if (!get(newFigaroAtom).creating) set(newFigaroAtom, { open: false, creating: false, note: "" });
});

export interface Root {
  readonly id: string;
  readonly label: string;
}

export const rootsAtom = atom<Root[]>((get) => {
  const rows = get(rosterAtom).rows;
  const known = new Set(rows.map((r) => r.id));
  const attended = get(attendedAtom);
  const out: Root[] = [];
  const seen = new Set<string>();
  const add = (id: string, label: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, label });
  };
  for (const t of get(bootAtom).templates ?? []) add(t.id, t.label);
  if (attended) {
    const row = rows.find((r) => r.id === attended.aria);
    add(attended.aria, row ? labelOf(row) : attended.aria.slice(0, 8));
  }
  for (const r of rows) if (!r.parent || !known.has(r.parent)) add(r.id, labelOf(r));
  return out;
});

export function splitOutfits(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export const createFigaroAtom = atom(null, async (get, set, req: { root: string; outfits: string; text: string }) => {
  const client = get(clientAtom);
  const store = get(storeNameAtom);
  if (!client || !req.root || get(newFigaroAtom).creating) return;
  set(newFigaroAtom, { open: true, creating: true, note: "" });
  try {
    const outfits = splitOutfits(req.outfits);
    const res = await client.peek(req.root).fork({ atTurn: 1, ...(outfits.length ? { outfits } : {}) });
    const text = req.text.trim();
    if (text) await client.peek(res.alternative).qua(text);
    set(newFigaroAtom, { open: false, creating: false, note: "" });
    void set(rosterActionAtom, "refresh");
    set(goAtom, { store, aria: res.alternative });
  } catch (err) {
    set(newFigaroAtom, { open: true, creating: false, note: "Not created: " + (err instanceof Error ? err.message : String(err)) });
  }
});
