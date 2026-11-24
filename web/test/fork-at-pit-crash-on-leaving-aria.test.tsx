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

describe("leaving an aria with the pit on Fork at turn", () => {
  it("shows the list, the page does not throw", async () => {
    await open("#/gluck/" + MAIN);
    await waitFor(() => expect(document.querySelector(".fw-status-handle")).toBeTruthy());
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Open controls" }));
    });
    act(() => {
      fireEvent.click(screen.getByText("Fork at turn"));
    });
    expect(screen.getByRole("button", { name: /^Fork at \d+/ })).toBeTruthy();
    let thrown: unknown;
    try {
      await act(async () => {
        window.location.hash = "#/";
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown, "render threw on the way back to the list").toBeUndefined();
    expect(screen.getByText("Pick an aria to attend.")).toBeTruthy();
  });
});
