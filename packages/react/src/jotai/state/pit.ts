import { atom } from "jotai";
import { ariaFactsAtom, boundFormAtom, recentAtom, treeAtom } from "figaro-forms/aria/jotai";
import { troupeFormID, type AriaFacts } from "figaro-forms/aria";
import type { TopologyForms } from "../lib/topology";
import { FORKED_FROM_KEY, valueAt, type PitView } from "../lib/pit-rows";
import { attendedAtom, clientAtom } from "./route";

const USED_KEY = "fw.pit.used";

function readUsed(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(USED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export const pitViewAtom = atom<PitView>("list");

const usedBase = atom<Record<string, number>>(readUsed());

export const pitUsedAtom = atom((get) => get(usedBase));

export const markPitUsedAtom = atom(null, (get, set, id: string) => {
  const next = { ...get(usedBase), [id]: Date.now() };
  set(usedBase, next);
  try {
    window.localStorage.setItem(USED_KEY, JSON.stringify(next));
  } catch {
    return;
  }
});

export const boundStateAtom = atom((get) => {
  const at = get(attendedAtom);
  return at ? get(boundFormAtom(at.client, at.aria)) : undefined;
});

export const forkedFromAtom = atom((get) => valueAt(get(boundStateAtom)?.root, FORKED_FROM_KEY));

export const treeStateAtom = atom((get) => {
  const client = get(clientAtom);
  return client ? get(treeAtom(client)) : undefined;
});

export const recentStateAtom = atom((get) => {
  const client = get(clientAtom);
  return client ? get(recentAtom(client)) : undefined;
});

export const topologyFormsAtom = atom((get): TopologyForms => {
  const client = get(clientAtom);
  const tree = get(treeStateAtom);
  const arias: Record<string, unknown> = {};
  if (!client || !tree) return { troupe: undefined, arias };
  for (const d of tree.daemons) arias[d.id] = get(boundFormAtom(client, d.form)).root;
  return { troupe: get(boundFormAtom(client, troupeFormID)).root, arias };
});

export const attendedFactsAtom = atom((get) => {
  const at = get(attendedAtom);
  return at ? get(ariaFactsAtom(at.client, at.aria)) : undefined;
});
