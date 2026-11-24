import { atom } from "jotai";

export interface PaneState {
  readonly open: boolean;
  readonly width: number;
  readonly narrow: boolean;
}

const KEY = "figchat.pane";
const initial: PaneState = { open: true, width: 320, narrow: false };

function read(): PaneState {
  try {
    const got = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (got && typeof got.open === "boolean" && typeof got.width === "number" && typeof got.narrow === "boolean") return got;
  } catch {}
  return initial;
}

const base = atom<PaneState>(read());

export const paneAtom = atom(
  (get) => get(base),
  (get, set, patch: Partial<PaneState>) => {
    const next = { ...get(base), ...patch };
    set(base, next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  },
);
