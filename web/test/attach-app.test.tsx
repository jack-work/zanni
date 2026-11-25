import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/app";
import { bootAtom } from "zanni-react/jotai";
import { mockDoor, type MockCore } from "./mock";
import type { AriaClient } from "figaro-forms/aria";

const MAIN = "c0ffee01".repeat(4);
let core: MockCore & { upload(b: Uint8Array, name: string): { status: number; body: unknown }; ageAttachments(ms: number): void };
let client: AriaClient;
let uploads: { name: string; status: number }[];

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3];
const PDF = [...new TextEncoder().encode("%PDF-1.4 hello")];
const file = (name: string, bytes: number[], type = "") => new File([new Uint8Array(bytes)], name, { type });
const photo = (name = "IMG_0001.png") => file(name, PNG, "image/png");
const pdf = (name = "plan.pdf") => file(name, PDF, "application/pdf");

async function attend() {
  ({ core, client } = mockDoor(1) as never);
  uploads = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      expect(new URL(url).pathname.endsWith("/attach")).toBe(true);
      const headers = init.headers as Record<string, string>;
      const name = headers["X-Attach-Name"] ? decodeURIComponent(headers["X-Attach-Name"]) : "";
      const body = new Uint8Array(await (init.body as File).arrayBuffer());
      const out = core.upload(body, name);
      uploads.push({ name, status: out.status });
      return new Response(JSON.stringify(out.body), { status: out.status });
    }),
  );
  window.location.hash = "#/home/" + MAIN;
  const store = createStore();
  store.set(bootAtom, { stores: { home: client }, store: "home", audioUrl: "audio", sttUrl: "stt", attachUrl: "attach", mark: "" });
  render(
    <Provider store={store}>
      <App />
    </Provider>,
  );
  await waitFor(() => expect(document.querySelector(".fw")!.getAttribute("data-link")).toBe("live"));
}

const picker = () => document.querySelector<HTMLInputElement>(".fw-picker")!;
const pick = (...files: File[]) => act(async () => void fireEvent.change(picker(), { target: { files } }));
const box = () => screen.getByLabelText("Message", { selector: "textarea" }) as HTMLTextAreaElement;
const items = () => [...document.querySelectorAll<HTMLElement>(".zr-tray-item")];
const note = () => document.querySelector(".fw-status-line")?.textContent ?? "";
const sendText = async (text: string) => {
  fireEvent.change(box(), { target: { value: text } });
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Send" })));
};
const sent = () => (core.sent ?? []) as { text: string; attachments?: string[] }[];

beforeEach(() => window.localStorage.clear());

afterEach(() => {
  client?.close();
  window.location.hash = "";
  vi.unstubAllGlobals();
});

