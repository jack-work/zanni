import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { foldAsks } from "zanni-react/jotai";
import { AsksList } from "../../packages/react/src/jotai/components/asks";
import { readFileSync } from "node:fs";

const fixture = JSON.parse(readFileSync("../test/wave1/fixtures/orders.json", "utf8")) as { orders: Record<string, { state: string }> };

const NOW = Date.parse("2026-11-23T21:30:00-05:00");

describe("AsksList", () => {
  const asks = foldAsks(fixture, NOW);

  it("draws one row per ask in sort order, each with owner, stage, age and the stages reached", () => {
    render(<AsksList asks={asks} now={NOW} />);
    const rows = screen.getAllByRole("button");
    expect(rows).toHaveLength(asks.length);
    const first = rows[0]!;
    expect(first.getAttribute("data-id")).toBe(asks[0]!.id);
    expect(first.querySelector(".fw-ask-stage")!.textContent).toContain("filed");
    expect(first.querySelector(".zr-pit-row-meta")!.textContent).toMatch(/\d/);
    const live = rows.find((r) => r.getAttribute("data-id") === "compose-full-width")!;
    expect(live.querySelector(".fw-ask-spans")!.textContent).toMatch(/^filed .* · lane .* · ready .* · cut .* · live /);
  });

  it("opens the full text, owner and stage times on a tap and closes them on the next", () => {
    render(<AsksList asks={asks} now={NOW} />);
    const row = screen.getAllByRole("button").find((r) => r.getAttribute("data-id") === "attend-any-figaro")!;
    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(row.closest("li")!.querySelector(".fw-ask-detail")).toBeNull();
    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    const detail = row.closest("li")!.querySelector(".fw-ask-detail") as HTMLElement;
    expect(within(detail).getByText(/Brief: ~\/\.captains-log/)).not.toBeNull();
    expect(within(detail).getByText("Figaro Engineer")).not.toBeNull();
    fireEvent.click(row);
    expect(row.closest("li")!.querySelector(".fw-ask-detail")).toBeNull();
  });
});
