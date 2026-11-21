import { atom } from "jotai";
import { ariaRosterAtom, type AriaRoster, type RosterAction } from "figaro-forms/aria/jotai";
import { attendedAtom, clientAtom } from "./route";

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

export const attendedRowAtom = atom((get) => {
  const at = get(attendedAtom);
  return at ? get(rosterAtom).rows.find((r) => r.id === at.aria) : undefined;
});

