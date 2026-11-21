import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/app";
import { bootAtom } from "zanni-react/jotai";
import { mockDoor, type MockCore } from "./mock";
import type { AriaClient } from "figaro-forms/aria";

const MAIN = "c0ffee01".repeat(4);
let core: MockCore;
let client: AriaClient;

async function attend() {
  ({ core, client } = mockDoor(1));
  window.location.hash = "#/gluck/" + MAIN;
  const store = createStore();
  store.set(bootAtom, { stores: { gluck: client }, store: "gluck", audioUrl: "audio", sttUrl: "stt", mark: "" });
  render(
    <Provider store={store}>
      <App />
    </Provider>,
  );
  await waitFor(() => expect(document.querySelector(".fw")!.getAttribute("data-link")).toBe("live"));
  await waitFor(() => expect(document.querySelector(".fw-status-handle")).toBeTruthy());
}

const box = () => screen.getByLabelText("Message", { selector: "textarea" }) as HTMLTextAreaElement;
const pill = () => screen.getByRole("button", { name: "Command" });
const typed = (text: string) => fireEvent.change(box(), { target: { value: text } });
const run = async (line: string) => {
  typed(pill().getAttribute("aria-pressed") === "true" ? line : ":" + line);
  await act(async () => {
    fireEvent.keyDown(box(), { key: "Enter" });
  });
};
const reason = () => document.querySelector(".zr-hint[data-refused]")?.textContent ?? "";
const sets = () => (core as MockCore & { sets?: { keys: string[] }[] }).sets ?? [];

afterEach(() => {
  client?.close();
  window.location.hash = "";
  window.localStorage.clear();
});