describe("attaching", () => {
  it("opens the file picker from the attach pill, for photos and PDFs", async () => {
    await attend();
    const click = vi.spyOn(picker(), "click");
    fireEvent.click(screen.getByRole("button", { name: "Attach" }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(picker().accept).toContain("image/*");
    expect(picker().accept).toContain("application/pdf");
    expect(picker().multiple).toBe(true);
  });

  it("uploads each pick at once and shows it as a chip with its kind and size, then sends the ids with the text and the reply names them", async () => {
    await attend();
    await pick(photo(), pdf());
    await waitFor(() => expect(items().map((i) => i.dataset.status)).toEqual(["ready", "ready"]));
    expect(items()[0]!.textContent).toContain("IMG_0001.png");
    expect(items()[0]!.textContent).toContain("Photo");
    expect(items()[1]!.textContent).toContain("PDF");
    expect(items()[1]!.textContent).toMatch(/\d+ B/);
    await sendText("what do these say");
    await waitFor(() => expect(sent()[0]?.attachments).toEqual(["IMG_0001.png", "plan.pdf"]));
    expect(sent()[0]!.text).toBe("what do these say");
    await waitFor(() => expect(items()).toHaveLength(0));
    await waitFor(() => expect(document.querySelector('.nodi-turn[data-turn="27"]')?.textContent).toContain("I read IMG_0001.png (image) and plan.pdf (pdf, 2 pages)."), { timeout: 5000 });
    expect(document.querySelector('.nodi-turn[data-turn="27"] .nodi-input')!.textContent).toContain("what do these say");
    expect(box().value).toBe("");
  });

  it("removes a chip before send, and sends the rest", async () => {
    await attend();
    await pick(photo("a.png"), photo("b.png"));
    await waitFor(() => expect(items().every((i) => i.dataset.status === "ready")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Remove a.png" }));
    expect(items().map((i) => i.textContent)).toEqual([expect.stringContaining("b.png")]);
    await sendText("just one");
    await waitFor(() => expect(sent()[0]?.attachments).toEqual(["b.png"]));
  });

  it("sends nothing and says so when there is no text, and keeps the chips", async () => {
    await attend();
    await pick(pdf());
    await waitFor(() => expect(items()[0]!.dataset.status).toBe("ready"));
    fireEvent.change(box(), { target: { value: "  " } });
    fireEvent.submit(document.querySelector("form.fw-composer")!);
    await waitFor(() => expect(note()).toBe("Add a message to send the attachments with."));
    expect(sent()).toEqual([]);
    expect(items()).toHaveLength(1);
  });

  it("shows the gateway's own words when it refuses a file, and the chip can be removed", async () => {
    await attend();
    await pick(file("notes.txt", [104, 105, 106], "text/plain"));
    await waitFor(() => expect(items()[0]!.dataset.status).toBe("failed"));
    expect(items()[0]!.textContent).toContain("attach a png, jpeg, gif, webp or heic image, or a pdf");
    fireEvent.change(box(), { target: { value: "hello" } });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Send" })));
    await waitFor(() => expect(note()).toBe("notes.txt: attach a png, jpeg, gif, webp or heic image, or a pdf. Remove it to send the rest."));
    expect(sent()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Remove notes.txt" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Send" })));
    await waitFor(() => expect(sent()[0]?.text).toBe("hello"));
    expect(sent()[0]!.attachments).toEqual([]);
  });

  it("keeps to four images: the fifth is refused with the limit, a PDF is not an image", async () => {
    await attend();
    await pick(photo("1.png"), photo("2.png"), photo("3.png"), photo("4.png"), photo("5.png"), pdf());
    await waitFor(() => expect(items().every((i) => i.dataset.status !== "uploading")).toBe(true));
    expect(items().map((i) => i.dataset.status)).toEqual(["ready", "ready", "ready", "ready", "failed", "ready"]);
    expect(items()[4]!.textContent).toContain("A message carries at most 4 images.");
  });

  it("keeps to eight files and says so", async () => {
    await attend();
    await pick(...Array.from({ length: 9 }, (_, i) => pdf("p" + i + ".pdf")));
    await waitFor(() => expect(items()).toHaveLength(8));
    await waitFor(() => expect(note()).toBe("A message carries at most 8 attachments."));
    await waitFor(() => expect(items().every((i) => i.dataset.status === "ready")).toBe(true));
    expect((screen.getByRole("button", { name: "Attach" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("refuses a file over 10 MiB without uploading it", async () => {
    await attend();
    const big = file("huge.pdf", PDF, "application/pdf");
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    await pick(big);
    await waitFor(() => expect(note()).toBe("huge.pdf is over 10 MiB."));
    expect(items()).toHaveLength(0);
    expect(uploads).toEqual([]);
  });

  it("sends again from the file when the id is older than the gateway keeps it", async () => {
    await attend();
    await pick(pdf());
    await waitFor(() => expect(items()[0]!.dataset.status).toBe("ready"));
    core.ageAttachments(16 * 60 * 1000);
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 16 * 60 * 1000);
    await sendText("still there?");
    await waitFor(() => expect(uploads).toHaveLength(2));
    await waitFor(() => expect(sent()[0]?.attachments).toEqual(["plan.pdf"]));
  });

  it("says so, and keeps the chips, when the gateway refuses the ids", async () => {
    await attend();
    await pick(photo());
    await waitFor(() => expect(items()[0]!.dataset.status).toBe("ready"));
    core.ageAttachments(16 * 60 * 1000);
    await sendText("hello");
    await waitFor(() => expect(note()).toBe("Not sent: gateway: an attachment is unknown, already sent or expired"));
    expect(items()).toHaveLength(1);
    expect(box().value).toBe("hello");
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Send" })));
    await waitFor(() => expect(uploads).toHaveLength(2));
    await waitFor(() => expect(sent()[0]?.attachments).toEqual(["IMG_0001.png"]));
  });

  it("holds Send while an upload is running", async () => {
    await attend();
    fireEvent.change(box(), { target: { value: "wait for it" } });
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const first = (window.fetch as unknown as ReturnType<typeof vi.fn>).getMockImplementation()!;
    (window.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (...a: unknown[]) => {
      await gate;
      return (first as (...x: unknown[]) => Promise<Response>)(...a);
    });
    await pick(pdf());
    expect(items()[0]!.dataset.status).toBe("uploading");
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => release());
    await waitFor(() => expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(false));
  });
});
