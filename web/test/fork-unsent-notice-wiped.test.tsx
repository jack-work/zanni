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

describe("a fork whose first message the door refuses", () => {
  it("lands on the new aria and says the message was not sent", async () => {
    await open("#/gluck/" + MAIN, (f) => (f.method === "figaro.qua" && f.params.figaro_id !== MAIN ? { code: -32000, message: "the provider refused" } : "pass"));
    await waitFor(() => expect(document.querySelector(".fw-status-handle")).toBeTruthy());
    typed(":fork -- carry this thought over");
    await enter();
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/gluck\/(?!c0ffee01c0ffee01)/));
    await waitFor(() => expect(document.querySelector(".fw")!.getAttribute("data-link")).toBe("live"));
    await waitFor(() => expect(screen.getByLabelText("Message", { selector: "textarea" })).toBeTruthy());
    expect(core.sent ?? []).toEqual([]);
    await waitFor(() => expect(strip()).toContain("the first message was not sent"));
  });
});
