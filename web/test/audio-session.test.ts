import { describe, expect, it } from "vitest";
import { AudioSession, pingPcm, type Held, type SessionType } from "zanni-react/jotai";

function rig() {
  const log: string[] = [];
  const types: SessionType[] = [];
  const session = new AudioSession({ setType: (t) => types.push(t), ping: () => log.push("ping") });
  const item = (key: string): Held => ({ key, release: () => log.push("play " + key) });
  return { session, log, types, item };
}

describe("the audio session machine", () => {
  it("starts idle and plays what arrives, with no ping outside hands-free", () => {
    const { session, log, item } = rig();
    expect(session.phase()).toBe("idle");
    session.arrive(item("a"));
    expect(log).toEqual(["play a"]);
  });

  it("pings before each arrival in hands-free", () => {
    const { session, log, item } = rig();
    session.setHandsFree(true);
    session.arrive(item("a"));
    session.arrive(item("b"));
    expect(log).toEqual(["ping", "play a", "ping", "play b"]);
  });

  it("holds arrivals while recording, then one ping and the held messages in arrival order", () => {
    const { session, log, item } = rig();
    session.setHandsFree(true);
    session.setRecording(true);
    expect(session.phase()).toBe("recording");
    session.arrive(item("a"));
    session.arrive(item("b"));
    expect(session.phase()).toBe("recording-with-pending");
    expect(session.heldKeys()).toEqual(["a", "b"]);
    expect(log).toEqual([]);
    session.setRecording(false);
    expect(log).toEqual(["ping", "play a", "play b"]);
    expect(session.phase()).toBe("idle");
    expect(session.heldKeys()).toEqual([]);
  });

  it("does not hold outside hands-free, recording or not", () => {
    const { session, log, item } = rig();
    session.setRecording(true);
    session.arrive(item("a"));
    expect(log).toEqual(["play a"]);
    expect(session.phase()).toBe("recording");
  });

  it("recording with nothing held ends without a ping", () => {
    const { session, log } = rig();
    session.setHandsFree(true);
    session.setRecording(true);
    session.setRecording(false);
    expect(log).toEqual([]);
  });

  it("leaving hands-free while holding plays the held messages without a ping", () => {
    const { session, log, item } = rig();
    session.setHandsFree(true);
    session.setRecording(true);
    session.arrive(item("a"));
    session.setHandsFree(false);
    expect(log).toEqual(["play a"]);
  });

  it("owns the platform session: play-and-record while hands-free or the mic is on, playback otherwise", () => {
    const { session, types } = rig();
    session.setHandsFree(true);
    expect(types.at(-1)).toBe("play-and-record");
    session.setHandsFree(false);
    expect(types.at(-1)).toBe("playback");
    session.setRecording(true);
    expect(types.at(-1)).toBe("play-and-record");
    session.setRecording(false);
    expect(types.at(-1)).toBe("playback");
    session.setHandsFree(true);
    session.setRecording(true);
    session.setRecording(false);
    expect(types.at(-1)).toBe("play-and-record");
  });

  it("reports playing while any clip is active", () => {
    const { session } = rig();
    session.clip("a", true);
    session.clip("b", true);
    expect(session.phase()).toBe("playing");
    session.clip("a", false);
    expect(session.phase()).toBe("playing");
    session.clip("b", false);
    expect(session.phase()).toBe("idle");
  });

  it("tells its listeners when the phase changes", () => {
    const { session } = rig();
    let n = 0;
    const off = session.subscribe(() => n++);
    session.setRecording(true);
    session.clip("a", true);
    off();
    session.setRecording(false);
    expect(n).toBe(2);
  });

  it("the ping is short, even-length 16-bit PCM and not silent", () => {
    const pcm = pingPcm();
    expect(pcm.byteLength % 2).toBe(0);
    expect(pcm.byteLength / 2 / 24000).toBeLessThan(0.3);
    expect(new Int16Array(pcm).some((v) => Math.abs(v) > 1000)).toBe(true);
  });
});
