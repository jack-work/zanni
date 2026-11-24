import type { Page } from "@playwright/test";

export interface NodeFacts {
  type: string;
  role: string;
  name?: string;
  status?: string;
  text?: string;
  output?: string;
  open?: boolean;
}

export interface DeltaFacts {
  key: string;
  old: string | null;
  new: string | null;
  header_glyph: string | null;
}

export interface TurnFacts {
  turn: number;
  inquiry: string;
  nodes: NodeFacts[];
  deltas: DeltaFacts[];
}

export interface PitFacts {
  rows: string[];
  footer: string;
}

export interface Facts {
  turns: TurnFacts[];
  running: boolean;
  screen: { text: string };
  pit: PitFacts | null;
  state?: Record<string, unknown>;
  tree?: { edges: string[][] };
}

export async function readFacts(page: Page): Promise<Facts> {
  return page.evaluate(() => {
    const text = (el: Element | null) => (el ? (el as HTMLElement).innerText ?? el.textContent ?? "" : "");
    const turns = [...document.querySelectorAll<HTMLElement>(".nodi-turn")].map((li) => ({
      turn: Number(li.dataset.turn),
      inquiry: text(li.querySelector(".nodi-input .nodi-said-text")).trim(),
      deltas: [...li.querySelectorAll<HTMLElement>(".nodi-delta:not([data-banner])")].map((d) => {
        const side = (sel: string) => {
          const t = d.querySelector(sel)?.textContent ?? "";
          return t === "∅" ? null : t;
        };
        const glyph = li.querySelector(".nodi-turn-delta")?.textContent ?? "";
        return { key: d.querySelector(".nodi-delta-key")?.textContent ?? "", old: side(".nodi-delta-from"), new: side(".nodi-delta-to"), header_glyph: glyph === "Δ" ? "delta" : glyph || null };
      }),
      nodes: [...li.querySelectorAll<HTMLElement>(".nodi-prose, .nodi-thinking, .nodi-tool, .nodi-steering, .nodi-unknown")].map((el) => {
        if (el.classList.contains("nodi-prose")) return { type: "prose", role: "output", text: (el.querySelector(".nodi-text") as HTMLElement | null)?.textContent ?? "" };
        if (el.classList.contains("nodi-thinking")) {
          const d = el as HTMLDetailsElement;
          return { type: "thinking", role: "output", text: el.querySelector(".nodi-thought")?.textContent ?? "", open: d.open };
        }
        if (el.classList.contains("nodi-steering")) return { type: "steering", role: "input", text: el.querySelector(".nodi-said-text")?.textContent ?? "" };
        if (el.classList.contains("nodi-tool")) {
          const d = el as HTMLDetailsElement;
          return { type: "tool", role: "output", name: el.querySelector(".nodi-tool-name")?.textContent ?? "", status: el.dataset.status ?? "", output: el.querySelector(".nodi-tool-out")?.textContent ?? "", open: d.open };
        }
        return { type: "unknown", role: "output", text: text(el) };
      }),
    }));
    const panel = document.querySelector<HTMLElement>(".zr-pit[role=dialog]");
    const open = !!panel && panel.dataset.snap !== "closed" && !panel.hasAttribute("data-leaving");
    const rows = open ? [...panel!.querySelectorAll<HTMLElement>(".zr-pit-li, .fw-pit-fact, .zr-tree-row")].map((r) => r.innerText.replace(/\s+/g, " ").trim()).filter(Boolean) : [];
    const pit = open ? { rows, footer: text(panel!.querySelector(".zr-pit-body")).trim().split("\n").pop() ?? "" } : null;
    return { turns, running: !!document.querySelector(".fw")?.hasAttribute("data-running"), screen: { text: document.body.innerText + "\n" + (document.querySelector(".zr-prompt")?.textContent ?? "") + (document.querySelector<HTMLTextAreaElement>("textarea.zr-input")?.value ?? "") }, pit };
  });
}
