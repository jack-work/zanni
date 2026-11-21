import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TranscriptContext, TurnView } from "zanni-react";
import type { TurnModel } from "zanni-react";

const turn = (forkedFrom?: string): TurnModel => ({ key: "t5", turn: 5, input: null, items: [], end: null, open: false, sealed: true, ...(forkedFrom ? { forkedFrom } : {}) });

describe("a fork's first own turn", () => {
  it("wears the fork glyph and the parent's name in its head, as the pager does", () => {
    const { container } = render(
      <TranscriptContext value={{ nameOf: (id) => (id === "p" ? "zanni" : id) }}>
        <ol>
          <TurnView turn={turn("p")} speaking={null} fresh={false} />
        </ol>
      </TranscriptContext>,
    );
    expect(container.querySelector(".nodi-turn-head .nodi-turn-fork")!.textContent).toBe("⑂ zanni");
  });

  it("falls back to the id's first eight characters, and is absent on an ordinary turn", () => {
    const { container, rerender } = render(
      <ol>
        <TurnView turn={turn("c0ffee01c0ffee01")} speaking={null} fresh={false} />
      </ol>,
    );
    expect(container.querySelector(".nodi-turn-fork")!.textContent).toBe("⑂ c0ffee01");
    rerender(
      <ol>
        <TurnView turn={turn()} speaking={null} fresh={false} />
      </ol>,
    );
    expect(container.querySelector(".nodi-turn-fork")).toBeNull();
  });
});
