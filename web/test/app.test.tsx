import { act, render, screen, waitFor, within } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/app";
import { bootAtom } from "zanni-react/jotai";
import { mockDoor, type MockCore } from "./mock";
import type { AriaClient } from "figaro-forms/aria";

let core: MockCore;
let client: AriaClient;

function open(hash: string, step = 1) {
  ({ core, client } = mockDoor(step));
  window.location.hash = hash;
  const store = createStore();
  store.set(bootAtom, { stores: { gluck: client }, store: "gluck", audioUrl: "audio", sttUrl: "stt", mark: "" });
  return render(
    <Provider store={store}>
      <App />
    </Provider>,
  );
}

const app = () => document.querySelector<HTMLElement>(".fw")!;
const shown = () => [...document.querySelectorAll<HTMLElement>(".nodi-turn")].map((n) => Number(n.dataset.turn));

afterEach(() => {
  client?.close();
  window.location.hash = "";
});

describe("the list", () => {
  it("pages eight at a time and indents children under their parent", async () => {
    open("#/");
    await waitFor(() => expect(document.querySelectorAll(".zr-thread")).toHaveLength(8));
    expect(app().dataset.route).toBe("list");
    expect(document.querySelector(".fw-more")).toBeTruthy();
    act(() => screen.getByText("More arias").click());
    await waitFor(() => expect(document.querySelectorAll(".zr-thread").length).toBeGreaterThan(8));
    const depths = [...document.querySelectorAll<HTMLElement>(".zr-thread")].map((a) => a.dataset.depth);
    expect(depths).toContain("1");
    expect(document.querySelector(".fw-more")).toBeNull();
  });

  it("says what it is waiting on and what policy hid", async () => {
    open("#/");
    expect(screen.getByText("Loading arias.")).toBeTruthy();
    await waitFor(() => expect(document.querySelectorAll(".zr-thread").length).toBe(8));
    expect(screen.queryByText("Loading arias.")).toBeNull();
  });
});

describe("attending an aria", () => {
  it("reads the tail, goes live, and marks the aria current in the list", async () => {
    open("#/gluck/" + "c0ffee01".repeat(4));
    await waitFor(() => expect(app().dataset.link).toBe("live"));
    await waitFor(() => expect(shown().length).toBeGreaterThan(0));
    const first = shown();
    expect(first[first.length - 1]).toBe(26);
    expect(first.length).toBeLessThan(26);
    expect(first).toEqual([...first].sort((a, b) => a - b));
    expect(app().dataset.route).toBe("aria");
    await waitFor(() => expect(document.querySelector(".zr-thread[aria-current='page']")).toBeTruthy());
  });

  it("draws unknown nodes by name, who said what, and tool blocks open", async () => {
    open("#/gluck/" + "c0ffee01".repeat(4) + ":7");
    await waitFor(() => expect(document.querySelector('.nodi-turn[data-turn="7"]')).toBeTruthy(), { timeout: 5000 });
    const turn = document.querySelector<HTMLElement>('.nodi-turn[data-turn="7"]')!;
    const tool = turn.querySelector<HTMLDetailsElement>(".nodi-tool")!;
    expect(tool.open).toBe(true);
    expect(within(turn).getByText("Arguments")).toBeTruthy();
    expect(tool.querySelector(".nodi-tool-args")!.textContent).toContain("go test");
    expect(tool.querySelector(".nodi-clipped")!.textContent).toContain("clipped");
  });

  it("shows hostile text as the characters it is and boxes bidi and zero width marks", async () => {
    open("#/gluck/" + "c0ffee01".repeat(4) + ":3");
    await waitFor(() => expect(document.querySelector('.nodi-turn[data-turn="3"]')).toBeTruthy(), { timeout: 5000 });
    const turn = document.querySelector<HTMLElement>('.nodi-turn[data-turn="3"]')!;
    expect(turn.textContent).toContain('<img src=x onerror="window.__pwned=1">');
    expect(turn.textContent).toContain("U+202E");
    expect(turn.textContent).toContain("U+200B");
    expect(document.querySelectorAll("img:not(.fw-head), script, iframe, svg, style").length).toBe(0);
    expect(turn.querySelector('a[href^="javascript"]')).toBeNull();
    for (const n of document.querySelectorAll("*")) for (const a of n.attributes) expect(/^on/i.test(a.name)).toBe(false);
  });

  it("says so when the aria is not there", async () => {
    open("#/gluck/" + "f".repeat(32));
    await waitFor(() => expect(app().dataset.link).toBe("gone"));
    expect(document.querySelector(".fw-main")!.textContent).toContain("No such aria");
  });

  it("names a store that is not wired", async () => {
    open("#/nowhere/" + "c0ffee01".repeat(4));
    expect(document.querySelector(".fw-main")!.textContent).toContain("No such store: nowhere");
  });
});
