import { render, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterEach, describe, expect, it } from "vitest";
import { AriaClient } from "figaro-forms/aria";
import type { Dial } from "figaro-forms";
import { App } from "../src/app";
import { bootAtom } from "zanni-react/jotai";
import { mock } from "./mock";

const refusal = "figaro.follow: aria cccb44ac-420c-4d2f-b39a-78ab25c426bf/@arias not found";

function narrowGrantDoor(): AriaClient {
  const core = mock.create({ step: 1, pageBytes: 3000 });
  const dial: Dial = async (events) => {
    const conn = await core.dial(events);
    return {
      send: (frame: string) => {
        const f = JSON.parse(frame);
        const target = String(f.params?.figaro_id ?? "");
        if ((f.method === "figaro.follow" || f.method === "figaro.form") && target.endsWith("@arias")) {
          setTimeout(() => events.message(JSON.stringify({ jsonrpc: "2.0", id: f.id, error: { code: -32000, message: refusal } })), 0);
          return;
        }
        conn.send(frame);
      },
      close: () => conn.close(),
    };
  };
  return new AriaClient({ dial, pageBytes: 24000, retryMinMs: 20, retryMaxMs: 40 });
}

afterEach(() => {
  window.location.hash = "";
});

describe("a topology the door refuses", () => {
  it("shows a no-access state in the left pane, never the raw JSON-RPC error", async () => {
    const client = narrowGrantDoor();
    window.location.hash = "#/";
    const store = createStore();
    store.set(bootAtom, { stores: { home: client }, store: "home", audioUrl: "audio", sttUrl: "stt", mark: "" });
    render(
      <Provider store={store}>
        <App />
      </Provider>,
    );
    await waitFor(() => expect(document.body.textContent).not.toContain("Loading the topology."), { timeout: 4500 });
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("figaro.follow");
    expect(text).not.toContain("@arias not found");
    expect(text).not.toMatch(/No topology: /);
    client.close();
  });
});
