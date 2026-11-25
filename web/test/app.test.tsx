import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  store.set(bootAtom, { stores: { home: client }, store: "home", audioUrl: "audio", sttUrl: "stt", mark: "" });
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
  it("draws the topology as one tree, children under their parent, and a tap attends", async () => {
    open("#/");
    await waitFor(() => expect(document.querySelectorAll(".zr-tree-row").length).toBeGreaterThan(5));
    expect(app().dataset.route).toBe("list");
    const depths = [...document.querySelectorAll<HTMLElement>(".zr-tree-row")].map((r) => r.dataset.depth);
    expect(depths).toContain("0");
    expect(depths).toContain("1");
    const rows = [...document.querySelectorAll(".zr-tree-row")].map((r) => r.textContent ?? "");
    expect(rows[1]).toMatch(/^arias \(\d+\)/);
    expect(rows.some((r) => /\(\d+\)  ".+"/.test(r))).toBe(true);
    expect(rows.join("")).not.toMatch(/[│├└─]/);
    expect(document.querySelectorAll(".zr-tree th, .zr-tree button").length).toBe(0);
    const main = document.querySelector<HTMLElement>(".zr-tree-row[data-id='" + "c0ffee01".repeat(4) + "']")!;
    act(() => main.click());
    await waitFor(() => expect(window.location.hash).toBe("#/home/" + "c0ffee01".repeat(4)));
  });

  it("opens only the chain to the attended aria and the attended row itself, as the pager's revealOpen does", async () => {
    open("#/home/" + "c0ffee02".repeat(4));
    await waitFor(() => expect(document.querySelectorAll(".zr-tree-row").length).toBeGreaterThan(5));
    const ids = () => [...document.querySelectorAll<HTMLElement>(".zr-tree-row")].map((r) => r.dataset.id);
    const main = "c0ffee01".repeat(4);
    const lane = "c0ffee02".repeat(4);
    const review = "c0ffee06".repeat(4);
    const engineer = "c0ffee04".repeat(4);
    const forms = "c0ffee05".repeat(4);
    expect(ids()).toContain(main);
    expect(ids()).toContain(lane);
    expect(ids()).toContain(review);
    expect(ids()).toContain(engineer);
    expect(ids()).not.toContain(forms);
  });

  it("shows a fork in the tree live: the @arias delta is applied and the form is re-read", async () => {
    open("#/home/" + "c0ffee02".repeat(4));
    await waitFor(() => expect(document.querySelectorAll(".zr-tree-row").length).toBeGreaterThan(5));
    const reads = core.calls.filter((c) => c.method === "figaro.form" && c.params.figaro_id === "@arias").length;
    const forked = await client.peek("c0ffee02".repeat(4)).fork({ atTurn: 1 });
    await waitFor(() => expect(core.calls.filter((c) => c.method === "figaro.form" && c.params.figaro_id === "@arias").length).toBeGreaterThan(reads));
    await waitFor(() => expect(document.querySelector(".zr-tree-row[data-id='" + forked.alternative + "']")).toBeTruthy());
  });

  it("counts each row's keys as the pager's :ls does, and takes the bar's mantra from the aria's own facts", async () => {
    open("#/");
    await waitFor(() => expect(document.querySelector(".zr-tree-row[data-id='" + "c0ffee08".repeat(4) + "']")).toBeTruthy());
    await waitFor(() => expect(document.querySelector(".zr-tree-row[data-id='" + "c0ffee08".repeat(4) + "']")!.textContent).toMatch(/Scratch 2.*\(6\)/));
    const mains = document.querySelector(".zr-tree-row[data-id='" + "c0ffee01".repeat(4) + "']")!.textContent ?? "";
    expect(mains).toMatch(/\(8\)/);
    act(() => {
      window.location.hash = "#/home/" + "c0ffee08".repeat(4);
    });
    await waitFor(() => expect(document.querySelector(".fw-status-mantra")?.textContent).toBe("Scratch 2"));
  });

  it("counts the troupe row's own keys, not a fixed one", async () => {
    open("#/");
    await waitFor(() => expect(document.querySelector(".zr-tree-row[data-id^='@node:']")).toBeTruthy());
    await waitFor(() => expect(document.querySelector(".zr-tree-row[data-id^='@node:']")!.textContent).toContain("(2)"));
  });

  it("says what it is waiting on", async () => {
    open("#/");
    expect(screen.getByText("Loading the topology.")).toBeTruthy();
    await waitFor(() => expect(document.querySelectorAll(".zr-tree-row").length).toBeGreaterThan(0));
    expect(screen.queryByText("Loading the topology.")).toBeNull();
  });
});

