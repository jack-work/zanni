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

describe("a link to a turn past the newest", () => {
  it("asks the door for no older page", async () => {
    const older: Frame[] = [];
    await open("#/gluck/" + MAIN + ":999", (f) => {
      if (f.method === "figaro.read" && f.params.at) older.push(f);
      return "pass";
    });
    await waitFor(() => expect(document.querySelector('.nodi-turn[data-turn="26"]')).toBeTruthy());
    const asked = await waitFor(() => expect(older.length).toBeGreaterThan(0), { timeout: 1500 }).then(
      () => true,
      () => false,
    );
    expect(asked, "turn 26 is the newest, so turn 999 is not on an older page").toBe(false);
  });
});
