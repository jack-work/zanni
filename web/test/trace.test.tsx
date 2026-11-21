import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app";
import { AriaClient } from "figaro-forms/aria";
import { SESSION_HEADER, beginAction, configureTraces, flushTraces, sessionId, traceDial, traceHeaders, traced } from "zanni-react";
import { bootAtom, retranscribe } from "zanni-react/jotai";
import { mockDoor } from "./mock";

const MAIN = "c0ffee01".repeat(4);
const SHAPE = /^00-([0-9a-f]{32})-([0-9a-f]{16})-01$/;

interface Posted {
  url: string;
  headers: Record<string, string>;
  body: any;
}

let posted: Posted[];
let seen: Record<string, string>[];

function mockOtel(status = 200) {
  posted = [];
  seen = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const otel = new URL(url, document.baseURI).pathname.includes("/otel/");
      if (!otel) seen.push(init.headers as Record<string, string>);
      if (!otel) return new Response(JSON.stringify({ text: "hi" }), { status: 200 });
      posted.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) });
      return new Response("{}", { status });
    }),
  );
}

const spansOf = () => posted.filter((p) => p.url.endsWith("/otel/v1/traces")).flatMap((p) => p.body.resourceSpans.flatMap((r: any) => r.scopeSpans.flatMap((s: any) => s.spans)));
const logsOf = () => posted.filter((p) => p.url.endsWith("/otel/v1/logs")).flatMap((p) => p.body.resourceLogs.flatMap((r: any) => r.scopeLogs.flatMap((s: any) => s.logRecords)));
const attr = (span: any, key: string) => span.attributes.find((a: any) => a.key === key)?.value.stringValue;

beforeEach(() => {
  mockOtel();
  configureTraces("otel");
});

afterEach(() => {
  configureTraces(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.location.hash = "";
  window.localStorage.clear();
});

describe("browser spans", () => {
  it("send: one root span reaches /chat/otel with the session, and the same trace rides figaro.qua", async () => {
    const { core, client } = mockDoor(1);
    const traced = new AriaClient({ dial: traceDial(core.dial), pageBytes: 24000, retryMinMs: 20, retryMaxMs: 40 });
    window.location.hash = "#/gluck/" + MAIN;
    const store = createStore();
    store.set(bootAtom, { stores: { gluck: traced }, store: "gluck", audioUrl: "audio", sttUrl: "stt", mark: "" });
    render(
      <Provider store={store}>
        <App />
      </Provider>,
    );
    await waitFor(() => expect(document.querySelector(".fw")!.getAttribute("data-link")).toBe("live"));
    fireEvent.change(screen.getByLabelText("Message", { selector: "textarea" }), { target: { value: "secret words" } });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Send" })));
    await waitFor(() => expect(core.sent?.[0]?.text).toBe("secret words"));

    const qua = core.calls.find((c) => c.method === "figaro.qua")!;
    const [, traceId, spanId] = SHAPE.exec(String(qua.params.traceparent))!;

    flushTraces();
    await waitFor(() => expect(spansOf().length).toBe(1));
    const span = spansOf()[0];
    expect(span.name).toBe("send");
    expect(span.traceId).toBe(traceId);
    expect(span.spanId).toBe(spanId);
    expect(span.parentSpanId).toBeUndefined();
    expect(attr(span, "figchat.session")).toBe(sessionId);
    expect(attr(span, "figaro.aria")).toBe(MAIN);
    expect(span.status.code).toBe(1);

    const first = posted.find((p) => p.url.endsWith("/otel/v1/traces"))!;
    expect(new URL(first.url).pathname).toBe("/otel/v1/traces");
    expect(first.headers[SESSION_HEADER]).toBe(sessionId);
    expect(first.body.resourceSpans[0].resource.attributes).toEqual([{ key: "service.name", value: { stringValue: "figaro-web" } }]);
    expect(JSON.stringify(posted)).not.toContain("secret words");
    client.close();
    traced.close();
  });

  it("fetches to stt carry traceparent and the session header", async () => {
    await traced("dictate", { "figaro.aria": MAIN }, () => retranscribe("stt", "gluck/abc:1/in"));
    expect(seen[0]!.traceparent).toMatch(SHAPE);
    expect(seen[0]![SESSION_HEADER]).toBe(sessionId);
    flushTraces();
    await waitFor(() => expect(spansOf().length).toBe(1));
    expect(spansOf()[0].name).toBe("dictate");
    expect(SHAPE.exec(seen[0]!.traceparent!)![1]).toBe(spansOf()[0].traceId);
  });

  it("a failed action is an error span plus a log record on the same trace, with no message text", async () => {
    await expect(traced("attach", {}, async () => Promise.reject(Object.assign(new Error("https://x/?token=hush"), { status: 413 })))).rejects.toThrow();
    flushTraces();
    await waitFor(() => expect(spansOf().length).toBe(1));
    const span = spansOf()[0];
    expect(span.status.code).toBe(2);
    expect(JSON.stringify(posted)).not.toContain("hush");
    const log = logsOf()[0];
    expect(log.severityText).toBe("ERROR");
    expect(log.traceId).toBe(span.traceId);
    expect(log.spanId).toBe(span.spanId);
    expect(attr(log, "figchat.session")).toBe(sessionId);
  });

  it("batches every 10 s and on pagehide, through a beacon", async () => {
    vi.useFakeTimers();
    beginAction("fork").end();
    expect(posted).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(9_900);
    expect(posted).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(200);
    expect(spansOf()).toHaveLength(1);

    const beacon = vi.fn(() => true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: beacon });
    beginAction("speak").end();
    window.dispatchEvent(new Event("pagehide"));
    expect(beacon).toHaveBeenCalledTimes(1);
    const [url, blob] = beacon.mock.calls[0] as unknown as [string, Blob];
    expect(url).toMatch(/\/otel\/v1\/traces$/);
    expect(blob.type).toBe("application/json");
    expect(JSON.parse(await blob.text()).resourceSpans[0].scopeSpans[0].spans[0].name).toBe("speak");
  });

  it("stops exporting after the edge refuses the route", async () => {
    mockOtel(404);
    beginAction("send").end();
    flushTraces();
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    await Promise.resolve();
    beginAction("send").end();
    flushTraces();
    expect(posted).toHaveLength(1);
  });

  it("stamps only figaro.qua frames and leaves other frames alone", async () => {
    const sent: string[] = [];
    const dial = traceDial(async () => ({ send: (f) => void sent.push(f), close: () => {} }));
    const socket = await dial({ message: () => {}, closed: () => {} });
    const action = beginAction("send");
    socket.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "figaro.qua", params: { figaro_id: MAIN, text: "x" } }));
    socket.send(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "figaro.fork", params: { figaro_id: MAIN } }));
    expect(JSON.parse(sent[0]!).params.traceparent).toBe(action.traceparent);
    expect(JSON.parse(sent[1]!).params.traceparent).toBeUndefined();
    expect(traceHeaders().traceparent).toBe(action.traceparent);
    action.end();
  });
});
