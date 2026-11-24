import { atom } from "jotai";
import { boundFormAtom } from "figaro-forms/aria/jotai";
import { clientAtom } from "./route";

export const ASKS_FORM = "@77074489e3ab40bc4277b7abd23bdd50";

export const asksStateAtom = atom((get) => {
  const client = get(clientAtom);
  return client ? get(boundFormAtom(client, ASKS_FORM)) : undefined;
});
