import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterEach, describe, expect, it } from "vitest";
import { AriaClient } from "figaro-forms/aria";
import type { Dial } from "figaro-forms";
import { App } from "../src/app";
import { bootAtom } from "zanni-react/jotai";
import { mock, type MockCore } from "./mock";

const MAIN = "c0ffee01".repeat(4);
type Frame = { id: number; method: string; params: Record<string, unknown> };
type Rule = (f: Frame) => "pass" | "hold" | { code: number; message: string };

let core: MockCore;
let client: AriaClient;
let held: (() => void)[] = [];

async function open(hash: string, rule: Rule = () => "pass") {
  core = mock.create({ step: 1, pageBytes: 3000 });
  const dial: Dial = async (events) => {
    const conn = await core.dial(events);
    return {
      send: (frame: string) => {
        const f = JSON.parse(frame) as Frame;
        const verdict = rule(f);
        if (verdict === "pass") conn.send(frame);
        else if (verdict === "hold") held.push(() => conn.send(frame));
        else setTimeout(() => events.message(JSON.stringify({ jsonrpc: "2.0", id: f.id, error: verdict })), 0);
      },
      close: () => conn.close(),
    };
  };
  client = new AriaClient({ dial, pageBytes: 24000, retryMinMs: 20, retryMaxMs: 40 });
  window.location.hash = hash;
  const store = createStore();
  store.set(bootAtom, { stores: { gluck: client }, store: "gluck", audioUrl: "audio", sttUrl: "stt", mark: "" });
  render(
    <Provider store={store}>
      <App />
    </Provider>,
  );
  await waitFor(() => expect(document.querySelector(".fw")!.getAttribute("data-link")).toBe("live"));
}

const box = () => screen.getByLabelText("Message", { selector: "textarea" }) as HTMLTextAreaElement;
const typed = (text: string) => fireEvent.change(box(), { target: { value: text } });
const enter = () =>
  act(async () => {
    fireEvent.keyDown(box(), { key: "Enter" });
  });
const strip = () => document.querySelector(".zr-strip-text")?.textContent ?? "";

afterEach(() => {
  client?.close();
  held = [];
  window.location.hash = "";
  window.localStorage.clear();
});

describe("an older page asked for right after the last one", () => {
  it("keeps the reader's place when its reply lands after the last page's 400 ms settle", async () => {
    let holding = false;
    await open("#/gluck/" + MAIN, (f) => (holding && f.method === "figaro.read" ? "hold" : "pass"));
    const turns = () => [...document.querySelectorAll<HTMLElement>(".nodi-turn")];
    await waitFor(() => expect(turns().length).toBeGreaterThan(0));
    const real = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (!this.classList.contains("nodi-turn")) return real.call(this);
      const at = turns().indexOf(this as HTMLElement) * 100;
      return { ...real.call(this), top: at, y: at, bottom: at + 100, height: 100 } as DOMRect;
    };
    try {
      const scroller = document.querySelector<HTMLElement>("[data-zr-scroll]")!;
      const older = () => screen.getByRole("button", { name: "Earlier turns" });
      await waitFor(() => expect(window.__figchat?.firstFrame).toBeGreaterThan(0));
      fireEvent.wheel(scroller, { deltaY: -400 });
      await act(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
      scroller.scrollTop = 0;
      const before = turns().length;
      fireEvent.click(older());
      await waitFor(() => expect(turns().length).toBeGreaterThan(before));
      const first = scroller.scrollTop;
      expect(first, "the first page keeps the place").toBe(100 * (turns().length - before));
      const between = turns().length;
      holding = true;
      fireEvent.click(older());
      await waitFor(() => expect(held.length).toBe(1));
      await new Promise((r) => setTimeout(r, 450));
      holding = false;
      await act(async () => {
        held.splice(0).forEach((go) => go());
      });
      await waitFor(() => expect(turns().length).toBeGreaterThan(between));
      expect(scroller.scrollTop - first, "the second page keeps the place").toBe(100 * (turns().length - between));
    } finally {
      Element.prototype.getBoundingClientRect = real;
    }
  });
});
