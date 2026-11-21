import { atom } from "jotai";
import type { SheetKind, SheetTarget } from "../lib/sheet";
import { attendedAtom } from "./route";

export const sheetAtom = atom<SheetTarget | null>(null);

export const openSheetAtom = atom(null, (get, set, to: { kind: SheetKind; turn: number }) => {
  const at = get(attendedAtom);
  if (at) set(sheetAtom, { kind: to.kind, store: at.store, aria: at.aria, turn: to.turn });
});

export const closeSheetAtom = atom(null, (_get, set) => set(sheetAtom, null));