describe("command mode in the composer", () => {
  it("is entered by typing : on an empty composer, shows the verbs, and Escape leaves it with the draft untouched", async () => {
    await attend();
    expect(pill().getAttribute("aria-pressed")).toBe("false");
    typed(":");
    expect(pill().getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector("form.fw-composer")!.getAttribute("data-mode")).toBe("command");
    expect(document.querySelector(".zr-prompt")!.textContent).toBe(":");
    expect(box().value).toBe("");
    expect(screen.getByRole("button", { name: "Run" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("group", { name: "Completions" }).querySelector(".zr-chip")!.textContent).toBeTruthy();
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(pill().getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector(".zr-prompt")).toBeNull();
  });

  it("is entered and left by the command pill, and a typed message survives the visit", async () => {
    await attend();
    typed("half a thought");
    fireEvent.click(pill());
    expect(pill().getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(box());
    expect(box().value).toBe("");
    fireEvent.click(pill());
    expect(box().value).toBe("half a thought");
  });

  it("completes a verb from its chip and with Tab", async () => {
    await attend();
    typed(":fo");
    fireEvent.click(document.querySelector<HTMLElement>(".zr-chip")!);
    expect(box().value).toBe("fork ");
    typed("unse");
    fireEvent.keyDown(box(), { key: "Tab" });
    expect(box().value).toBe("unset ");
    expect(document.querySelector(".zr-hint-usage")!.textContent).toContain("unset [--id <id>] <key>");
  });

  it(":set mantra x writes through the bound form and leaves command mode", async () => {
    await attend();
    await run("set mantra x");
    await waitFor(() => expect(sets()[0]?.keys).toEqual(["mantra"]));
    await waitFor(() => expect(pill().getAttribute("aria-pressed")).toBe("false"));
    expect(document.querySelector(".zr-strip-text")!.textContent).toBe("Set mantra.");
  });

  it(":set on a key the door will not write shows the refusal in place and stays in command mode", async () => {
    await attend();
    await run("set system.model x");
    await waitFor(() => expect(reason()).toMatch(/^system\.model is read-only here: /));
    expect(pill().getAttribute("aria-pressed")).toBe("true");
    expect(box().value).toBe("set system.model x");
  });

  it(":fork :12 forks the open aria at turn 12 and attends the fork at its end", async () => {
    await attend();
    await run("fork :12");
    await waitFor(() => expect(core.calls.some((c) => c.method === "figaro.fork")).toBe(true));
    const call = core.calls.find((c) => c.method === "figaro.fork")!;
    expect(call.params).toMatchObject({ figaro_id: MAIN });
    await waitFor(() => expect(window.location.hash).toMatch(new RegExp("^#/gluck/[0-9a-f]{32}$")));
    expect(window.location.hash).not.toContain(MAIN);
    expect(pill().getAttribute("aria-pressed")).toBe("false");
  });

  it(":fork 12 reads 12 as an aria id prefix, as the pager does, and forks nothing when none matches", async () => {
    await attend();
    await run("fork 12");
    await waitFor(() => expect(reason()).toBe("fork: no aria matches 12."));
    expect(pill().getAttribute("aria-pressed")).toBe("true");
    expect(core.calls.filter((c) => c.method === "figaro.fork")).toEqual([]);
  });

  it(":fork c0ffee02 reads c0ffee02 as an aria id prefix and forks that aria", async () => {
    await attend();
    await run("ls");
    await waitFor(() => expect(document.querySelector(".zr-pit")!.textContent).not.toContain("Loading the topology"), { timeout: 4500 });
    await run("fork c0ffee02");
    await waitFor(() => expect(core.calls.some((c) => c.method === "figaro.fork")).toBe(true), { timeout: 4500 });
    expect(core.calls.find((c) => c.method === "figaro.fork")!.params).toMatchObject({ figaro_id: "c0ffee02".repeat(4) });
  });

  it("Enter on an empty command line leaves command mode and runs nothing", async () => {
    await attend();
    typed(":");
    await act(async () => {
      fireEvent.keyDown(box(), { key: "Enter" });
    });
    expect(pill().getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector(".zr-prompt")).toBeNull();
    expect(core.calls.filter((c) => c.method === "figaro.fork")).toEqual([]);
  });

  it("the first Escape closes the completion chips and keeps the line, the second leaves; typing or Tab brings the chips back", async () => {
    await attend();
    typed(":fo");
    expect(screen.getByRole("group", { name: "Completions" }).querySelector(".zr-chip")).toBeTruthy();
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(pill().getAttribute("aria-pressed")).toBe("true");
    expect(box().value).toBe("fo");
    expect(document.querySelector(".zr-chip")).toBeNull();
    fireEvent.keyDown(box(), { key: "Tab" });
    expect(document.querySelector(".zr-chip")).toBeTruthy();
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(document.querySelector(".zr-chip")).toBeNull();
    typed("for");
    expect(document.querySelector(".zr-chip")).toBeTruthy();
    fireEvent.keyDown(box(), { key: "Escape" });
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(pill().getAttribute("aria-pressed")).toBe("false");
    expect(document.querySelector(".zr-prompt")).toBeNull();
  });

  it(":fork --stay :12 forks and stays where it is", async () => {
    await attend();
    await run("fork --stay :12");
    await waitFor(() => expect(core.calls.some((c) => c.method === "figaro.fork")).toBe(true));
    await waitFor(() => expect(pill().getAttribute("aria-pressed")).toBe("false"));
    expect(window.location.hash).toBe("#/gluck/" + MAIN);
  });

  it(":new mints a figaro and attends it", async () => {
    await attend();
    await run("new -O sonn5-kic");
    await waitFor(() => expect(core.calls.some((c) => c.method === "figaro.fork")).toBe(true));
    expect(core.calls.find((c) => c.method === "figaro.fork")!.params).toMatchObject({ outfits: ["sonn5-kic"] });
    await waitFor(() => expect(window.location.hash).not.toBe("#/gluck/" + MAIN));
  });

  it(":ls opens the tree in the pit", async () => {
    await attend();
    await run("ls");
    await waitFor(() => expect(document.querySelector(".zr-pit[data-snap='half']")).toBeTruthy());
    expect(document.querySelector(".zr-pit")!.textContent).toContain("Tree");
    expect(pill().getAttribute("aria-pressed")).toBe("false");
  });

  it(":state opens the state view, :help lists every command", async () => {
    await attend();
    await run("state");
    await waitFor(() => expect(document.querySelector(".zr-pit")!.textContent).toContain("State"));
    await run("help");
    const sheet = await screen.findByRole("dialog", { name: "Commands" });
    expect(sheet.textContent).toContain("fork");
    expect(sheet.querySelector(".fw-help-row[data-off]")!.textContent).toMatch(/kill|replay|queue/);
  });

  it("shows why a refused verb cannot run, while typing it and when it is run, and stays put", async () => {
    await attend();
    typed(":kill ");
    expect(reason()).toMatch(/delegated door refuses/);
    await run("kill");
    expect(reason()).toMatch(/delegated door refuses/);
    expect(pill().getAttribute("aria-pressed")).toBe("true");
    await run("frobnicate");
    expect(reason()).toBe("frobnicate: no such command. :help lists them.");
    expect(core.calls.filter((c) => c.method === "figaro.fork")).toEqual([]);
  });

  it("answers :get and :hup, and never sends the command line as a message", async () => {
    await attend();
    await run("get mantra");
    await waitFor(() => expect(document.querySelector(".zr-strip-text")!.textContent).toContain("Zanni"));
    expect(core.sent ?? []).toEqual([]);
  });
});
