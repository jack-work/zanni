import type { EdgeKind } from "./graph";

export interface KindInfo {
  readonly label: string;
  readonly dash: boolean;
  readonly about: string;
}

export const KINDS: Record<EdgeKind, KindInfo> = {
  under: { label: "drawn under (figaro)", dash: false, about: "Figaro topology: the child figaro is drawn under (forked from) its parent, as @topology places it." },
  formunder: { label: "drawn under (form)", dash: true, about: "Form topology: a role form is drawn under the role form it reports to, and a queue form under the role it belongs to." },
  target: { label: "role target", dash: false, about: "The role form targets this figaro: messages to the role reach it, and succession moves it." },
  study: { label: "studies", dash: true, about: "The arrow points from the studied queue form to the figaro that studies it and hears every change." },
  lease: { label: "claimed (lease)", dash: false, about: "Open work orders a seat has claimed: the arrow runs from the queue form to the claimant. A forked worker is drawn as its seat's forks." },
  flow: { label: "posted work", dash: false, about: "Open work orders a seat has posted: the arrow runs from the poster to the queue form." },
};

export type Dir = "both" | "out" | "in";

export const NEXT_DIR: Record<Dir, Dir> = { both: "out", out: "in", in: "both" };

export const VIEWS = {
  full: { label: "full graph", about: "Every chartered role form, queue form and holder, with the role structure laid over the hierarchy, and the forks drawn under each seat." },
  command: { label: "central command", about: "Central command with the seats drawn directly under it; everything below them is folded into the seat that holds it." },
} as const;
