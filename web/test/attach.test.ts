import { describe, expect, it, vi } from "vitest";
import { AttachError, ID_TTL_MS, MAX_BYTES, imagesIn, problemWith, stale, uploadFile, kindWord } from "zanni-react/jotai";
import { bytes } from "zanni-react";

const reply = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("bytes and kindWord", () => {
  it("reads bytes the way a person does", () => {
    expect(bytes(512)).toBe("512 B");
    expect(bytes(1536)).toBe("1.5 KB");
    expect(bytes(250 * 1024)).toBe("250 KB");
    expect(bytes(3.2 * 1024 * 1024)).toBe("3.2 MB");
    expect(kindWord("pdf")).toBe("PDF");
    expect(kindWord("image")).toBe("Photo");
    expect(kindWord("")).toBe("File");
  });
});

describe("problemWith", () => {
  it("refuses a ninth file, an oversize one and an empty one, in words", () => {
    expect(problemWith({ name: "a.png", size: 10 }, 7)).toBe("");
    expect(problemWith({ name: "a.png", size: 10 }, 8)).toBe("A message carries at most 8 attachments.");
    expect(problemWith({ name: "big.pdf", size: MAX_BYTES + 1 }, 0)).toBe("big.pdf is over 10 MiB.");
    expect(problemWith({ name: "none.pdf", size: 0 }, 0)).toBe("none.pdf is empty.");
  });
});

describe("imagesIn and stale", () => {
  it("counts the images held, leaving out the failed", () => {
    expect(imagesIn([{ status: "ready", images: 1, at: 0 }, { status: "uploading", images: 0, at: 0 }, { status: "failed", images: 3, at: 0 }, { status: "ready", images: 2, at: 0 }])).toBe(3);
  });

  it("calls an id stale half a minute before the gateway forgets it", () => {
    const held = { status: "ready" as const, images: 0, at: 1000 };
    expect(stale(held, 1000 + ID_TTL_MS - 31_000)).toBe(false);
    expect(stale(held, 1000 + ID_TTL_MS - 30_000)).toBe(true);
  });
});

describe("uploadFile", () => {
  const file = new File([new Uint8Array([1, 2, 3])], "my photo ü.png", { type: "image/png" });

  it("posts the file with its name URL-encoded and the session header, and returns the gateway's answer", async () => {
    const f = vi.fn(() => reply(200, { id: "abc", kind: "image", name: "my photo ü.png", bytes: 3, images: 1 }));
    const got = await uploadFile("https://x/chat/attach", file, f as never);
    expect(got).toMatchObject({ id: "abc", images: 1 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://x/chat/attach");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(file);
    expect(init.credentials).toBe("same-origin");
    const h = init.headers as Record<string, string>;
    expect(decodeURIComponent(h["X-Attach-Name"]!)).toBe("my photo ü.png");
    expect(h["Content-Type"]).toBe("image/png");
  });

  it("carries the gateway's error text as it came, and says network when there was no answer", async () => {
    await expect(uploadFile("u", file, (() => reply(415, { error: "attach a png, jpeg, gif, webp or heic image, or a pdf" })) as never)).rejects.toMatchObject({ message: "attach a png, jpeg, gif, webp or heic image, or a pdf", status: 415 });
    await expect(uploadFile("u", file, (() => reply(502, "<html>")) as never)).rejects.toMatchObject({ message: "HTTP 502" });
    await expect(uploadFile("u", file, (() => Promise.reject(new TypeError("x"))) as never)).rejects.toBeInstanceOf(AttachError);
  });
});
