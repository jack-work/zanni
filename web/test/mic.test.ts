import { describe, expect, it } from "vitest";
import { joinDictation, Mic, micFault, micType, type MicDeps, type MicSnapshot } from "zanni-react/jotai";
import { dictate, retranscribe, SttError } from "zanni-react/jotai";

class FakeRecorder extends EventTarget {
  static types = ["audio/webm;codecs=opus"];
  static isTypeSupported(t: string) {
    return FakeRecorder.types.includes(t);
  }
  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  constructor(
    readonly stream: unknown,
    o?: { mimeType?: string },
  ) {
    super();
    this.mimeType = o?.mimeType ?? "";
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    const ev = new Event("dataavailable") as Event & { data: Blob };
    ev.data = new Blob(["abc"], { type: this.mimeType });
    this.dispatchEvent(ev);
    this.dispatchEvent(new Event("stop"));
  }
}

function rig(over: Partial<MicDeps> = {}) {
  const tracks: string[] = [];
  const recording: boolean[] = [];
  const stream = { getTracks: () => [{ stop: () => tracks.push("stopped") }] } as unknown as MediaStream;
  const timers: (() => void)[] = [];
  const deps: MicDeps = {
    media: { devices: { getUserMedia: () => Promise.resolve(stream) }, Recorder: FakeRecorder as unknown as typeof MediaRecorder },
    now: () => 1000,
    transcribe: async () => ({ text: " what is the crossing count " }),
    recording: (on) => recording.push(on),
    setTimeout: (fn) => {
      timers.push(fn);
      return timers.length;
    },
    clearTimeout: () => {},
    ...over,
  };
  const mic = new Mic(deps);
  const seen: MicSnapshot[] = [];
  mic.subscribe((s) => seen.push(s));
  return { mic, tracks, recording, timers, seen };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("mic", () => {
  it("records, transcribes and hands the text over, releasing the microphone and the session", async () => {
    const { mic, tracks, recording, seen } = rig();
    const got: string[] = [];
    expect(mic.snapshot().state).toBe("idle");
    mic.toggle("gluck/a", (t) => got.push(t));
    expect(mic.snapshot().state).toBe("asking");
    await flush();
    expect(mic.snapshot()).toMatchObject({ state: "recording", began: 1000 });
    mic.toggle("gluck/a", (t) => got.push(t));
    await flush();
    await flush();
    expect(got).toEqual(["what is the crossing count"]);
    expect(seen.map((s) => s.state)).toEqual(["asking", "recording", "transcribing", "idle"]);
    expect(mic.snapshot().note).toBe("");
    expect(tracks).toEqual(["stopped"]);
    expect(recording).toEqual([true, false]);
  });

  it("says why when the browser cannot record or the user refuses", async () => {
    const bare = new Mic({ media: { devices: undefined, Recorder: undefined }, now: () => 0, transcribe: async () => ({}), recording: () => {}, setTimeout: () => 0, clearTimeout: () => {} });
    expect(bare.snapshot().state).toBe("unsupported");
    bare.toggle("t", () => {});
    expect(bare.snapshot().state).toBe("unsupported");
    const { mic, recording } = rig({ media: { devices: { getUserMedia: () => Promise.reject(Object.assign(new Error("x"), { name: "NotAllowedError" })) }, Recorder: FakeRecorder as unknown as typeof MediaRecorder } });
    mic.toggle("gluck/a", () => {});
    await flush();
    expect(mic.snapshot().state).toBe("idle");
    expect(mic.snapshot().note).toContain("Microphone blocked");
    expect(recording).toEqual([true, false]);
  });

  it("reports an empty transcript and a failed upload", async () => {
    const empty = rig({ transcribe: async () => ({ text: "  " }) });
    empty.mic.toggle("t", () => {});
    await flush();
    empty.mic.toggle("t", () => {});
    await flush();
    await flush();
    expect(empty.mic.snapshot().note).toBe("Heard no words. Try again.");
    const down = rig({ transcribe: async () => Promise.reject(new SttError("unsupported audio type", 415)) });
    down.mic.toggle("t", () => {});
    await flush();
    down.mic.toggle("t", () => {});
    await flush();
    await flush();
    expect(down.mic.snapshot().note).toBe("Not transcribed: unsupported audio type");
  });

  it("stops by itself at the clip cap", async () => {
    const { mic, timers, seen } = rig();
    mic.toggle("t", () => {});
    await flush();
    expect(timers).toHaveLength(1);
    timers[0]!();
    await flush();
    expect(seen.map((s) => s.state)).toContain("transcribing");
  });

  it("cancel drops the clip: nothing is transcribed and the mic is let go", async () => {
    const { mic, tracks } = rig();
    const got: string[] = [];
    mic.toggle("t", (t) => got.push(t));
    await flush();
    mic.cancel();
    await flush();
    await flush();
    expect(got).toEqual([]);
    expect(mic.snapshot()).toMatchObject({ state: "idle", note: "" });
    expect(tracks).toEqual(["stopped"]);
  });

  it("a permission that arrives after cancel is let go at once", async () => {
    const { mic, tracks } = rig();
    mic.toggle("t", () => {});
    mic.cancel();
    await flush();
    expect(tracks).toEqual(["stopped"]);
    expect(mic.snapshot().state).toBe("idle");
  });

  it("picks the first supported container and explains faults", () => {
    expect(micType(FakeRecorder as unknown as typeof MediaRecorder)).toBe("audio/webm;codecs=opus");
    FakeRecorder.types = [];
    expect(micType(FakeRecorder as unknown as typeof MediaRecorder)).toBe("");
    FakeRecorder.types = ["audio/webm;codecs=opus"];
    expect(micFault({ name: "NotFoundError" })).toBe("No microphone found.");
    expect(micFault(new Error("boom"))).toBe("Could not record: boom");
  });

  it("appends dictation to what was typed with one space between", () => {
    expect(joinDictation("typed first", "what is it")).toBe("typed first what is it");
    expect(joinDictation("typed first   ", "what")).toBe("typed first what");
    expect(joinDictation("  ", "what")).toBe("what");
    expect(joinDictation("", "what")).toBe("what");
  });
});

describe("stt", () => {
  const ok = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });
  it("posts the clip with its own type to the aria's target", async () => {
    const calls: [string, RequestInit][] = [];
    const f = (async (u: string, init: RequestInit) => {
      calls.push([u, init]);
      return new Response(JSON.stringify({ text: "hi", duration_ms: 1, audio_id: "x" }), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await dictate("stt", f)(new Blob(["x"], { type: "audio/webm" }), "gluck/a b");
    expect(out.text).toBe("hi");
    expect(calls[0]![0]).toBe("stt?aria=gluck%2Fa%20b");
    expect((calls[0]![1].headers as Record<string, string>)["Content-Type"]).toBe("audio/webm");
  });

  it("throws the server's words and status", async () => {
    await expect(dictate("stt", ok({ error: "too large" }, 413) as never)(new Blob(["x"]), "t")).rejects.toMatchObject({ message: "too large", status: 413 });
    await expect(dictate("stt", (async () => new Response("<html>", { status: 502 })) as never)(new Blob(["x"]), "t")).rejects.toMatchObject({ message: "HTTP 502", status: 502 });
  });

  it("re-transcribes a stored clip by its key", async () => {
    let url = "";
    const f = (async (u: string) => {
      url = u;
      return new Response(JSON.stringify({ text: "again", duration_ms: 2, audio_id: "x" }), { status: 200 });
    }) as unknown as typeof fetch;
    expect((await retranscribe("stt", "gluck/c0ffee:3/in", f)).text).toBe("again");
    expect(url).toBe("stt/key/gluck/c0ffee%3A3/in");
    await expect(retranscribe("stt", "k", ok({ error: "no clip" }, 404) as never)).rejects.toMatchObject({ status: 404 });
  });
});
