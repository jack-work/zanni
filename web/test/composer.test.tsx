import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app";
import { bootAtom } from "../src/state/boot";
import { draftAtom, SAVE_DELAY_MS } from "../src/state/composer";
import { mockDoor, type MockCore } from "./mock";
import type { AriaClient } from "figaro-forms/aria";

const MAIN = "c0ffee01".repeat(4);
let core: MockCore;
let client: AriaClient;

function attend(step: number) {
  ({ core, client } = mockDoor(step));
  window.location.hash = "#/gluck/" + MAIN;
  const store = createStore();
  store.set(bootAtom, { stores: { gluck: client }, store: "gluck", audioUrl: "audio", sttUrl: "stt", mark: "" });
  return render(
    <Provider store={store}>
      <App />
    </Provider>,
  );
}

const input = () => screen.getByLabelText("Message", { selector: "textarea" }) as HTMLTextAreaElement;
const live = () => waitFor(() => expect(document.querySelector(".fw")!.getAttribute("data-link")).toBe("live"));

afterEach(() => {
  client?.close();
  window.location.hash = "";
  window.localStorage.clear();
  vi.useRealTimers();
});

describe("the composer", () => {
  it("sends the draft, clears it, and the reader's turn appears", async () => {
    attend(1);
    await live();
    fireEvent.change(input(), { target: { value: "please run the tests" } });
    expect((screen.getByText("Send") as HTMLButtonElement).disabled).toBe(false);
    act(() => screen.getByText("Send").click());
    await waitFor(() => expect(core.sent?.[0]?.text).toBe("please run the tests"));
    await waitFor(() => expect(input().value).toBe(""));
    await waitFor(() => expect(document.querySelector('.nodi-turn[data-turn="27"]')).toBeTruthy(), { timeout: 5000 });
    expect(document.querySelector('.nodi-turn[data-turn="27"] .nodi-input')!.textContent).toContain("please run the tests");
  });

  it("sends on Enter, breaks the line on Shift+Enter", async () => {
    attend(1);
    await live();
    fireEvent.change(input(), { target: { value: "one" } });
    fireEvent.keyDown(input(), { key: "Enter", shiftKey: true });
    expect(core.sent ?? []).toEqual([]);
    fireEvent.keyDown(input(), { key: "Enter" });
    await waitFor(() => expect(core.sent?.[0]?.text).toBe("one"));
  });

  it("does not send an empty draft", async () => {
    attend(1);
    await live();
    fireEvent.keyDown(input(), { key: "Enter" });
    fireEvent.change(input(), { target: { value: "   " } });
    fireEvent.keyDown(input(), { key: "Enter" });
    await new Promise((r) => setTimeout(r, 50));
    expect(core.sent ?? []).toEqual([]);
  });

  it("shows the strip while a turn runs, steers, and stops with or without the queue", async () => {
    attend(150);
    await live();
    expect(document.querySelector(".fw-strip")).toBeNull();
    fireEvent.change(input(), { target: { value: "please run the build" } });
    act(() => screen.getByText("Send").click());
    await waitFor(() => expect(document.querySelector(".fw-strip[data-kind='running']")).toBeTruthy(), { timeout: 5000 });
    expect(document.querySelector(".fw")!.hasAttribute("data-running")).toBe(true);
    expect(screen.getByText("Steer")).toBeTruthy();
    expect(input().placeholder).toBe("Steer figaro");
    expect(document.querySelector(".fw-strip-text")!.textContent).not.toBe("");
    expect(document.querySelector(".fw-strip-time")!.textContent).toMatch(/^\d+:\d\d$/);
    act(() => (document.querySelector(".fw-stop:not(.fw-stop-clear)") as HTMLElement).click());
    await waitFor(() => expect(core.interrupts).toEqual(["keep"]));
    await waitFor(() => expect(document.querySelector(".fw-strip")).toBeNull(), { timeout: 5000 });
    fireEvent.change(input(), { target: { value: "again" } });
    act(() => screen.getByText("Send").click());
    await waitFor(() => expect(document.querySelector(".fw-strip[data-kind='running']")).toBeTruthy(), { timeout: 5000 });
    const all = document.querySelector<HTMLElement>(".fw-stop-clear")!;
    expect(all.getAttribute("aria-label")).toBe("Stop and clear the queue");
    act(() => all.click());
    await waitFor(() => expect(core.interrupts).toEqual(["keep", "clear"]));
  });

  it("forks at the end from the header and at a turn from its action bar, and opens the alternative", async () => {
    attend(1);
    await live();
    await waitFor(() => expect(document.querySelector(".fw-fork")).toBeTruthy());
    act(() => (document.querySelector(".fw-fork") as HTMLElement).click());
    await waitFor(() => expect(window.location.hash).not.toContain(MAIN));
    expect(window.location.hash.startsWith("#/gluck/")).toBe(true);
    const calls = core.calls.filter((c) => c.method === "figaro.fork");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.params.at_turn).toBeUndefined();
  });

  it("forks at the turn whose Fork here was pressed", async () => {
    attend(1);
    await live();
    await waitFor(() => expect(document.querySelectorAll(".fw-fork-here").length).toBeGreaterThan(0));
    const turn = document.querySelector<HTMLElement>('.nodi-turn[data-turn="26"] .fw-fork-here')!;
    act(() => turn.click());
    await waitFor(() => expect(core.calls.some((c) => c.method === "figaro.fork")).toBe(true));
    expect(core.calls.find((c) => c.method === "figaro.fork")!.params.at_turn).toBe(26);
  });

  it("keeps the composer's height on the root for scroll padding", async () => {
    attend(1);
    await live();
    expect(document.documentElement.style.getPropertyValue("--fw-composer-h")).toMatch(/px$/);
  });
});

describe("drafts", () => {
  it("save after the delay, come back for a new page load, and clear on empty", () => {
    vi.useFakeTimers();
    const store = createStore();
    const key = "gluck/aria-one";
    store.set(draftAtom(key), "half a thought");
    expect(window.localStorage.getItem("fw.draft." + key)).toBeNull();
    vi.advanceTimersByTime(SAVE_DELAY_MS - 1);
    expect(window.localStorage.getItem("fw.draft." + key)).toBeNull();
    vi.advanceTimersByTime(1);
    expect(window.localStorage.getItem("fw.draft." + key)).toBe("half a thought");
    store.set(draftAtom(key), "");
    expect(window.localStorage.getItem("fw.draft." + key)).toBeNull();
  });

  it("one draft per aria", () => {
    const store = createStore();
    store.set(draftAtom("gluck/a"), "for a");
    store.set(draftAtom("gluck/b"), "for b");
    expect(store.get(draftAtom("gluck/a"))).toBe("for a");
    expect(store.get(draftAtom("gluck/b"))).toBe("for b");
  });
});
