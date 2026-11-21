import { atom } from "jotai";
import type { AriaClient } from "figaro-forms/aria";

export interface Boot {
  readonly stores: Readonly<Record<string, AriaClient>>;
  readonly store: string;
  readonly audioUrl: string;
  readonly sttUrl: string;
  readonly mark: string;
}

export const bootAtom = atom<Boot>({ stores: {}, store: "local", audioUrl: "audio", sttUrl: "stt", mark: "" });
