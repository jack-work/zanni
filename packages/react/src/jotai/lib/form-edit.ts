export function rawAt(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const seg of path.split(".")) {
    if (cur === null || typeof cur !== "object" || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

export function draftOf(v: unknown): string {
  if (v === undefined) return "";
  return typeof v === "string" ? v : JSON.stringify(v);
}

export type Parsed = { ok: true; value: unknown } | { ok: false; why: string };

export function parseDraft(draft: string, was: unknown): Parsed {
  if (typeof was === "string" || was === undefined) {
    if (was === undefined && /^\s*[[{0-9-]|^\s*(true|false|null)\s*$/.test(draft)) {
      try {
        return { ok: true, value: JSON.parse(draft) };
      } catch {
        return { ok: true, value: draft };
      }
    }
    return { ok: true, value: draft };
  }
  try {
    return { ok: true, value: JSON.parse(draft) };
  } catch {
    return { ok: false, why: "Not JSON: this key held " + (Array.isArray(was) ? "a list" : typeof was) + "." };
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
