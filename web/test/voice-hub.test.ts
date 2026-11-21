import { describe, expect, it } from "vitest";
import { AudioSession } from "zanni-react/jotai";
import { VoiceHub, type SpokenNode } from "../../packages/react/src/jotai/lib/voice-hub";
import type { SpeechHandlers, SpeechTransport, VoceApi, VoceOptions, VocePlayer } from "zanni-react";

const ARIA = "c0ffee01".repeat(4);
const FMT = { format: "pcm", rate: 24000, bits: 16, channels: 1 };

function rig(opts: { slots?: boolean; locked?: boolean; played?: Map<string, number> } = {}) {
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
  const expire: Record<number, () => void> = {};
  const created: VoceOptions[] = [];
  let n = 0;
  const voce = {
    create(_d: Document, o: VoceOptions): VocePlayer {
      const id = ++n;
      const el = doc.createElement("div");
      created.push(o);
      let state = o.audioId ? "idle" : "none";
      const set = (s: string) => {
        state = s;
        o.change?.(s, "x");
      };
      expire[id] = () => set("expired");
      return {
        el,
        start: () => (log.push("p" + id + " start"), opts.locked ? false : (set("live"), true)),
        push: () => (log.push("p" + id + " push"), true),
        end: (key: string) => (log.push("p" + id + " end " + key), set(state === "none" ? "idle" : "draining")),
        fail: () => log.push("p" + id + " fail"),
        stop: () => (log.push("p" + id + " stop"), set("idle")),
        play: () => (log.push("p" + id + " play"), set("playing")),
        pause: () => {},
        destroy: () => (log.push("p" + id + " destroy"), el.remove()),
        speaking: () => state === "live",
        state: () => state,
      };
    },
    unlock: () => null,
  } as unknown as VoceApi;
  let handlers!: SpeechHandlers;
  const conn = { voice: (on: boolean) => log.push("voice " + on), say: (t: number) => log.push("say " + t), cancel: () => log.push("cancel"), close: () => log.push("close") };
  const transport: SpeechTransport = { open: (_c, h) => ((handlers = h), conn) };
  const session = new AudioSession({ setType: () => {}, ping: () => log.push("ping") });
  const spoken: (SpokenNode | null)[] = [];
  const notes: string[] = [];
  const hub = new VoiceHub(
    {
      doc,
      voce,
      session,
      played: opts.played ?? new Map(),
      audioSrc: (k) => "audio/key/" + k,
      audioStatus: async () => 200,
      speaking: (s) => spoken.push(s),
      slot: (t, nd) => slots.get(t + ":" + nd) ?? null,
      firstSlot: (t) => [...slots.entries()].find(([k]) => k.startsWith(t + ":"))?.[1] ?? null,
      wait: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 2))),
      note: (t) => notes.push(t),
    },
    ARIA,
    "gluck",
    transport,
  );
  hub.voice(true);
  log.length = 0;
  const start = (turn: number, node = 1, say = false) => handlers.start!({ aria: ARIA, turn, key: "gluck/" + ARIA + ":" + turn + "/out", node, cursor: turn + ".2", ...(say ? { say: true } : {}), ...FMT });
  const sent = new Map<string, number>();
  const chunk = (turn: number, node = 1, chars = 5, from?: number) => {
    const k = turn + ":" + node;
    const offset = from ?? sent.get(k) ?? 0;
    sent.set(k, offset + 4);
    handlers.chunk!({ aria: ARIA, turn, node, chars, cursor: "x", offset, bytes: 4, pcm: new ArrayBuffer(4) });
  };
  const end = (turn: number) => handlers.end!({ aria: ARIA, turn, key: "gluck/" + ARIA + ":" + turn + "/out" });
  return { hub, session, log, spoken, notes, slots, addSlot, handlers: () => handlers, start, chunk, end, expire, created };
}

const settle = () => new Promise((r) => setTimeout(r, 20));

