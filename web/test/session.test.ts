import { describe, expect, it, vi } from "vitest";
import { SESSION_HEADER, audioKeyUrl, mintSessionId, sessionHeaders, sessionId, sessionUrl, withSession } from "zanni-react";
import { dictate, retranscribe } from "zanni-react/jotai";

const SHAPE = /^[A-Za-z0-9_-]{16}$/;

describe("session id", () => {
  it("is twelve random bytes as sixteen base64url characters, fresh each mint", () => {
    const a = mintSessionId();
    const b = mintSessionId();
    expect(a).toMatch(SHAPE);
    expect(b).toMatch(SHAPE);
    expect(a).not.toBe(b);
    expect(mintSessionId((bytes) => bytes.fill(0xfb))).toBe("-_v7-_v7-_v7-_v7");
  });

  it("is one id for the page and never touches storage", () => {
    expect(sessionId).toMatch(SHAPE);
    expect(sessionHeaders({ Accept: "x" })).toEqual({ Accept: "x", [SESSION_HEADER]: sessionId });
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain(sessionId);
    expect(JSON.stringify(Object.entries(sessionStorage))).not.toContain(sessionId);
    expect(document.cookie).not.toContain(sessionId);
  });

  it("rides a url as ?session=, once, after any query and before any fragment", () => {
    expect(withSession("audio/key/a")).toBe("audio/key/a?session=" + sessionId);
    expect(withSession("audio/key/a?x=1#t")).toBe("audio/key/a?x=1&session=" + sessionId + "#t");
    expect(withSession(withSession("audio/key/a"))).toBe("audio/key/a?session=" + sessionId);
    expect(sessionUrl(new URL("wss://h/chat/door?token=1")).href).toBe("wss://h/chat/door?token=1&session=" + sessionId);
    expect(audioKeyUrl("audio/", "gluck/ab:3/out")).toBe("audio/key/gluck/ab%3A3/out");
  });
});

describe("stt calls", () => {
  it("send the header on dictation and on re-transcription", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ text: "hi" }), { status: 200 }));
    await dictate("stt", f as unknown as typeof fetch)(new Blob(["x"], { type: "audio/webm" }), "abc");
    await retranscribe("stt", "gluck/abc:1/in", f as unknown as typeof fetch);
    const calls = f.mock.calls as unknown as [string, RequestInit][];
    expect(calls).toHaveLength(2);
    for (const [, init] of calls) expect((init.headers as Record<string, string>)[SESSION_HEADER]).toBe(sessionId);
  });
});
