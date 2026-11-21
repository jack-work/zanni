export function rawAt(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of path.split(".")) {
    if (cur === null || typeof cur !== "object" || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

export function draftOf(v: unknown): string {
  return v === undefined ? "" : JSON.stringify(v);
}

export function parseDraft(draft: string): unknown {
  try {
    return JSON.parse(draft);
  } catch {
    return draft;
  }
}

export function pathProblem(path: string): string {
  if (!path.trim()) return "Name a key.";
  if (path.split(".").some((s) => s === "")) return "A key has no empty segments.";
  return "";
}

export function refusalLine(path: string, r: { kind: string; reason: string } | undefined): string {
  if (!r) return "";
  return path + " is read-only here: " + (r.reason || r.kind);
}
