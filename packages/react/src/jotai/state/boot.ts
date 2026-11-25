import { atom } from "jotai";
import type { AriaClient } from "figaro-forms/aria";

export interface Boot {
  readonly stores: Readonly<Record<string, AriaClient>>;
  readonly store: string;
  readonly audioUrl: string;
  readonly sttUrl: string;
  readonly attachUrl?: string;
  readonly mark: string;
  readonly landing?: boolean;
}

export const bootAtom = atom<Boot>({ stores: {}, store: "local", audioUrl: "audio", sttUrl: "stt", mark: "" });