describe("the voice hub", () => {
  it("does not play again what an earlier hub of this page already played when the aria is rejoined", async () => {
    const played = new Map<string, number>();
    const first = rig({ played });
    first.start(27);
    first.chunk(27);
    first.chunk(27);
    await settle();
    first.hub.close();
    const again = rig({ played });
    again.start(27);
    again.chunk(27, 1, 5, 0);
    again.chunk(27, 1, 5, 4);
    again.chunk(27, 1, 5, 8);
    await settle();
    expect(again.log).toEqual(["p1 start", "p1 push"]);
    again.start(27, 1, true);
    again.chunk(27, 1, 5, 0);
    await settle();
    expect(again.log.filter((l) => l.endsWith("push"))).toHaveLength(2);
  });

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

  it("plays a turn by its key, and plays the live player again when it is there", async () => {
    const r = rig();
    r.hub.replay(28);
    expect(r.created[0]!.audioId).toBe("gluck/" + ARIA + ":28/out");
    expect(r.log).toEqual(["p1 play"]);
    r.hub.replay(28);
    expect(r.created).toHaveLength(1);
    expect(r.log.at(-1)).toBe("p1 play");
    r.hub.replay(99);
    expect(r.notes).toEqual(["That turn has nothing to say."]);
  });

  it("asks the gateway to speak a turn whose stored audio is gone, once, and plays what it speaks", async () => {
    const r = rig();
    r.session.setHandsFree(true);
    r.hub.replay(28);
    r.expire[1]!();
    expect(r.log).toEqual(["p1 play", "p1 destroy", "say 28"]);
    expect(r.slots.get("28:1")!.querySelector("[data-for='28']")).toBeNull();
    r.start(28, 1, true);
    r.chunk(28);
    r.end(28);
    await settle();
    expect(r.log.filter((l) => l === "ping")).toHaveLength(0);
    expect(r.log.slice(3)).toEqual(["p2 start", "p2 push", "p2 end gluck/" + ARIA + ":28/out"]);
  });

  it("plays a spoken turn from its stored copy when the audio context would not start the stream", async () => {
    const r = rig({ locked: true });
    r.hub.replay(28);
    r.expire[1]!();
    r.start(28, 1, true);
    r.chunk(28);
    r.end(28);
    await settle();
    expect(r.log.slice(3)).toEqual(["p2 start", "p2 push", "p2 end gluck/" + ARIA + ":28/out", "p2 play"]);
  });

  it("plays the stored copy when the gateway says it has one, and does not ask twice", async () => {
    const r = rig();
    r.hub.replay(28);
    r.expire[1]!();
    r.handlers().stored!({ aria: ARIA, turn: 28, key: "k" });
    expect(r.created).toHaveLength(2);
    expect(r.log.slice(-1)).toEqual(["p2 play"]);
    r.expire[2]!();
    expect(r.log.filter((l) => l.startsWith("say"))).toEqual(["say 28"]);
    expect(r.notes).toEqual(["No audio for this turn."]);
    r.hub.replay(28);
    r.expire[3]!();
    expect(r.log.filter((l) => l.startsWith("say"))).toEqual(["say 28", "say 28"]);
  });

  it("puts the gateway's reason for refusing in a note", async () => {
    const r = rig();
    r.hub.replay(28);
    r.expire[1]!();
    r.handlers().error!({ aria: ARIA, turn: 28, code: "open", text: "turn is open" });
    r.hub.replay(27);
    r.expire[2]!();
    r.handlers().error!({ aria: ARIA, turn: 27, code: "silent", text: "no prose" });
    r.addSlot(26, 1);
    r.hub.replay(26);
    r.expire[3]!();
    r.handlers().error!({ aria: ARIA, turn: 26, code: "busy", text: "x" });
    expect(r.notes).toEqual(["That turn is still running.", "That turn has nothing to say.", "Speech is busy. Try again."]);
  });

  it("ignores a live reply the gateway speaks while the voice is off, but plays one it was asked for", async () => {
    const r = rig();
    r.hub.voice(false);
    r.log.length = 0;
    r.start(27);
    r.chunk(27);
    await settle();
    expect(r.log).toEqual([]);
    r.start(28, 1, true);
    await settle();
    expect(r.log).toEqual(["p1 start"]);
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
