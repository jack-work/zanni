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
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(false);
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

describe("the message sheet", () => {
  const stubFetch = (handler: (url: string, init?: RequestInit) => Response | Promise<Response>) => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push(url);
      return handler(url, init);
    });
    return calls;
  };

  afterEach(() => vi.unstubAllGlobals());

  const tapped = async (selector: string) => {
    attend(1);
    await live();
    await waitFor(() => expect(document.querySelector(selector)).toBeTruthy());
    act(() => (document.querySelector(selector) as HTMLElement).click());
    await waitFor(() => expect(document.querySelector(".fw-sheet")).toBeTruthy());
  };

  it("opens on a tapped message of yours with play and re-transcribe", async () => {
    await tapped('.nodi-turn[data-turn="26"] .nodi-said');
    expect(document.querySelector(".fw-sheet")!.getAttribute("data-kind")).toBe("input");
    expect([...document.querySelectorAll(".fw-sheet-act")].map((b) => b.textContent)).toEqual(["Play", "Re-transcribe"]);
    expect(document.querySelector(".zr-sheet-title")!.textContent).toContain("Turn 26");
  });

  it("opens on a tapped reply with play only", async () => {
    await tapped('.nodi-turn[data-turn="26"] .nodi-prose');
    expect(document.querySelector(".fw-sheet")!.getAttribute("data-kind")).toBe("prose");
    expect([...document.querySelectorAll(".fw-sheet-act")].map((b) => b.textContent)).toEqual(["Play"]);
  });

  it("does not open when a link or a tool summary is what was tapped", async () => {
    attend(1);
    await live();
    await waitFor(() => expect(document.querySelector(".nodi-tool summary")).toBeTruthy());
    act(() => (document.querySelector(".nodi-tool summary") as HTMLElement).click());
    expect(document.querySelector(".fw-sheet")).toBeNull();
  });

  it("closes on Escape, the scrim and Close", async () => {
    await tapped('.nodi-turn[data-turn="26"] .nodi-said');
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.querySelector(".fw-sheet")).toBeNull();
    act(() => (document.querySelector('.nodi-turn[data-turn="26"] .nodi-said') as HTMLElement).click());
    act(() => (document.querySelector(".zr-scrim") as HTMLElement).click());
    expect(document.querySelector(".fw-sheet")).toBeNull();
    act(() => (document.querySelector('.nodi-turn[data-turn="26"] .nodi-said') as HTMLElement).click());
    act(() => screen.getByText("Close").click());
    expect(document.querySelector(".fw-sheet")).toBeNull();
  });

  it("re-transcribes the stored clip by its key and offers the new text for the composer", async () => {
    const calls = stubFetch(() => new Response(JSON.stringify({ text: "re-heard words", duration_ms: 900, audio_id: "x" }), { status: 200 }));
    await tapped('.nodi-turn[data-turn="26"] .nodi-said');
    fireEvent.change(input(), { target: { value: "typed" } });
    act(() => screen.getByText("Re-transcribe").click());
    await waitFor(() => expect(document.querySelector(".fw-sheet-text")!.textContent).toBe("re-heard words"));
    expect(calls[0]).toBe("stt/key/gluck/" + MAIN + "%3A26/in");
    act(() => screen.getByText("Use text").click());
    expect(document.querySelector(".fw-sheet")).toBeNull();
    expect(input().value).toBe("typed re-heard words");
  });

  it("says so when no recording is held under the key", async () => {
    stubFetch(() => new Response(JSON.stringify({ error: "no clip" }), { status: 404 }));
    await tapped('.nodi-turn[data-turn="26"] .nodi-said');
    act(() => screen.getByText("Re-transcribe").click());
    await waitFor(() => expect(document.querySelector(".fw-sheet-note")!.textContent).toBe("No recording for this message."));
    expect(document.querySelector(".fw-sheet-text")).toBeNull();
  });

  it("plays a reply where it is drawn, by the turn's own Play, and closes", async () => {
    stubFetch(() => new Response("", { status: 206 }));
    await tapped('.nodi-turn[data-turn="26"] .nodi-prose');
    act(() => (document.querySelector(".fw-sheet-act[data-action='play']") as HTMLElement).click());
    expect(document.querySelector(".fw-sheet")).toBeNull();
    expect(document.querySelector('.nodi-turn[data-turn="26"] .voce[data-for="26"]')).toBeTruthy();
  });

  it("plays your own clip inside the sheet", async () => {
    stubFetch(() => new Response("", { status: 206 }));
    await tapped('.nodi-turn[data-turn="26"] .nodi-said');
    act(() => (document.querySelector(".fw-sheet-act[data-action='play']") as HTMLElement).click());
    expect(document.querySelector(".fw-sheet .fw-sheet-player .voce")).toBeTruthy();
  });
});
