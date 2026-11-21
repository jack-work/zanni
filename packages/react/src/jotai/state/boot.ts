import { atom } from "jotai";
import type { AriaClient } from "figaro-forms/aria";

export interface Boot {
  readonly stores: Readonly<Record<string, AriaClient>>;
  readonly store: string;
  readonly audioUrl: string;
  readonly sttUrl: string;
  readonly attachUrl?: string;
  readonly mark: string;
  readonly templates?: readonly { readonly id: string; readonly label: string }[];
}

export function parseTemplates(attr: string | null): { id: string; label: string }[] {
  if (!attr) return [];
  return attr
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const at = part.indexOf("=");
      const id = (at < 0 ? part : part.slice(0, at)).trim();
      const label = (at < 0 ? "" : part.slice(at + 1)).trim();
      return { id, label: label || "New figaro" };
    })
    .filter((t) => /^[0-9a-f]{8,32}$/.test(t.id));
}

export const bootAtom = atom<Boot>({ stores: {}, store: "local", audioUrl: "audio", sttUrl: "stt", mark: "" });
