import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app";
import { bootAtom } from "zanni-react/jotai";
import { dictatedAtom, draftAtom, SAVE_DELAY_MS } from "zanni-react/jotai";
import { mockDoor, type MockCore } from "./mock";
import type { AriaClient } from "figaro-forms/aria";
import { glyphs } from "figaro-forms/glyphs";

const MAIN = "c0ffee01".repeat(4);
let core: MockCore;
let client: AriaClient;
let held: ReturnType<typeof createStore>;

function attend(step: number) {
  ({ core, client } = mockDoor(step));
  window.location.hash = "#/home/" + MAIN;
  const store = createStore();
  held = store;
  store.set(bootAtom, { stores: { home: client }, store: "home", audioUrl: "audio", sttUrl: "stt", mark: "" });
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
    act(() => screen.getByRole("button", { name: "Send" }).click());
    await waitFor(() => expect(core.sent?.[0]?.text).toBe("please run the tests"));
    await waitFor(() => expect(input().value).toBe(""));
    await waitFor(() => expect(document.querySelector('.nodi-turn[data-turn="27"]')).toBeTruthy(), { timeout: 5000 });
    expect(document.querySelector('.nodi-turn[data-turn="27"] .nodi-input')!.textContent).toContain("please run the tests");
  });

  it("names the dictation clip when the sent text is the dictated text, and only then", async () => {
    attend(1);
    await live();
    held.set(dictatedAtom("home/" + MAIN), { id: "202611-0123456789abcdef", text: "say this" });
    fireEvent.change(input(), { target: { value: "say this " } });
    fireEvent.keyDown(input(), { key: "Enter" });
    await waitFor(() => expect(core.calls.filter((c) => c.method === "figaro.qua")).toHaveLength(1));
    expect(core.calls.find((c) => c.method === "figaro.qua")!.params.dictation).toBe("202611-0123456789abcdef");
    await waitFor(() => expect(held.get(dictatedAtom("home/" + MAIN))).toBeNull());
    held.set(dictatedAtom("home/" + MAIN), { id: "202611-0123456789abcdef", text: "say this" });
    fireEvent.change(input(), { target: { value: "say this, edited" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    await waitFor(() => expect(core.calls.filter((c) => c.method === "figaro.qua")).toHaveLength(2));
    expect(core.calls.filter((c) => c.method === "figaro.qua")[1]!.params.dictation).toBeUndefined();
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

  it("carries the working line and Stop in the status bar while a turn runs, and the pit stops and clears the queue", async () => {
    attend(150);
    await live();
    expect(document.querySelector(".zr-strip")).toBeNull();
    expect(document.querySelector(".fw-status-line")).toBeNull();
    expect(document.querySelector(".fw-status-stop")).toBeNull();
    fireEvent.change(input(), { target: { value: "please run the build" } });
    act(() => screen.getByRole("button", { name: "Send" }).click());
    await waitFor(() => expect(document.querySelector(".fw-status[data-state='running'] .fw-status-line")).toBeTruthy(), { timeout: 5000 });
    expect(document.querySelector(".zr-strip")).toBeNull();
    expect(document.querySelector(".fw")!.hasAttribute("data-running")).toBe(true);
    expect(screen.getByRole("button", { name: "Steer" })).toBeTruthy();
    expect(input().placeholder).toBe("Steer figaro");
    expect(document.querySelector(".fw-status-line")!.textContent).not.toBe("");
    act(() => (document.querySelector(".fw-status-stop") as HTMLElement).click());
    await waitFor(() => expect(core.interrupts).toEqual(["keep"]));
    await waitFor(() => expect(document.querySelector(".fw-status-stop")).toBeNull(), { timeout: 5000 });
    fireEvent.change(input(), { target: { value: "again" } });
    act(() => screen.getByRole("button", { name: "Send" }).click());
    await waitFor(() => expect(document.querySelector(".fw-status-stop")).toBeTruthy(), { timeout: 5000 });
    act(() => (document.querySelector(".zr-grip") as HTMLElement).click());
    await waitFor(() => expect(document.querySelector('[data-action="stop-all"]')).toBeTruthy());
    act(() => (document.querySelector('[data-action="stop-all"]') as HTMLElement).click());
    await waitFor(() => expect(core.interrupts).toEqual(["keep", "clear"]));
  });
  it("forks at the end from the header and at a turn from its action bar, and opens the alternative", async () => {
    attend(1);
    await live();
    await waitFor(() => expect(document.querySelector(".fw-fork")).toBeTruthy());
    act(() => (document.querySelector(".fw-fork") as HTMLElement).click());
    await waitFor(() => expect(window.location.hash).not.toContain(MAIN));
    expect(window.location.hash.startsWith("#/home/")).toBe(true);
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

  it("creates a new figaro from the state pit: forks the chosen root at turn 1 with outfits, sends the first message, attends it", async () => {
    attend(1);
    await live();
    act(() => (document.querySelector(".zr-grip") as HTMLElement).click());
    await waitFor(() => expect(document.querySelector('[data-action="new"]')).toBeTruthy());
    act(() => (document.querySelector('[data-action="new"]') as HTMLElement).click());
    expect(document.querySelector(".zr-pit")).toBeNull();
    await waitFor(() => expect(document.querySelector(".fw-new-form")).toBeTruthy());
    const form = document.querySelector<HTMLFormElement>(".fw-new-form")!;
    const outfits = form.querySelector<HTMLInputElement>("input")!;
    const first = form.querySelector<HTMLTextAreaElement>("textarea")!;
    act(() => {
      fireEvent.change(outfits, { target: { value: "sonn5-kic" } });
      fireEvent.change(first, { target: { value: "hello there" } });
    });
    act(() => form.querySelector<HTMLButtonElement>("button[type=submit]")!.click());
    await waitFor(() => expect(window.location.hash).not.toContain(MAIN));
    const fork = core.calls.find((c) => c.method === "figaro.fork")!;
    expect(fork.params.figaro_id).toBe(MAIN);
    expect(fork.params.at_turn).toBe(1);
    expect(fork.params.outfits).toEqual(["sonn5-kic"]);
    await waitFor(() => expect(core.calls.some((c) => c.method === "figaro.qua" && c.params.text === "hello there")).toBe(true));
    await waitFor(() => expect(document.querySelector(".fw-new-form")).toBeFalsy());
  });

  it("keeps the composer's height on the root for scroll padding", async () => {
    attend(1);
    await live();
    expect(document.documentElement.style.getPropertyValue("--zr-composer-h")).toMatch(/px$/);
  });
});

describe("drafts", () => {
  it("save after the delay, come back for a new page load, and clear on empty", () => {
    vi.useFakeTimers();
    const store = createStore();
    const key = "home/aria-one";
    store.set(draftAtom(key), "half a thought");
    expect(window.localStorage.getItem("fw.draft." + key)).toBeNull();
    vi.advanceTimersByTime(SAVE_DELAY_MS - 1);
    expect(window.localStorage.getItem("fw.draft." + key)).toBeNull();
    vi.advanceTimersByTime(1);
    expect(window.localStorage.getItem("fw.draft." + key)).toBe("half a thought");
    store.set(draftAtom(key), "");
    expect(window.localStorage.getItem("fw.draft." + key)).toBeNull();
  });

  it("save at once when the page is closed or hidden", () => {
    const store = createStore();
    const key = "home/aria-three";
    store.set(draftAtom(key), "typed a moment ago");
    expect(window.localStorage.getItem("fw.draft." + key)).toBeNull();
    window.dispatchEvent(new Event("pagehide"));
    expect(window.localStorage.getItem("fw.draft." + key)).toBe("typed a moment ago");
  });

  it("hold the sent text until the door has taken it", async () => {
    attend(1);
    await live();
    const held = "fw.unsent.home/" + MAIN;
    fireEvent.change(input(), { target: { value: "please run the tests" } });
    act(() => screen.getByRole("button", { name: "Send" }).click());
    expect(window.localStorage.getItem(held)).toBe("please run the tests");
    expect(input().value).toBe("");
    await waitFor(() => expect(core.sent?.[0]?.text).toBe("please run the tests"));
    await waitFor(() => expect(window.localStorage.getItem(held)).toBeNull());
  });

  it("bring back a send the page was closed on, until the draft is cleared", async () => {
    window.localStorage.setItem("fw.unsent.home/aria-two", "never sent");
    vi.resetModules();
    const fresh = await import("zanni-react/jotai");
    const store = createStore();
    expect(store.get(fresh.draftAtom("home/aria-two"))).toBe("never sent");
    store.set(fresh.draftAtom("home/aria-two"), "");
    expect(window.localStorage.getItem("fw.unsent.home/aria-two")).toBeNull();
  });

  it("one draft per aria", () => {
    const store = createStore();
    store.set(draftAtom("home/a"), "for a");
    store.set(draftAtom("home/b"), "for b");
    expect(store.get(draftAtom("home/a"))).toBe("for a");
    expect(store.get(draftAtom("home/b"))).toBe("for b");
  });
});

describe("the buttons under a message", () => {
  const stubFetch = (handler: (url: string, init?: RequestInit) => Response | Promise<Response>) => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      calls.push(url);
      return handler(url, init);
    });
    return calls;
  };

  afterEach(() => vi.unstubAllGlobals());

  const under = '.nodi-turn[data-turn="26"] ';
  const ready = async () => {
    attend(1);
    await live();
    await waitFor(() => expect(document.querySelector(under + '.fw-inline[data-kind="input"]')).toBeTruthy());
  };
  const press = (selector: string) => act(() => (document.querySelector(selector) as HTMLElement).click());

  it("sit under a message of yours with play and re-transcribe; a reply has its play in the turn head, not a row of its own", async () => {
    await ready();
    const mine = [...document.querySelectorAll(under + '.fw-inline[data-kind="input"] .fw-inline-btn')].map((b) => b.getAttribute("data-action"));
    expect(mine).toEqual(["play", "retranscribe"]);
    expect(document.querySelector('.fw-inline[data-kind="prose"]')).toBeNull();
    expect(document.querySelector(under + ".nodi-turn-head .fw-play-icon")!.getAttribute("aria-label")).toBe("Play inquiry and reply");
    expect(document.querySelector(under + ".nodi-turn-body .fw-output-play [data-action=\"play\"]")!.getAttribute("aria-label")).toBe("Play reply");
    expect(document.querySelector(".zr-scrim")).toBeNull();
    expect(document.querySelector(".fw-sheet")).toBeNull();
    expect(document.querySelector(under + '.fw-inline [data-action="play"]')!.textContent).toBe("\uf028");
    expect(document.querySelector(under + '.fw-inline [data-action="retranscribe"]')!.textContent).toBe("↩");
    expect(document.querySelector(".zr-send")!.textContent).toBe("✎");
  });

  it("do not open anything when a message is tapped", async () => {
    await ready();
    press(under + ".nodi-said");
    expect(document.querySelector(".zr-sheet, .zr-scrim")).toBeNull();
  });

  it("re-transcribe the stored clip by its key and offer the new text for the composer", async () => {
    const calls = stubFetch(() => new Response(JSON.stringify({ text: "re-heard words", duration_ms: 900, audio_id: "x" }), { status: 200 }));
    await ready();
    fireEvent.change(input(), { target: { value: "typed" } });
    press(under + '.fw-inline[data-kind="input"] [data-action="retranscribe"]');
    await waitFor(() => expect(document.querySelector(".fw-inline-heard")!.textContent).toContain("re-heard words"));
    expect(calls[0]).toBe("stt/key/home/" + MAIN + "%3A26/in");
    press('.fw-inline-heard [data-action="use"]');
    expect(document.querySelector(".fw-inline-heard")).toBeNull();
    expect(input().value).toBe("typed re-heard words");
  });

  it("say so when no recording is held under the key", async () => {
    stubFetch(() => new Response(JSON.stringify({ error: "no clip" }), { status: 404 }));
    await ready();
    press(under + '.fw-inline[data-kind="input"] [data-action="retranscribe"]');
    await waitFor(() => expect(document.querySelector(".fw-inline-note")!.textContent).toBe("No recording for this message."));
    expect(document.querySelector(".fw-inline-heard")).toBeNull();
  });

  it("play a reply where it is drawn", async () => {
    stubFetch(() => new Response("", { status: 206 }));
    await ready();
    press(under + ".fw-output-play [data-action=\"play\"]");
    expect(document.querySelector('.nodi-turn[data-turn="26"] .voce[data-for="26"]')).toBeTruthy();
  });

  it("play inquiry then reply from the top button", async () => {
    stubFetch(() => new Response("", { status: 206 }));
    await ready();
    press(under + ".nodi-turn-head .fw-play-icon");
    await waitFor(() => expect(document.querySelector(under + '.fw-inline[data-kind="input"] .fw-inline-player .voce')).toBeTruthy());
  });

  it("play your own clip right under it", async () => {
    stubFetch(() => new Response("", { status: 206 }));
    await ready();
    press(under + '.fw-inline[data-kind="input"] [data-action="play"]');
    expect(document.querySelector(under + '.fw-inline[data-kind="input"] .fw-inline-player .voce')).toBeTruthy();
  });

  it("give way to the large Play in hands-free mode", async () => {
    await ready();
    expect(document.querySelector(".fw-play-big")).toBeNull();
    act(() => (document.querySelector(".zr-grip") as HTMLElement).click());
    await waitFor(() => expect(document.querySelector(".fw-hands")).toBeTruthy());
    press(".fw-hands");
    await waitFor(() => expect(document.querySelector(".fw-inline")).toBeNull());
    expect(document.querySelectorAll(".fw-play-big").length).toBeGreaterThan(0);
  });
});

describe("the composer's pills", () => {
  it("draws the pills it has, none of them disabled, and no pill that does nothing", async () => {
    attend(1);
    await live();
    const pills = [...document.querySelectorAll<HTMLButtonElement>(".zr-pill")];
    expect(pills.map((p) => p.getAttribute("aria-label"))).toEqual(["Attach", "Command", "Send"]);
    expect(pills.some((p) => p.disabled)).toBe(false);
  });

  it("gives every pill glyph, pit row glyph and message button glyph the ink-centring box", async () => {
    attend(1);
    await live();
    const g = document.querySelector<HTMLElement>(".zr-send .zr-ink")!;
    expect(g.textContent).toBe("✎");
    expect(g.getAttribute("aria-hidden")).toBe("true");
    expect(g.hasAttribute("style")).toBe(false);
    expect(g.hasAttribute("data-ink")).toBe(false);
    expect(document.querySelector(".fw-mic .zr-ink")!.textContent).toBe(glyphs.voice);
  });
});

describe("a missing aria", () => {
  it("offers no composer, only the way back", async () => {
    ({ core, client } = mockDoor(1));
    window.location.hash = "#/home/" + "f".repeat(32);
    const store = createStore();
    store.set(bootAtom, { stores: { home: client }, store: "home", audioUrl: "audio", sttUrl: "stt", mark: "" });
    render(
      <Provider store={store}>
        <App />
      </Provider>,
    );
    await waitFor(() => expect(["gone", "refused"]).toContain(document.querySelector(".fw")!.getAttribute("data-link")));
    expect(document.querySelector(".zr-composer")).toBeNull();
    expect(document.querySelector(".fw-hands")).toBeNull();
    expect(document.querySelector(".fw-back")).toBeTruthy();
  });
});
