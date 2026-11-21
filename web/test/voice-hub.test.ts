import { describe, expect, it } from "vitest";
import { AudioSession } from "../src/lib/audio-session";
import { VoiceHub, type SpokenNode } from "../src/lib/voice-hub";
import type { SpeechHandlers, SpeechTransport, VoceApi, VoceOptions, VocePlayer } from "../src/lib/nodi-types";

const ARIA = "c0ffee01".repeat(4);
const FMT = { format: "pcm", rate: 24000, bits: 16, channels: 1 };

function rig(opts: { slots?: boolean } = {}) {
  const log: string[] = [];
  const doc = document.implementation.createHTMLDocument("t");
  const slots = new Map<string, HTMLElement>();
  const addSlot = (turn: number, node: number) => {
    const el = doc.createElement("div");
    slots.set(turn + ":" + node, el);
    return el;
  };
  if (opts.slots !== false) {
    addSlot(27, 1);
    addSlot(28, 1);
  }
  const changes = new Map<number, VoceOptions["change"]>();
  let n = 0;
  const voce = {
    create(_d: Document, o: VoceOptions): VocePlayer {
      const id = ++n;
      const el = doc.createElement("div");
      changes.set(id, o.change);
      let state = "none";
      const set = (s: string) => {
        state = s;
        o.change?.(s, "x");
      };
      return {
        el,
        start: () => (log.push("p" + id + " start"), set("live"), true),
        push: () => (log.push("p" + id + " push"), true),
        end: (key: string) => (log.push("p" + id + " end " + key), set(state === "none" ? "idle" : "draining")),
        fail: () => log.push("p" + id + " fail"),
        stop: () => (log.push("p" + id + " stop"), set("idle")),
        play: () => (log.push("p" + id + " play"), set("playing")),
        pause: () => {},
        destroy: () => log.push("p" + id + " destroy"),
        speaking: () => state === "live",
        state: () => state,
      };
    },
    unlock: () => null,
  } as unknown as VoceApi;
  let handlers!: SpeechHandlers;
  const conn = { voice: (on: boolean) => log.push("voice " + on), cancel: () => log.push("cancel"), close: () => log.push("close") };
  const transport: SpeechTransport = { open: (_c, h) => ((handlers = h), conn) };
  const session = new AudioSession({ setType: () => {}, ping: () => log.push("ping") });
  const spoken: (SpokenNode | null)[] = [];
  const hub = new VoiceHub(
    {
      doc,
      voce,
      session,
      audioSrc: (k) => "audio/key/" + k,
      audioStatus: async () => 200,
      speaking: (s) => spoken.push(s),
      slot: (t, nd) => slots.get(t + ":" + nd) ?? null,
      firstSlot: (t) => [...slots.entries()].find(([k]) => k.startsWith(t + ":"))?.[1] ?? null,
      wait: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 2))),
    },
    ARIA,
    "gluck",
    transport,
  );
  const start = (turn: number, node = 1) => handlers.start!({ aria: ARIA, turn, key: "gluck/" + ARIA + ":" + turn + "/out", node, cursor: turn + ".2", ...FMT });
  const chunk = (turn: number, node = 1, chars = 5) => handlers.chunk!({ aria: ARIA, turn, node, chars, cursor: "x", offset: 0, bytes: 4, pcm: new ArrayBuffer(4) });
  const end = (turn: number) => handlers.end!({ aria: ARIA, turn, key: "gluck/" + ARIA + ":" + turn + "/out" });
  return { hub, session, log, spoken, slots, addSlot, handlers: () => handlers, start, chunk, end, changes };
}

const settle = () => new Promise((r) => setTimeout(r, 20));

