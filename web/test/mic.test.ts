import { describe, expect, it } from "vitest";
import { joinDictation, micFault, retranscribe, streamFault, SttError, type MicSnapshot } from "zanni-react/jotai";
import { Dictation, FINISH_WAIT_MS, QUEUE_FRAMES, dictationSocketUrl, type Capture, type DictationDeps, type SocketLike } from "../../packages/react/src/jotai/lib/dictation";

class FakeSocket implements SocketLike {
  binaryType = "blob";
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: (string | ArrayBuffer)[] = [];
  closed: number[] = [];
  constructor(readonly target: string) {}
  send(data: string | ArrayBuffer) {
    this.sent.push(data);
  }
  close(code?: number) {
    this.readyState = 3;
    this.closed.push(code ?? 0);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  say(frame: unknown) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
  texts() {
    return this.sent.filter((x): x is string => typeof x === "string").map((x) => JSON.parse(x) as { type: string });
  }
  frames() {
    return this.sent.filter((x): x is ArrayBuffer => typeof x !== "string");
  }
}

function rig(over: Partial<DictationDeps> = {}) {
  const tracks: string[] = [];
  const recording: boolean[] = [];
  const levels: number[] = [];
  const sockets: FakeSocket[] = [];
  const timers: { fn: () => void; ms: number }[] = [];
  let push: (pcm: ArrayBuffer, level: number) => void = () => {};
  const stopped: string[] = [];
  const stream = { getTracks: () => [{ stop: () => tracks.push("stopped") }] } as unknown as MediaStream;
  const deps: DictationDeps = {
    media: { devices: { getUserMedia: () => Promise.resolve(stream) }, streaming: true },
    now: () => 1000,
    open: (target) => {
      const s = new FakeSocket(target);
      sockets.push(s);
      return s;
    },
    capture: async (_s, onFrame) => {
      push = onFrame;
      const cap: Capture = { stop: () => stopped.push("capture") };
      return cap;
    },
    recording: (on) => recording.push(on),
    level: (v) => levels.push(v),
    setTimeout: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimeout: () => {},
    ...over,
  };
  const mic = new Dictation(deps);
  const seen: MicSnapshot[] = [];
  mic.subscribe((s) => seen.push(s));
  return { mic, tracks, recording, levels, sockets, timers, stopped, seen, frame: (n = 1280, level = 0.5) => push(new ArrayBuffer(n), level) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const frame = (type: string, rest: object = {}) => ({ type, ...rest });

describe("streaming dictation", () => {
  it("opens the socket when the mic arms, meters at once, and fills the text before the user stops", async () => {
    const r = rig();
    const got: [string, boolean][] = [];
    expect(r.mic.snapshot().state).toBe("idle");
    r.mic.toggle("gluck/a", (t, f) => got.push([t, f]));
    expect(r.sockets).toHaveLength(1);
    expect(r.sockets[0]!.target).toBe("gluck/a");
    expect(r.sockets[0]!.binaryType).toBe("arraybuffer");
    expect(r.mic.snapshot().state).toBe("asking");
    await flush();
    expect(r.mic.snapshot()).toMatchObject({ state: "recording", began: 1000 });
    r.frame(1280, 0.7);
    expect(r.levels).toContain(0.7);
    expect(r.sockets[0]!.frames()).toHaveLength(0);
    r.sockets[0]!.open();
    expect(r.sockets[0]!.frames()).toHaveLength(1);
    r.frame();
    expect(r.sockets[0]!.frames()).toHaveLength(2);
    r.sockets[0]!.say(frame("ready"));
    r.sockets[0]!.say(frame("partial", { text: "what is", offset_ms: 0 }));
    r.sockets[0]!.say(frame("partial", { text: "what is the cross", offset_ms: 0 }));
    r.sockets[0]!.say(frame("final", { text: "what is the crossing count", offset_ms: 0, duration_ms: 1500 }));
    r.sockets[0]!.say(frame("partial", { text: "please", offset_ms: 1600 }));
    expect(got.map((g) => g[0])).toEqual(["what is", "what is the cross", "what is the crossing count", "what is the crossing count please"]);
    expect(got.every((g) => g[1] === false)).toBe(true);
    expect(r.mic.snapshot().state).toBe("recording");
  });

  it("on stop sends end, waits for done, then hands over the settled text and lets everything go", async () => {
    const r = rig();
    const got: [string, boolean, string | undefined][] = [];
    r.mic.toggle("gluck/a", (t, f, id) => got.push([t, f, id]));
    await flush();
    r.sockets[0]!.open();
    r.frame();
    r.mic.toggle("gluck/a", () => {});
    expect(r.sockets[0]!.texts()).toEqual([{ type: "end" }]);
    expect(r.mic.snapshot().state).toBe("transcribing");
    expect(r.stopped).toEqual(["capture"]);
    expect(r.tracks).toEqual(["stopped"]);
    r.sockets[0]!.say(frame("done", { audio_id: "x", duration_ms: 1500, text: " what is the crossing count " }));
    expect(got[got.length - 1]).toEqual(["what is the crossing count", true, "x"]);
    expect(r.seen.map((s) => s.state)).toEqual(["asking", "recording", "transcribing", "idle"]);
    expect(r.mic.snapshot().note).toBe("");
    expect(r.sockets[0]!.closed).toEqual([1000]);
    expect(r.recording).toEqual([true, false]);
    expect(r.levels[r.levels.length - 1]).toBe(0);
  });

  it("keeps up to two seconds of audio for a slow socket and drops the oldest beyond it", async () => {
    const r = rig();
    r.mic.toggle("t", () => {});
    await flush();
    for (let i = 0; i < QUEUE_FRAMES + 20; i++) r.frame();
    r.sockets[0]!.open();
    expect(r.sockets[0]!.frames()).toHaveLength(QUEUE_FRAMES);
  });

  it("gives up waiting for done and keeps what was heard", async () => {
    const r = rig();
    const got: string[] = [];
    r.mic.toggle("t", (t) => got.push(t));
    await flush();
    r.sockets[0]!.open();
    r.sockets[0]!.say(frame("final", { text: "kept words" }));
    r.mic.toggle("t", () => {});
    const wait = r.timers[r.timers.length - 1]!;
    expect(wait.ms).toBe(FINISH_WAIT_MS);
    wait.fn();
    expect(got[got.length - 1]).toBe("kept words");
    expect(r.mic.snapshot().state).toBe("idle");
  });

  it("stops by itself at the clip cap", async () => {
    const r = rig();
    r.mic.toggle("t", () => {});
    await flush();
    r.timers[0]!.fn();
    expect(r.mic.snapshot().state).toBe("transcribing");
  });

  it("says why when the browser cannot stream or the user refuses", async () => {
    const bare = new Dictation({ media: { devices: undefined, streaming: false }, now: () => 0, open: () => new FakeSocket("x"), capture: async () => ({ stop() {} }), recording: () => {}, level: () => {}, setTimeout: () => 0, clearTimeout: () => {} });
    expect(bare.snapshot().state).toBe("unsupported");
    bare.toggle("t", () => {});
    expect(bare.snapshot().state).toBe("unsupported");
    const r = rig({ media: { devices: { getUserMedia: () => Promise.reject(Object.assign(new Error("x"), { name: "NotAllowedError" })) }, streaming: true } });
    r.mic.toggle("t", () => {});
    await flush();
    expect(r.mic.snapshot().state).toBe("idle");
    expect(r.mic.snapshot().note).toContain("Microphone blocked");
    expect(r.recording).toEqual([true, false]);
    expect(r.sockets[0]!.closed).toEqual([1000]);
  });

  it("turns a server error into a note, keeping the words so far", async () => {
    const r = rig();
    const got: [string, boolean][] = [];
    r.mic.toggle("t", (t, f) => got.push([t, f]));
    await flush();
    r.sockets[0]!.open();
    r.sockets[0]!.say(frame("final", { text: "some words" }));
    r.sockets[0]!.say(frame("error", { code: "idle", text: "no audio for 10 s" }));
    expect(got[got.length - 1]).toEqual(["some words", true]);
    expect(r.mic.snapshot()).toMatchObject({ state: "idle", note: "No sound was heard." });
    const busy = rig();
    busy.mic.toggle("t", () => {});
    await flush();
    busy.sockets[0]!.say(frame("error", { code: "busy", text: "" }));
    expect(busy.mic.snapshot().note).toBe("Dictation is busy. Try again in a moment.");
  });

  it("reports a dropped socket, and an empty done", async () => {
    const r = rig();
    r.mic.toggle("t", () => {});
    await flush();
    r.sockets[0]!.drop();
    expect(r.mic.snapshot()).toMatchObject({ state: "idle", note: "Dictation connection lost." });
    const e = rig();
    e.mic.toggle("t", () => {});
    await flush();
    e.mic.toggle("t", () => {});
    e.sockets[0]!.say(frame("done", { text: "  " }));
    expect(e.mic.snapshot().note).toBe("Heard no words. Try again.");
  });

  it("cancel tells the server, hands over nothing and lets the mic go", async () => {
    const r = rig();
    const got: string[] = [];
    r.mic.toggle("t", (t) => got.push(t));
    await flush();
    r.sockets[0]!.open();
    r.mic.cancel();
    expect(r.sockets[0]!.texts()).toEqual([{ type: "cancel" }]);
    expect(got).toEqual([]);
    expect(r.mic.snapshot()).toMatchObject({ state: "idle", note: "" });
    expect(r.tracks).toEqual(["stopped"]);
  });

  it("a permission that arrives after cancel is let go at once", async () => {
    const r = rig();
    r.mic.toggle("t", () => {});
    r.mic.cancel();
    await flush();
    expect(r.tracks).toEqual(["stopped"]);
    expect(r.mic.snapshot().state).toBe("idle");
  });
});

describe("dictation helpers", () => {
  it("builds the stream url on the gateway's stt route with the aria, a valid language and the session", () => {
    const u = dictationSocketUrl("stt", "gluck/abc", "en-US", "https://fig.example/chat/");
    expect(u.href).toBe("wss://fig.example/chat/stt/stream?aria=gluck%2Fabc&lang=en-US");
    expect(dictationSocketUrl("stt/", "g/a", "zh-Hans-CN", "http://h/chat/").searchParams.get("lang")).toBe("en-US");
  });

  it("joins dictation to a draft, explains faults and server codes", () => {
    expect(joinDictation("typed", "more")).toBe("typed more");
    expect(joinDictation("", "more")).toBe("more");
    expect(micFault(Object.assign(new Error("x"), { name: "NotFoundError" }))).toBe("No microphone found.");
    expect(streamFault("too-long", "")).toBe("Stopped at the length limit.");
    expect(streamFault("weird", "boom")).toBe("Dictation failed: boom");
  });

  it("re-transcribes a stored clip by key", async () => {
    const f = (async (url: string) => (url === "stt/key/gluck/a%3A1/in" ? new Response(JSON.stringify({ text: "hi" }), { status: 200 }) : new Response(JSON.stringify({ error: "nope" }), { status: 404 }))) as unknown as typeof fetch;
    expect((await retranscribe("stt", "gluck/a:1/in", f)).text).toBe("hi");
    await expect(retranscribe("stt", "gluck/a:1/out", f)).rejects.toBeInstanceOf(SttError);
  });
});
