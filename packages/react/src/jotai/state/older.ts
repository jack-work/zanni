import { atom } from "jotai";
import { ariaRosterAtom, type AriaRoster, type RosterAction } from "figaro-forms/aria/jotai";
import { clientAtom } from "./route";

export const OLDER_PAGE = 200;

const noStore: AriaRoster = { rows: [], next: undefined, refused: 0, refusedWhy: undefined, loading: false, error: new Error("no such store") };

export const olderRosterAtom = atom<AriaRoster>((get) => {
  const client = get(clientAtom);
  return client ? get(ariaRosterAtom(client, { limit: OLDER_PAGE })) : noStore;
});

export const olderRosterActionAtom = atom(null, (get, set, action: RosterAction) => {
  const client = get(clientAtom);
  return client ? set(ariaRosterAtom(client, { limit: OLDER_PAGE }), action) : Promise.resolve();
});