describe("the voice hub", () => {
  it("speaks a reply into the prose slot of its node and marks the node while it is heard", async () => {
    const r = rig();
    r.start(27);
    r.chunk(27);
    r.chunk(27, 1, 12);
    r.end(27);
    await settle();
    expect(r.log).toEqual(["p1 start", "p1 push", "p1 push", "p1 end gluck/" + ARIA + ":27/out"]);
    expect(r.slots.get("27:1")!.querySelector("[data-for='27']")).toBeTruthy();
    expect(r.spoken).toEqual([{ turn: 27, node: 1, chars: 5 }, { turn: 27, node: 1, chars: 12 }, null]);
  });

  it("waits for the prose node to be drawn before it starts", async () => {
    const r = rig({ slots: false });
    r.start(27);
    r.chunk(27);
    await settle();
    expect(r.log).toEqual([]);
    r.addSlot(27, 1);
    await settle();
    expect(r.log).toEqual(["p1 start", "p1 push"]);
  });

  it("with hands-free on, pings before each arriving reply and keeps the order", async () => {
    const r = rig();
    r.session.setHandsFree(true);
    r.start(27);
    r.start(28);
    r.chunk(28);
    r.chunk(27);
    await settle();
    expect(r.log.filter((l) => l === "ping")).toHaveLength(2);
    expect(r.log.indexOf("ping")).toBeLessThan(r.log.indexOf("p1 start"));
    const played = r.log.filter((l) => l !== "ping");
    expect(played.indexOf("p1 start")).toBeLessThan(played.indexOf("p2 start"));
    expect(played.filter((l) => l.startsWith("p1"))).toEqual(["p1 start", "p1 push"]);
    expect(played.filter((l) => l.startsWith("p2"))).toEqual(["p2 start", "p2 push"]);
  });

  it("holds a reply that arrives while recording, then one ping and the held replies in arrival order", async () => {
    const r = rig();
    r.session.setHandsFree(true);
    r.session.setRecording(true);
    r.start(27);
    r.chunk(27);
    r.start(28);
    r.chunk(28);
    r.end(27);
    await settle();
    expect(r.log).toEqual([]);
    expect(r.session.phase()).toBe("recording-with-pending");
    r.session.setRecording(false);
    await settle();
    expect(r.log[0]).toBe("ping");
    expect(r.log.filter((l) => l === "ping")).toHaveLength(1);
    const played = r.log.slice(1);
    expect(played.indexOf("p1 start")).toBeLessThan(played.indexOf("p2 start"));
    expect(played.filter((l) => l.startsWith("p1"))).toEqual(["p1 start", "p1 push", "p1 end gluck/" + ARIA + ":27/out"]);
    expect(played.filter((l) => l.startsWith("p2"))).toEqual(["p2 start", "p2 push"]);
    expect(r.session.heldKeys()).toEqual([]);
  });

  it("without hands-free a reply during recording is not held and not pinged", async () => {
    const r = rig();
    r.session.setRecording(true);
    r.start(27);
    await settle();
    expect(r.log).toEqual(["p1 start"]);
  });

  it("stops the player when the gateway cancels, and ignores what was queued behind", async () => {
    const r = rig();
    r.start(27);
    r.chunk(27);
    await settle();
    r.handlers().cancel!({ aria: ARIA, turn: 27, key: "k", why: "interrupt" });
    r.chunk(27);
    await settle();
    expect(r.log).toEqual(["p1 start", "p1 push", "p1 stop", "p1 end "]);
    expect(r.spoken.at(-1)).toBeNull();
  });

  it("drops a held reply the gateway cancels before it ever plays", async () => {
    const r = rig();
    r.session.setHandsFree(true);
    r.session.setRecording(true);
    r.start(27);
    r.chunk(27);
    r.handlers().cancel!({ aria: ARIA, turn: 27, key: "k", why: "interrupt" });
    r.session.setRecording(false);
    await settle();
    expect(r.log).toEqual([]);
  });

  it("fails the player when speech errors mid-reply", async () => {
    const r = rig();
    r.start(27);
    await settle();
    r.handlers().error!({ aria: ARIA, turn: 27, code: "speech", text: "down" });
    expect(r.log).toEqual(["p1 start", "p1 fail"]);
  });

  it("turning the voice off silences what is speaking", async () => {
    const r = rig();
    r.start(27);
    await settle();
    r.hub.voice(false);
    expect(r.log).toEqual(["p1 start", "voice false", "p1 stop"]);
  });

  it("reports playing to the session while a clip is active", async () => {
    const r = rig();
    r.start(27);
    await settle();
    expect(r.session.phase()).toBe("playing");
    r.end(27);
    r.hub.voice(false);
    await settle();
    expect(r.session.phase()).toBe("idle");
  });

  it("replays a turn by its key, and plays the live player again when it is there", async () => {
    const r = rig();
    r.hub.replay(28);
    expect(r.log).toEqual(["p1 end gluck/" + ARIA + ":28/out", "p1 play"]);
    r.hub.replay(28);
    expect(r.log.at(-1)).toBe("p1 play");
    expect(r.log.filter((l) => l.includes("end")).length).toBe(1);
    r.hub.replay(99);
    expect(r.log.length).toBe(3);
  });

  it("cancel goes to the gateway and close lets everything go", async () => {
    const r = rig();
    r.start(27);
    await settle();
    r.hub.cancel();
    r.hub.close();
    expect(r.log.slice(-3)).toEqual(["cancel", "close", "p1 destroy"]);
  });
});