describe("attending an aria", () => {
  it("reads the tail, goes live, and marks the aria current in the list", async () => {
    open("#/home/" + "c0ffee01".repeat(4));
    await waitFor(() => expect(app().dataset.link).toBe("live"));
    await waitFor(() => expect(shown().length).toBeGreaterThan(0));
    const first = shown();
    expect(first[first.length - 1]).toBe(26);
    expect(first.length).toBeLessThan(26);
    expect(first).toEqual([...first].sort((a, b) => a - b));
    expect(app().dataset.route).toBe("aria");
    await waitFor(() => expect(document.querySelector(".zr-tree-row[aria-selected='true']")).toBeTruthy());
  });

  it("draws unknown nodes by name, who said what, and tool blocks open", async () => {
    open("#/home/" + "c0ffee01".repeat(4) + ":7");
    await waitFor(() => expect(document.querySelector('.nodi-turn[data-turn="7"]')).toBeTruthy(), { timeout: 5000 });
    const turn = document.querySelector<HTMLElement>('.nodi-turn[data-turn="7"]')!;
    const tool = turn.querySelector<HTMLDetailsElement>(".nodi-tool")!;
    expect(tool.open).toBe(true);
    expect(within(turn).getByText("Arguments")).toBeTruthy();
    expect(tool.querySelector(".nodi-tool-args")!.textContent).toContain("go test");
    expect(tool.querySelector(".nodi-clipped")!.textContent).toContain("clipped");
  });

  it("shows hostile text as the characters it is and boxes bidi and zero width marks", async () => {
    open("#/home/" + "c0ffee01".repeat(4) + ":3");
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
    open("#/home/" + "f".repeat(32));
    await waitFor(() => expect(app().dataset.link).toBe("gone"));
    expect(document.querySelector(".fw-main")!.textContent).toContain("No such aria");
  });

  it("names a store that is not wired", async () => {
    open("#/nowhere/" + "c0ffee01".repeat(4));
    expect(document.querySelector(".fw-main")!.textContent).toContain("No such store: nowhere");
  });
});

describe("bench hooks", () => {
  it("marks the attach start and the first painted frame, and carries the stable test ids", async () => {
    performance.clearMarks();
    open("#/home/" + "c0ffee01".repeat(4));
    expect(performance.getEntriesByName("figchat:attach").length).toBe(1);
    expect(window.__figchat).toEqual({});
    await waitFor(() => expect(window.__figchat?.firstFrame).toBeGreaterThan(0));
    const attach = performance.getEntriesByName("figchat:attach")[0]!;
    const frame = performance.getEntriesByName("figchat:first-frame");
    expect(frame.length).toBe(1);
    expect(frame[0]!.startTime).toBeGreaterThanOrEqual(attach.startTime);
    expect(Object.keys(window).filter((k) => k.startsWith("__figchat"))).toEqual(["__figchat"]);
    for (const id of ["composer-input", "send", "transcript-scroller", "pit-grip"]) expect(document.querySelectorAll('[data-testid="' + id + '"]').length, id).toBe(1);
    expect(document.querySelectorAll('[data-testid="topology-row"]').length).toBeGreaterThan(5);
    expect(document.querySelector('[data-testid="composer-input"]')!.tagName).toBe("TEXTAREA");
  });
});

describe("the control pit", () => {
  it("shows the status rows from the aria's metrics and bound form above the actions", async () => {
    open("#/home/" + "c0ffee01".repeat(4));
    await waitFor(() => expect(document.querySelector(".fw-status-handle")).toBeTruthy());
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Open controls" }));
    });
    await waitFor(() => expect(document.querySelector(".fw-pit-status .fw-pit-fact[data-key='started']")).toBeTruthy());
    const labels = [...document.querySelectorAll(".fw-pit-status dt")].map((n) => n.textContent);
    expect(labels).toEqual(expect.arrayContaining(["aria", "status", "tokens", "cache", "started"]));
    const order = ["aria", "status", "mantra", "route", "context", "tokens", "cache", "started"].filter((l) => labels.includes(l));
    expect(labels).toEqual(order);
    const row = (k: string) => document.querySelector(".fw-pit-status .fw-pit-fact[data-key='" + k + "'] dd")?.textContent;
    expect(row("aria")).toContain("c0ffee01".repeat(4));
    expect(row("started")).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
    expect(row("tokens")).toMatch(/^in .+ · out .+$/);
    const status = document.querySelector(".fw-pit-status")!;
    const actions = document.querySelector(".zr-pit-list")!;
    expect(status.compareDocumentPosition(actions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.querySelector('.fw-controls [data-action="new"]')!.textContent).toBe("New");
  });
});

