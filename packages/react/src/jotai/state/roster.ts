import { atom } from "jotai";
import { ariaRosterAtom, type AriaRoster, type RosterAction } from "figaro-forms/aria/jotai";
import { depths } from "../lib/roster";
import { clientAtom } from "./route";

export const ROSTER_PAGE = 8;

const noStore: AriaRoster = { rows: [], next: undefined, refused: 0, refusedWhy: undefined, loading: false, error: new Error("no such store") };

export const rosterAtom = atom<AriaRoster>((get) => {
  const client = get(clientAtom);
  return client ? get(ariaRosterAtom(client, { limit: ROSTER_PAGE })) : noStore;
});

export const rosterActionAtom = atom(null, (get, set, action: RosterAction) => {
  const client = get(clientAtom);
  return client ? set(ariaRosterAtom(client, { limit: ROSTER_PAGE }), action) : Promise.resolve();
});

export const rosterLoadedAtom = atom((get) => {
  const r = get(rosterAtom);
  return r.rows.length > 0 || (!r.loading && r.error === undefined);
});

export const depthsAtom = atom((get) => depths(get(rosterAtom).rows));
