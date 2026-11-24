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

async function open(hash: string, rule: Rule = () => "pass", callTimeoutMs = 10000) {
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
  client = new AriaClient({ dial, pageBytes: 24000, retryMinMs: 20, retryMaxMs: 40, callTimeoutMs });
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

describe("a send the door never answers", () => {
  it("says it was not sent without printing the RPC method name", async () => {
    await open("#/gluck/" + MAIN, (f) => (f.method === "figaro.qua" ? "hold" : "pass"), 400);
    await waitFor(() => expect(document.querySelector(".fw-status-handle")).toBeTruthy());
    typed("are you there");
    await enter();
    await waitFor(() => expect(strip()).toContain("Not sent"), { timeout: 3000 });
    expect(strip()).not.toContain("figaro.qua");
    expect(box().value).toBe("are you there");
  });
});
