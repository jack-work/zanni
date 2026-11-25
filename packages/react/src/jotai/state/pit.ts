import { atom } from "jotai";
import { ariaFactsAtom, boundFormAtom, queueAtom, recentAtom, treeAtom } from "figaro-forms/aria/jotai";
import { troupeFormID, type AriaFacts } from "figaro-forms/aria";
import type { TopologyForms } from "../lib/topology";
import { FORKED_FROM_KEY, valueAt, type PitView } from "../lib/pit-rows";
import { attendedAtom, clientAtom } from "./route";
import type { PitSnap } from "../../pit";

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

export const pitSnapAtom = atom<PitSnap>("closed");

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

export const queueStateAtom = atom((get) => {
  const at = get(attendedAtom);
  return at ? get(queueAtom(at.client, at.aria)) : undefined;
});

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

export const forkOfAtom = atom((get) => {
  const id = valueAt(get(boundStateAtom)?.root, FORKED_FROM_KEY);
  if (!id) return undefined;
  const handle = get(treeStateAtom)?.nodes.get(id)?.handle;
  return { id, name: handle || id.slice(0, 8) };
});
