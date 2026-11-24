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

export interface TurnFacts {
  turn: number;
  inquiry: string;
  nodes: NodeFacts[];
}

export interface Facts {
  turns: TurnFacts[];
  running: boolean;
  screen: { text: string };
}

export async function readFacts(page: Page): Promise<Facts> {
  return page.evaluate(() => {
    const text = (el: Element | null) => (el ? (el as HTMLElement).innerText ?? el.textContent ?? "" : "");
    const turns = [...document.querySelectorAll<HTMLElement>(".nodi-turn")].map((li) => ({
      turn: Number(li.dataset.turn),
      inquiry: text(li.querySelector(".nodi-input .nodi-said-text")).trim(),
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
    return { turns, running: !!document.querySelector(".fw")?.hasAttribute("data-running"), screen: { text: document.body.innerText } };
  });
}
