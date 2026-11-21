export interface PitFace {
  glyph: string;
  name: string;
  selection: string;
}

export const pitFaces = {
  queue: { glyph: "𝄚", name: "queue", selection: "♭" },
  notifications: { glyph: "𝄞", name: "notifications", selection: "♩" },
  command: { glyph: "∴", name: "command", selection: "" },
  composer: { glyph: "✎", name: "composer", selection: "" },
  search: { glyph: "⌕", name: "search", selection: "" },
  help: { glyph: "?", name: "help", selection: "" },
  status: { glyph: "!", name: "status", selection: "" },
  dropped: { glyph: "𝄽", name: "dropped", selection: "♭" },
  form: { glyph: "웃", name: "form", selection: "⌖" },
  models: { glyph: "웃", name: "models", selection: "⟡" },
  reaped: { glyph: "웃", name: "reaped", selection: "⁂" },
  troupe: { glyph: "웃", name: "troupe", selection: "⌘" },
  decision: { glyph: "⁇", name: "decision", selection: "" },
  login: { glyph: "⚷", name: "login", selection: "▸" },
  answer: { glyph: "⚷", name: "answer", selection: "" },
  send: { glyph: "✎", name: "send", selection: "" },
} as const satisfies Record<string, PitFace>;

export type PitFaceId = keyof typeof pitFaces;

export const SELECTION = "▸";

export const marks = {
  fork: "⑂",
  delta: "Δ",
  head: "•",
  dead: "⊘",
  absent: "∅",
  empty: '""',
} as const;

export function selectionGlyph(id: PitFaceId): string {
  return pitFaces[id].selection || SELECTION;
}