describe("the queue pit", () => {
  const main = "c0ffee01".repeat(4);
  const filled = {
    epoch: "e1",
    len: 2,
    order: [5, 6],
    items: { "5": { state: "queued", text: "first thing\nmore" }, "6": { state: "committing", text: "second" } },
  };
  const openQueue = async () => {
    open("#/home/" + main);
    await waitFor(() => expect(document.querySelector(".fw-status-handle")).toBeTruthy());
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Open controls" }));
    });
    act(() => {
      fireEvent.click(document.querySelector(".zr-pit-row[data-action='queue']")!);
    });
  };

  it("says the message queue is empty when nothing waits", async () => {
    await openQueue();
    await waitFor(() => expect(screen.getByText("message queue is empty")).toBeTruthy());
  });

  it("lists the queued prompts with the pager's marks and drops one by id", async () => {
    await openQueue();
    act(() => core.setQueue(main, filled));
    await waitFor(() => expect(document.querySelectorAll(".zr-queue-row").length).toBe(2));
    const rows = [...document.querySelectorAll(".zr-queue-row")].map((r) => r.textContent);
    expect(rows).toEqual(["·first thing", "→second"]);
    fireEvent.click(document.querySelector(".zr-queue-row[data-id='5']")!);
    fireEvent.click(screen.getByRole("button", { name: "Drop" }));
    await waitFor(() => expect(document.querySelectorAll(".zr-queue-row").length).toBe(1));
    expect(core.calls.find((c) => c.method === "figaro.queue.delete")!.params).toEqual({ figaro_id: main, epoch: "e1", ids: [5] });
  });

  it("edits a prompt in place", async () => {
    await openQueue();
    act(() => core.setQueue(main, filled));
    await waitFor(() => expect(document.querySelectorAll(".zr-queue-row").length).toBe(2));
    fireEvent.click(document.querySelector(".zr-queue-row[data-id='5']")!);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Queued message" }), { target: { value: "better words" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(document.querySelector(".zr-queue-row[data-id='5']")!.textContent).toContain("better words"));
    expect(core.calls.find((c) => c.method === "figaro.queue.update")!.params).toEqual({ figaro_id: main, epoch: "e1", id: 5, text: "better words" });
  });

  it("says why when the daemon refuses a drop", async () => {
    await openQueue();
    act(() => core.setQueue(main, filled));
    await waitFor(() => expect(document.querySelectorAll(".zr-queue-row").length).toBe(2));
    fireEvent.click(document.querySelector(".zr-queue-row[data-id='6']")!);
    fireEvent.click(screen.getByRole("button", { name: "Drop" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("queue rm 6: committing"));
  });
});

describe("the state pit writes", () => {
  const openState = async () => {
    open("#/home/" + "c0ffee01".repeat(4));
    await waitFor(() => expect(document.querySelector(".fw-status-handle")).toBeTruthy());
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Open controls" }));
    });
    act(() => {
      fireEvent.click(screen.getByText("State"));
    });
    await waitFor(() => expect(document.querySelector(".zr-tree-row[data-id='mantra']")).toBeTruthy());
  };

  it("sets the mantra from a tap on its value, and the tree shows the new one", async () => {
    await openState();
    fireEvent.click(document.querySelector(".zr-tree-row[data-id='mantra']")!);
    const box = screen.getByRole("textbox", { name: "Value" }) as HTMLTextAreaElement;
    expect(box.value.startsWith('"')).toBe(true);
    fireEvent.change(box, { target: { value: "Edited from the web" } });
    fireEvent.click(screen.getByRole("button", { name: "Set" }));
    await waitFor(() => expect(document.querySelector(".zr-tree-row[data-id='mantra']")?.textContent).toContain("Edited from the web"));
    expect((core as MockCore & { sets?: { keys: string[] }[] }).sets?.[0]?.keys).toEqual(["mantra"]);
  });

  it("shows the refusal when a reserved key is tried, and keeps the editor open", async () => {
    await openState();
    fireEvent.click(screen.getByRole("button", { name: "Set a key" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Key" }), { target: { value: "system.model" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Value" }), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Set" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/^system\.model is read-only here: /));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Key" }));
  });

  it("reads the value as JSON when it parses and as a string when it does not, as the pager does", async () => {
    await openState();
    fireEvent.click(screen.getByRole("button", { name: "Set a key" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Key" }), { target: { value: "count" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Value" }), { target: { value: "42" } });
    fireEvent.click(screen.getByRole("button", { name: "Set" }));
    await waitFor(() => expect(document.querySelector(".zr-tree-row[data-id='count'] .zr-tree-value")?.textContent).toBe("42"));
    fireEvent.click(document.querySelector(".zr-tree-row[data-id='count']")!);
    expect((screen.getByRole("textbox", { name: "Value" }) as HTMLTextAreaElement).value).toBe("42");
    fireEvent.change(screen.getByRole("textbox", { name: "Value" }), { target: { value: "forty two" } });
    fireEvent.click(screen.getByRole("button", { name: "Set" }));
    await waitFor(() => expect(document.querySelector(".zr-tree-row[data-id='count'] .zr-tree-value")?.textContent).toBe('"forty two"'));
  });

  it("opens the editor on c over a leaf, and Escape returns to the tree", async () => {
    await openState();
    const tree = screen.getByRole("tree", { name: "Bound form" });
    tree.focus();
    let guard = 0;
    while (tree.querySelector("[data-cursor]")?.getAttribute("data-id") !== "mantra" && guard++ < 20) fireEvent.keyDown(tree, { key: "j" });
    fireEvent.keyDown(tree, { key: "c" });
    expect(screen.getByRole("textbox", { name: "Value" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Value" }), { key: "Escape" });
    expect(screen.getByRole("tree", { name: "Bound form" })).toBeTruthy();
  });
});
